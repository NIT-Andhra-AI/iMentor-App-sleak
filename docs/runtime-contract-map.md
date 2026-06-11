# Runtime Contract Map

Last updated: 2026-04-24

## Purpose

This document defines canonical interfaces for the two-app architecture:
- Student App runtime contract (strict Tauri command boundary)
- Admin App operations contract (FastAPI + dashboard)

This is an implementation governance document. If an interface changes, update this file in the same PR.

## Student App Runtime Contract (Tauri only)

Canonical boundary:
- Frontend transport: frontend/src/lib/tauri.ts
- Rust command host: src-tauri/src/lib.rs
- Runtime command implementations: src-tauri/src/commands/*

### Chat and sessions
- chat_stream
- cancel_generation
- create_chat_session
- list_chat_sessions
- rename_chat_session
- delete_chat_session
- get_session_messages

### Course and wiki
- list_courses
- get_course_manifest
- list_wiki_pages
- get_wiki_page
- check_course_updates
- download_course
- remove_course
- restore_course

### User documents and RAG
- upload_document
- list_documents
- toggle_doc_selection
- delete_document

### Agents
- spawn_agent
- list_agents
- agent_message
- remove_agent

### Settings, model state, consent, deployment
- get_setting
- set_setting
- get_model_status
- accept_consent
- decline_consent
- get_consent_status
- set_telemetry_enabled
- deployment_status
- get_license_status

### Runtime policy
- Student runtime features must not call browser-server fallbacks for chat, docs, courses, or agents.
- Any runtime behavior change requires command-layer changes first, then frontend adapter updates.

## Admin App Operations Contract

Canonical backend mount:
- server/api/main.py

Mounted routers:
- /v1: telemetry ingestion (server/api/routes/telemetry.py)
- /v1/courses: course catalog and bundle management (server/api/routes/courses.py)
- /admin: dashboard analytics and session inspection (server/api/routes/admin.py)

Dashboard client:
- server/dashboard/src/lib/api.ts

### Auth and mutability rules
- Mutating admin operations require X-Admin-Key and configured ADMIN_API_KEY.
- Missing ADMIN_API_KEY disables admin mutations by design.

### Telemetry privacy baseline
- Session payload is de-identified before storage.
- IP is stored as hash only.
- Dashboard works on aggregate and de-identified session payloads.

## Out of Scope

- Using admin API routes as a runtime inference backend for student chat/doc/agent flows.
- Reintroducing browser runtime fallback paths for student core features.

## Change Control

- Significant boundary changes require ADR updates in docs/adr.
- Runtime policy changes must align with docs/adr/0001-core-product-direction.md.
