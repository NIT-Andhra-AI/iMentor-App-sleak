"""
SQLite database setup and helpers using aiosqlite (async).
Database file: server/studentai.db
"""
from __future__ import annotations
import aiosqlite
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "studentai.db")

CREATE_SQL = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS telemetry_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT    NOT NULL,          -- hashed by client
    app_version     TEXT,
    timestamp_utc   TEXT    NOT NULL,
    mode            TEXT,
    message_count   INTEGER,
    raw_json        TEXT    NOT NULL,
    received_at     TEXT    NOT NULL,
    ip_hash         TEXT
);

CREATE TABLE IF NOT EXISTS course_catalog (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    description     TEXT,
    version         TEXT NOT NULL,
    wiki_page_count INTEGER DEFAULT 0,
    file_path       TEXT NOT NULL,
    size_bytes      INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telemetry_received ON telemetry_sessions(received_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_mode     ON telemetry_sessions(mode);
"""


def get_db() -> aiosqlite.Connection:
    """Return an aiosqlite Connection context manager (use with `async with get_db() as db:`)."""
    conn = aiosqlite.connect(DB_PATH)
    # Patch row_factory after open — achieved via wrapper below
    return _RowFactoryConn(conn)


class _RowFactoryConn:
    """Thin wrapper that sets row_factory=aiosqlite.Row on __aenter__."""
    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        self._db = await self._conn.__aenter__()
        self._db.row_factory = aiosqlite.Row
        return self._db

    async def __aexit__(self, *args):
        return await self._conn.__aexit__(*args)


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(CREATE_SQL)
        await db.commit()
