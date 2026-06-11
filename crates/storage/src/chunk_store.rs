use std::path::Path;

use rusqlite::{params, Connection};

use crate::migrations::get_migrations;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct UserDocument {
    pub id: String,
    pub file_name: String,
    pub file_path: String,
    pub chunk_count: usize,
    pub created_at: String,
    pub status: String,
}

pub struct ChunkStore {
    conn: Connection,
}

impl ChunkStore {
    /// Open (or create) the SQLite database at `db_path` and apply migrations.
    pub fn new(db_path: &Path) -> anyhow::Result<Self> {
        let mut conn = Connection::open(db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

        let migrations = get_migrations();
        migrations.to_latest(&mut conn)?;

        Ok(Self { conn })
    }

    /// Insert a new document record. Status defaults to `"processing"`.
    pub fn add_document(
        &self,
        doc_id: &str,
        file_name: &str,
        file_path: &str,
        chunk_count: usize,
    ) -> anyhow::Result<()> {
        let now = utc_now();
        self.conn.execute(
            "INSERT INTO user_documents (id, file_name, file_path, chunk_count, created_at, status)
             VALUES (?1, ?2, ?3, ?4, ?5, 'processing')",
            params![doc_id, file_name, file_path, chunk_count as i64, now],
        )?;
        Ok(())
    }

    /// List all documents, newest first.
    pub fn list_documents(&self) -> anyhow::Result<Vec<UserDocument>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, file_name, file_path, chunk_count, created_at, status
             FROM user_documents
             ORDER BY created_at DESC",
        )?;

        let docs = stmt
            .query_map([], |row| {
                Ok(UserDocument {
                    id: row.get(0)?,
                    file_name: row.get(1)?,
                    file_path: row.get(2)?,
                    chunk_count: row.get::<_, i64>(3)? as usize,
                    created_at: row.get(4)?,
                    status: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(docs)
    }

    /// Remove a document record by id.
    pub fn delete_document(&self, doc_id: &str) -> anyhow::Result<()> {
        let rows = self
            .conn
            .execute("DELETE FROM user_documents WHERE id = ?1", params![doc_id])?;
        if rows == 0 {
            anyhow::bail!("Document not found: {}", doc_id);
        }
        Ok(())
    }

    /// Update the processing status of a document.
    /// Common values: `"processing"`, `"ready"`, `"error"`.
    pub fn update_status(&self, doc_id: &str, status: &str) -> anyhow::Result<()> {
        let rows = self.conn.execute(
            "UPDATE user_documents SET status = ?1 WHERE id = ?2",
            params![status, doc_id],
        )?;
        if rows == 0 {
            anyhow::bail!("Document not found: {}", doc_id);
        }
        Ok(())
    }
}

fn utc_now() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_document_crud() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("test.db");
        let store = ChunkStore::new(&db).unwrap();

        store
            .add_document("doc1", "notes.pdf", "/tmp/notes.pdf", 10)
            .unwrap();

        let docs = store.list_documents().unwrap();
        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0].status, "processing");

        store.update_status("doc1", "ready").unwrap();
        let docs = store.list_documents().unwrap();
        assert_eq!(docs[0].status, "ready");

        store.delete_document("doc1").unwrap();
        let docs = store.list_documents().unwrap();
        assert!(docs.is_empty());
    }
}
