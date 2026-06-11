from __future__ import annotations

import asyncio
import json
import uuid
from typing import Literal, TypedDict

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/v1/agents", tags=["agents"])


class AgentInfo(TypedDict):
    id: str
    agent_type: Literal["Dev", "Test"]
    status: Literal["Idle", "Running", "Queued"]
    message_count: int
    created_at: str


class SpawnRequest(BaseModel):
    agent_type: Literal["dev", "test"]


class MessageRequest(BaseModel):
    message: str


_LOCAL_AGENTS: dict[str, AgentInfo] = {}


@router.get("/local")
async def list_local_agents():
    return list(_LOCAL_AGENTS.values())


@router.post("/local/spawn")
async def spawn_local_agent(request: SpawnRequest):
    agent_id = f"web-agent-{uuid.uuid4()}"
    agent_type = "Dev" if request.agent_type == "dev" else "Test"
    _LOCAL_AGENTS[agent_id] = {
        "id": agent_id,
        "agent_type": agent_type,
        "status": "Idle",
        "message_count": 0,
        "created_at": "",
    }
    return {"id": agent_id}


@router.delete("/local/{agent_id}")
async def remove_local_agent(agent_id: str):
    if agent_id not in _LOCAL_AGENTS:
        raise HTTPException(status_code=404, detail="Agent not found")
    del _LOCAL_AGENTS[agent_id]
    return {"ok": True}


@router.post("/local/{agent_id}/message/stream")
async def local_agent_message_stream(agent_id: str, request: MessageRequest):
    if agent_id not in _LOCAL_AGENTS:
        raise HTTPException(status_code=404, detail="Agent not found")

    _LOCAL_AGENTS[agent_id]["status"] = "Running"
    _LOCAL_AGENTS[agent_id]["message_count"] += 1

    async def event_stream():
        agent_type = _LOCAL_AGENTS[agent_id]["agent_type"]
        reply = (
            "Web-mode agent transport is active. "
            "This is a temporary streamed response while native agent orchestration remains in Tauri runtime.\n\n"
            f"Agent: {agent_type}\n"
            f"Message: {request.message}"
        )

        for i in range(0, len(reply), 20):
            chunk = reply[i:i + 20]
            payload = json.dumps({"token": chunk, "done": False})
            yield f"data: {payload}\n\n"
            await asyncio.sleep(0.01)

        _LOCAL_AGENTS[agent_id]["status"] = "Idle"
        yield f"data: {json.dumps({'token': '', 'done': True})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
