# ADR 0001: Core Product Direction (Tauri-Only Student Runtime)

- Status: Accepted
- Date: 2026-04-24

## Context

Student AI must serve low-resource student devices with offline-first behavior, predictable packaging, and strict privacy constraints. Prior planning introduced risk of architectural drift across browser fallback paths, mixed runtime boundaries, and unclear ownership between student runtime and admin operations.

## Decision

1. Product shape
- Keep two applications in one repository.
- Student App: Tauri desktop/mobile shell with Rust backend commands for runtime features.
- Admin App: FastAPI backend + dashboard for course operations and de-identified telemetry.

2. Runtime boundary
- Student runtime features (chat, course query/wiki, user docs/RAG, agents, settings) must run through Tauri IPC commands.
- Browser-runtime fallbacks for these runtime features are explicitly disallowed.
- Admin APIs are not runtime inference backends for student chat/doc/agent workflows.

3. Technology baseline
- Rust-first backend, Svelte frontend, llama.cpp inference stack for desktop.
- Alternative UI frameworks (Slint/Iced/egui/Floem) remain exploratory only unless superseded by a future ADR.

4. Testing baseline
- Keep unit + integration + contract tests as baseline.
- Add desktop E2E automation against real Tauri windows (tauri-driver/WebDriver flow), not browser-only assumptions.

## Consequences

Positive:
- Architectural consistency across sessions and contributors.
- Clear ownership boundaries between runtime and operations plane.
- Reduced risk of hidden fallback behavior and production drift.

Trade-offs:
- Less flexibility for quick browser-only experiments in runtime paths.
- Additional setup effort for desktop automation compared with plain browser tests.

## Guardrails

- Any proposal to reintroduce runtime browser fallbacks or move runtime inference to admin APIs requires a new ADR and explicit approval.
- Any migration away from Tauri/Svelte as primary runtime shell requires a superseding ADR.
