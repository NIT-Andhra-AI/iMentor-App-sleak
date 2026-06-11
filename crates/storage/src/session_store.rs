use std::path::Path;

use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::migrations::get_migrations;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Session {
    pub id: String,
    pub created_at: String,
    pub updated_at: String,
    pub mode: String,
    pub title: Option<String>,
    pub message_count: usize,
    /// Rolling topic summary of older conversation turns (iMentor-style context injection).
    pub summary: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Message {
    pub id: String,
    pub session_id: String,
    /// "user" | "assistant" | "system"
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub token_count: Option<i64>,
    pub ttft_ms: Option<i64>,
    /// JSON array of source names, e.g. `["doc1.pdf", "notes.txt"]`
    pub source_refs: Option<String>,
}

pub struct SessionStore {
    conn: Connection,
}

impl SessionStore {
    /// Open (or create) the SQLite database at `db_path` and apply migrations.
    pub fn new(db_path: &Path) -> anyhow::Result<Self> {
        let mut conn = Connection::open(db_path)?;

        // Enable WAL mode for better concurrent read performance
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

        let migrations = get_migrations();
        migrations.to_latest(&mut conn)?;

        Ok(Self { conn })
    }

    /// Create a new session with the given mode. Returns the new session id.
    pub fn create_session(&self, mode: &str) -> anyhow::Result<String> {
        let id = Uuid::new_v4().to_string();
        let now = utc_now();
        self.conn.execute(
            "INSERT INTO sessions (id, created_at, updated_at, mode) VALUES (?1, ?2, ?3, ?4)",
            params![id, now, now, mode],
        )?;
        Ok(id)
    }

    /// Persist a message to the database.
    pub fn save_message(&self, msg: &Message) -> anyhow::Result<()> {
        // Touch the parent session's updated_at
        let now = utc_now();
        self.conn.execute(
            "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
            params![now, msg.session_id],
        )?;

        self.conn.execute(
            "INSERT INTO messages (id, session_id, role, content, created_at, token_count, ttft_ms, source_refs)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                msg.id,
                msg.session_id,
                msg.role,
                msg.content,
                msg.created_at,
                msg.token_count,
                msg.ttft_ms,
                msg.source_refs,
            ],
        )?;
        Ok(())
    }

    /// Retrieve all messages for a session, ordered by creation time.
    pub fn get_session_messages(&self, session_id: &str) -> anyhow::Result<Vec<Message>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, role, content, created_at, token_count, ttft_ms, source_refs
             FROM messages
             WHERE session_id = ?1
             ORDER BY created_at ASC",
        )?;

        let messages = stmt
            .query_map(params![session_id], |row| {
                Ok(Message {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    created_at: row.get(4)?,
                    token_count: row.get(5)?,
                    ttft_ms: row.get(6)?,
                    source_refs: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(messages)
    }

    /// List the most recent sessions, newest first.
    pub fn list_sessions(&self, limit: usize) -> anyhow::Result<Vec<Session>> {
        let mut stmt = self.conn.prepare(
            "SELECT s.id, s.created_at, s.updated_at, s.mode, s.title,
                    COUNT(m.id) as message_count
             FROM sessions s
             LEFT JOIN messages m ON m.session_id = s.id
             GROUP BY s.id
             ORDER BY s.updated_at DESC
             LIMIT ?1",
        )?;

        let sessions = stmt
            .query_map(params![limit as i64], |row| {
                Ok(Session {
                    id: row.get(0)?,
                    created_at: row.get(1)?,
                    updated_at: row.get(2)?,
                    mode: row.get(3)?,
                    title: row.get(4)?,
                    message_count: row.get::<_, i64>(5)? as usize,
                    summary: None,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(sessions)
    }

    /// Update a session title and touch updated_at for ordering.
    pub fn update_session_title(&self, session_id: &str, title: &str) -> anyhow::Result<()> {
        let now = utc_now();
        self.conn.execute(
            "UPDATE sessions SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![title, now, session_id],
        )?;
        Ok(())
    }

    /// Read the rolling conversation summary for a session.
    pub fn get_session_summary(&self, session_id: &str) -> anyhow::Result<Option<String>> {
        let result = self.conn.query_row(
            "SELECT summary FROM sessions WHERE id = ?1",
            params![session_id],
            |row| row.get::<_, Option<String>>(0),
        );
        match result {
            Ok(val) => Ok(val),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Persist an updated rolling summary back to the session row.
    pub fn update_session_summary(&self, session_id: &str, summary: &str) -> anyhow::Result<()> {
        self.conn.execute(
            "UPDATE sessions SET summary = ?1 WHERE id = ?2",
            params![summary, session_id],
        )?;
        Ok(())
    }

    /// Delete a session and all of its messages.
    pub fn delete_session(&self, session_id: &str) -> anyhow::Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "DELETE FROM messages WHERE session_id = ?1",
            params![session_id],
        )?;
        tx.execute("DELETE FROM sessions WHERE id = ?1", params![session_id])?;
        tx.commit()?;
        Ok(())
    }

    /// Read an application setting by key.
    pub fn get_setting(&self, key: &str) -> anyhow::Result<Option<String>> {
        let result = self.conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        );

        match result {
            Ok(val) => Ok(Some(val)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Upsert an application setting.
    pub fn set_setting(&self, key: &str, value: &str) -> anyhow::Result<()> {
        self.conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    /// Return all (key, value) pairs whose key starts with `prefix`.
    pub fn list_settings_by_prefix(&self, prefix: &str) -> anyhow::Result<Vec<(String, String)>> {
        // Escape SQLite LIKE wildcards (% and _) in the prefix so a literal
        // doc_id containing those characters cannot match unintended rows.
        let escaped = prefix.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
        let pattern = format!("{}%", escaped);
        let mut stmt = self.conn.prepare(
            "SELECT key, value FROM settings WHERE key LIKE ?1 ESCAPE '\\' ORDER BY key ASC",
        )?;
        let rows = stmt
            .query_map(params![pattern], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }
}

fn utc_now() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn test_session_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("test.db");
        let store = SessionStore::new(&db).unwrap();

        let session_id = store.create_session("general").unwrap();
        assert!(!session_id.is_empty());

        let msg = Message {
            id: Uuid::new_v4().to_string(),
            session_id: session_id.clone(),
            role: "user".to_string(),
            content: "Hello".to_string(),
            created_at: utc_now(),
            token_count: Some(5),
            ttft_ms: None,
            source_refs: None,
        };
        store.save_message(&msg).unwrap();

        let messages = store.get_session_messages(&session_id).unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].content, "Hello");

        let sessions = store.list_sessions(10).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].message_count, 1);
    }

    #[test]
    fn test_settings() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("test.db");
        let store = SessionStore::new(&db).unwrap();

        assert!(store.get_setting("theme").unwrap().is_none());
        store.set_setting("theme", "dark").unwrap();
        assert_eq!(store.get_setting("theme").unwrap(), Some("dark".to_string()));
        // upsert
        store.set_setting("theme", "light").unwrap();
        assert_eq!(store.get_setting("theme").unwrap(), Some("light".to_string()));
    }

    // ── Chat session persistence tests ────────────────────────────────────────

    #[test]
    fn test_multi_turn_ml_conversation() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("test.db");
        let store = SessionStore::new(&db).unwrap();
        let sid = store.create_session("course").unwrap();

        let turns: &[(&str, &str)] = &[
            ("user",      "What is the bias-variance tradeoff?"),
            ("assistant", "The bias-variance tradeoff describes the tension between underfitting (high bias) and overfitting (high variance). A model with high bias makes strong assumptions about the data. A model with high variance is too sensitive to training examples."),
            ("user",      "How does regularisation help?"),
            ("assistant", "Regularisation adds a penalty to the loss function that discourages large parameter values, which reduces variance at the cost of a slight increase in bias."),
            ("user",      "What is the difference between L1 and L2 regularisation?"),
            ("assistant", "L1 (Lasso) adds the sum of absolute parameter values; it promotes sparsity by driving some weights to zero. L2 (Ridge) adds the sum of squared parameter values; it shrinks all weights but rarely drives them to zero."),
        ];

        for (role, content) in turns {
            store.save_message(&Message {
                id: Uuid::new_v4().to_string(),
                session_id: sid.clone(),
                role: role.to_string(),
                content: content.to_string(),
                created_at: utc_now(),
                token_count: Some(content.split_whitespace().count() as i64),
                ttft_ms: None,
                source_refs: None,
            }).unwrap();
        }

        let history = store.get_session_messages(&sid).unwrap();
        assert_eq!(history.len(), 6, "All 6 turns should be stored");
        assert_eq!(history[0].role, "user");
        assert_eq!(history[1].role, "assistant");
        assert!(history[1].content.contains("underfitting"));
        // Token counts should be set
        for msg in &history {
            assert!(msg.token_count.unwrap_or(0) > 0);
        }
    }

    #[test]
    fn test_general_mode_questions_stored() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("test.db");
        let store = SessionStore::new(&db).unwrap();
        let sid = store.create_session("general").unwrap();

        let general_questions = [
            "What is machine learning?",
            "How is AI different from traditional programming?",
            "What careers are available in data science?",
        ];

        for q in &general_questions {
            store.save_message(&Message {
                id: Uuid::new_v4().to_string(),
                session_id: sid.clone(),
                role: "user".to_string(),
                content: q.to_string(),
                created_at: utc_now(),
                token_count: None,
                ttft_ms: None,
                source_refs: None,
            }).unwrap();
        }

        let history = store.get_session_messages(&sid).unwrap();
        assert_eq!(history.len(), 3);
        let contents: Vec<_> = history.iter().map(|m| m.content.as_str()).collect();
        assert_eq!(contents[0], "What is machine learning?");
        assert_eq!(contents[2], "What careers are available in data science?");
    }

    #[test]
    fn test_user_docs_mode_with_source_refs() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("test.db");
        let store = SessionStore::new(&db).unwrap();
        let sid = store.create_session("user_docs").unwrap();

        store.save_message(&Message {
            id: Uuid::new_v4().to_string(),
            session_id: sid.clone(),
            role: "user".to_string(),
            content: "Summarise the key points from my lecture notes.".to_string(),
            created_at: utc_now(),
            token_count: None,
            ttft_ms: None,
            source_refs: None,
        }).unwrap();

        store.save_message(&Message {
            id: Uuid::new_v4().to_string(),
            session_id: sid.clone(),
            role: "assistant".to_string(),
            content: "Based on your lecture notes: 1) SGD uses mini-batches. 2) Momentum accelerates convergence.".to_string(),
            created_at: utc_now(),
            token_count: Some(20),
            ttft_ms: Some(145),
            source_refs: Some(r#"["lecture-notes.pdf", "week3.pdf"]"#.to_string()),
        }).unwrap();

        let history = store.get_session_messages(&sid).unwrap();
        assert_eq!(history.len(), 2);
        let assistant_msg = &history[1];
        assert_eq!(assistant_msg.role, "assistant");
        // Source refs should be preserved
        let refs: serde_json::Value = serde_json::from_str(
            assistant_msg.source_refs.as_deref().unwrap_or("[]")
        ).unwrap();
        assert_eq!(refs[0], "lecture-notes.pdf");
        assert_eq!(refs[1], "week3.pdf");
        // TTFT should be recorded
        assert_eq!(assistant_msg.ttft_ms, Some(145));
    }

    #[test]
    fn test_multiple_sessions_independent() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("test.db");
        let store = SessionStore::new(&db).unwrap();

        let sid1 = store.create_session("general").unwrap();
        let sid2 = store.create_session("course").unwrap();

        store.save_message(&Message {
            id: Uuid::new_v4().to_string(),
            session_id: sid1.clone(),
            role: "user".to_string(),
            content: "Session 1 question".to_string(),
            created_at: utc_now(),
            token_count: None, ttft_ms: None, source_refs: None,
        }).unwrap();

        store.save_message(&Message {
            id: Uuid::new_v4().to_string(),
            session_id: sid2.clone(),
            role: "user".to_string(),
            content: "Session 2 question".to_string(),
            created_at: utc_now(),
            token_count: None, ttft_ms: None, source_refs: None,
        }).unwrap();

        let h1 = store.get_session_messages(&sid1).unwrap();
        let h2 = store.get_session_messages(&sid2).unwrap();

        assert_eq!(h1.len(), 1);
        assert_eq!(h1[0].content, "Session 1 question");
        assert_eq!(h2.len(), 1);
        assert_eq!(h2[0].content, "Session 2 question");

        let sessions = store.list_sessions(10).unwrap();
        assert_eq!(sessions.len(), 2);
    }

    #[test]
    fn test_document_metadata_stored_as_setting() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("test.db");
        let store = SessionStore::new(&db).unwrap();

        let doc_id = "abc-123";
        let meta = serde_json::json!({
            "id": doc_id,
            "file_name": "gradient-descent-notes.pdf",
            "chunk_count": 12,
            "word_count": 3450,
            "created_at": "2026-04-12T04:00:00Z",
            "status": "ready"
        });

        store.set_setting(&format!("doc:{}", doc_id), &meta.to_string()).unwrap();

        let rows = store.list_settings_by_prefix("doc:").unwrap();
        assert_eq!(rows.len(), 1);
        let (key, value) = &rows[0];
        assert_eq!(key, &format!("doc:{}", doc_id));
        let parsed: serde_json::Value = serde_json::from_str(value).unwrap();
        assert_eq!(parsed["file_name"], "gradient-descent-notes.pdf");
        assert_eq!(parsed["chunk_count"], 12);

        // Soft-delete
        store.set_setting(&format!("doc:{}", doc_id), "deleted").unwrap();
        let rows = store.list_settings_by_prefix("doc:").unwrap();
        assert_eq!(rows[0].1, "deleted");
    }
}
