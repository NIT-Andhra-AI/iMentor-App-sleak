from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/v1/chat", tags=["chat"])


class ChatRequest(BaseModel):
    session_id: str
    message: str
    mode: dict[str, Any]


def _mode_label(mode: dict[str, Any]) -> str:
    mode_type = str(mode.get("type", "general"))
    if mode_type == "course":
        return f"course ({mode.get('course_id', 'unknown')})"
    if mode_type == "study_topic":
        return f"study topic ({mode.get('page_slug', 'unknown')})"
    if mode_type == "user_docs":
        return "user docs"
    return "general"


def _build_reply(req: ChatRequest) -> str:
    label = _mode_label(req.mode)
    return (
        "Web mode chat transport is active. "
        "This temporary server response keeps browser mode functional while Tauri-backed local inference is disabled.\n\n"
        f"Mode: {label}\n"
        f"Message: {req.message}\n\n"
        "For full on-device LLM responses, run the desktop app in Tauri mode."
    )


@router.post("/local/stream")
async def local_chat_stream(request: ChatRequest):
    async def event_stream():
        reply = _build_reply(request)
        chunk_size = 20
        for i in range(0, len(reply), chunk_size):
            chunk = reply[i:i + chunk_size]
            payload = json.dumps({"token": chunk, "done": False})
            yield f"data: {payload}\n\n"
            await asyncio.sleep(0.01)

        yield f"data: {json.dumps({'token': '', 'done': True})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
