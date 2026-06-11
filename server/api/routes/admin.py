import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_KEY = os.environ.get("ADMIN_API_KEY", "")


def _require_admin(x_admin_key: Optional[str] = Header(default=None)):
    if not ADMIN_KEY or ADMIN_KEY == "change-me-in-production":
        raise HTTPException(status_code=503, detail="Admin API disabled: ADMIN_API_KEY not configured")
    if x_admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin key")


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/api/stats", dependencies=[Depends(_require_admin)])
async def get_stats():
    """Aggregate stats for the admin dashboard."""
    from api.database import get_db
    async with get_db() as db:
        async with db.execute("SELECT COUNT(*) as total FROM telemetry_sessions") as c:
            total = (await c.fetchone())["total"]

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        async with db.execute(
            "SELECT COUNT(*) as cnt FROM telemetry_sessions WHERE received_at LIKE ?",
            (f"{today}%",)
        ) as c:
            today_count = (await c.fetchone())["cnt"]

        async with db.execute("SELECT COUNT(*) as cnt FROM course_catalog") as c:
            course_count = (await c.fetchone())["cnt"]

        # Average TTFT from messages JSON
        async with db.execute(
            "SELECT raw_json FROM telemetry_sessions ORDER BY received_at DESC LIMIT 500"
        ) as c:
            rows = await c.fetchall()

        ttft_values = []
        import json
        for row in rows:
            try:
                data = json.loads(row["raw_json"])
                for msg in data.get("messages", []):
                    if msg.get("ttft_ms") is not None:
                        ttft_values.append(msg["ttft_ms"])
            except Exception:
                pass

        avg_ttft = int(sum(ttft_values) / len(ttft_values)) if ttft_values else 0

        # Sessions per day (last 7 days)
        async with db.execute(
            """
            SELECT substr(received_at,1,10) as day, COUNT(*) as cnt
            FROM telemetry_sessions
            WHERE received_at >= date('now','-7 days')
            GROUP BY day ORDER BY day
            """
        ) as c:
            daily = [{"day": r["day"], "count": r["cnt"]} async for r in c]

        # Mode distribution
        async with db.execute(
            "SELECT mode, COUNT(*) as cnt FROM telemetry_sessions GROUP BY mode"
        ) as c:
            modes = [{"mode": r["mode"], "count": r["cnt"]} async for r in c]

        # PII redaction counts
        pii_counts: dict[str, int] = {}
        for row in rows:
            try:
                data = json.loads(row["raw_json"])
                for msg in data.get("messages", []):
                    for entity in msg.get("redacted_entities", []):
                        pii_counts[entity] = pii_counts.get(entity, 0) + 1
            except Exception:
                pass

    return {
        "total_sessions": total,
        "sessions_today": today_count,
        "active_courses": course_count,
        "avg_ttft_ms": avg_ttft,
        "sessions_per_day": daily,
        "mode_distribution": modes,
        "pii_redaction_counts": pii_counts,
    }


@router.get("/api/sessions", dependencies=[Depends(_require_admin)])
async def list_sessions(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    mode: Optional[str] = Query(default=None),
):
    """Paginated list of de-identified sessions for the admin table."""
    from api.database import get_db
    offset = (page - 1) * per_page
    where = "WHERE mode=?" if mode else ""
    args = (mode, per_page, offset) if mode else (per_page, offset)

    async with get_db() as db:
        async with db.execute(
            f"""
            SELECT id, session_id, app_version, timestamp_utc, mode,
                   message_count, received_at
            FROM telemetry_sessions
            {where}
            ORDER BY received_at DESC
            LIMIT ? OFFSET ?
            """,
            args,
        ) as c:
            rows = [dict(r) async for r in c]
        async with db.execute(
            f"SELECT COUNT(*) as cnt FROM telemetry_sessions {where}",
            (mode,) if mode else (),
        ) as c:
            total = (await c.fetchone())["cnt"]

    return {"total": total, "page": page, "per_page": per_page, "sessions": rows}


@router.get("/api/sessions/{session_db_id}", dependencies=[Depends(_require_admin)])
async def get_session_detail(session_db_id: int):
    """Return the full (de-identified) payload for one session."""
    import json
    from api.database import get_db
    async with get_db() as db:
        async with db.execute(
            "SELECT raw_json FROM telemetry_sessions WHERE id=?", (session_db_id,)
        ) as c:
            row = await c.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return json.loads(row["raw_json"])
