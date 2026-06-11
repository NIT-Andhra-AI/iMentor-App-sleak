use rusqlite_migration::{Migrations, M};

pub fn get_migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up("
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                mode TEXT NOT NULL DEFAULT 'general',
                title TEXT
            );
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES sessions(id),
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                token_count INTEGER,
                ttft_ms INTEGER,
                source_refs TEXT
            );
            CREATE TABLE IF NOT EXISTS user_documents (
                id TEXT PRIMARY KEY,
                file_name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                chunk_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'processing'
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS pending_telemetry (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL,
                retry_count INTEGER NOT NULL DEFAULT 0
            );
        "),
        // Migration 2: add index on messages(session_id) for fast history retrieval.
        // The original migration had no index, causing full table scans on every
        // get_session_messages call as the conversation history grows.
        M::up("
            CREATE INDEX IF NOT EXISTS idx_messages_session
                ON messages(session_id, created_at ASC);
        "),
        // Migration 3: add rolling summary column to sessions.
        // Stores a compact text summary of older conversation turns, updated after
        // each assistant response.  Used for iMentor-style summary injection so
        // the LLM gets prior context without replaying every verbatim message.
        M::up("
            ALTER TABLE sessions ADD COLUMN summary TEXT;
        "),
    ])
}
