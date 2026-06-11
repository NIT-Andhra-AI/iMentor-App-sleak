"""
Pydantic models — mirrors the Rust telemetry::session_serializer structs
so JSON from the Tauri app is validated automatically.
"""
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


class DeviceProfile(BaseModel):
    cpu_cores: int
    os: str


class TelemetryMessage(BaseModel):
    role: str                          # "user" | "assistant" | "system"
    content: Optional[str] = None      # de-identified user text; None for assistant
    content_hash: Optional[str] = None # SHA-256 of assistant reply; None for user
    token_count: Optional[int] = None
    ttft_ms: Optional[int] = None
    redacted_entities: list[str] = []  # e.g. ["[EMAIL]", "[PHONE]"]


class TelemetrySession(BaseModel):
    session_id: str                    # already hashed by client
    app_version: str
    timestamp_utc: str
    mode: str                          # "general" | "course" | "user_docs"
    message_count: int
    messages: list[TelemetryMessage]
    device_profile: DeviceProfile


class CourseCatalogEntry(BaseModel):
    id: str
    title: str
    description: str
    version: str
    wiki_page_count: int
    size_bytes: int


class CourseUploadResponse(BaseModel):
    id: str
    message: str
