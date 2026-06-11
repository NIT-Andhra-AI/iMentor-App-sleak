from fastapi import APIRouter, Request, HTTPException
from datetime import datetime, timezone
import json
import hashlib

from api.models import TelemetrySession
from api.database import get_db

router = APIRouter(prefix="/v1", tags=["telemetry"])


def _hash_ip(ip: str) -> str:
    """One-way hash the client IP so it cannot be recovered."""
    return hashlib.sha256(ip.encode()).hexdigest()[:16]


@router.post("/sessions", status_code=202)
async def receive_session(payload: TelemetrySession, request: Request):
    """
    Accept a de-identified TelemetrySession from the student app.
    The session_id is already hashed by the client.
    User message content has PII stripped by the client.
    Assistant content is represented only as a SHA-256 hash.
    """
    received_at = datetime.now(timezone.utc).isoformat()
    client_ip = request.client.host if request.client else "unknown"

    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO telemetry_sessions
                (session_id, app_version, timestamp_utc, mode,
                 message_count, raw_json, received_at, ip_hash)
            VALUES (?,?,?,?,?,?,?,?)
            """,
            (
                payload.session_id,
                payload.app_version,
                payload.timestamp_utc,
                payload.mode,
                payload.message_count,
                payload.model_dump_json(),
                received_at,
                _hash_ip(client_ip),
            ),
        )
        await db.commit()

    return {"status": "accepted", "received_at": received_at}
