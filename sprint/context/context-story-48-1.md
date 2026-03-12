# Story 48-1: FastAPI skeleton + OTLP receiver + launcher switch

## Overview

Phase 1 of Epic 48 (Python WheelHub Migration, ADR-0022). Replace the Node.js WheelHub server entry point with a Python FastAPI application. This story creates the FastAPI skeleton, ports the OTLP receiver endpoints, and updates `launcher.py` to start Python instead of Node.js.

**Epic:** 48 — Python WheelHub Migration (MSSCI-16312)
**ADR:** docs/adr/0022-python-wheelhub-replacement.md
**Points:** 3
**Type:** refactor

## Acceptance Criteria

1. **FastAPI skeleton app** — `pennyfarthing-dist/src/pf/wheelhub/app.py` with health check endpoint (`GET /health`), port file management (`.bikerack-port`), and SIGINT cleanup
2. **OTLP receiver endpoints** — `pennyfarthing-dist/src/pf/wheelhub/otlp.py` implementing `POST /v1/logs`, `POST /v1/metrics`, `POST /v1/traces` with JSON parsing and in-memory token stats aggregation
3. **Launcher switch** — `pennyfarthing-dist/src/pf/bikerack/launcher.py` updated to start the Python FastAPI server (via uvicorn) instead of `node wheelhub.mjs`
4. **Port file contract** — Python server writes `.bikerack-port` on startup, cleans up on shutdown, matching existing behavior
5. **OTEL data flows end-to-end** — Claude Code CLI spans reach the Python OTLP receiver and token stats are aggregated correctly
6. **Dependencies declared** — `fastapi`, `uvicorn`, `websockets` added to project dependencies

## Technical Context

### Current Architecture (Node.js)

The WheelHub server is an Express/WebSocket Node.js application:

- **Entry:** `packages/core/src/server/server.ts` (~430 lines) — Express app, route mounting, port management
- **OTLP:** `packages/core/src/server/otlp-receiver.ts` (~571 lines) — JSON parsing, token stats aggregation, span correlation, file enrichment
- **Launcher:** `pennyfarthing-dist/src/pf/bikerack/launcher.py` — discovers `wheelhub.mjs` via multi-strategy search, starts with `node`, polls for `.bikerack-port`

Key interfaces from `otlp-receiver.ts`:
- `TokenStats` — inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, totalCost
- `BackgroundTask` — taskId, description, subagentType, startedAt, status
- `ToolEvent` — toolName, input, success, workingDirectory
- `AuditLogEntry` — timestamp, type, tool

### Target Architecture (Python FastAPI)

New code goes in `pennyfarthing-dist/src/pf/wheelhub/`:

```
wheelhub/
  __init__.py
  app.py          # FastAPI application, port file, SIGINT cleanup
  otlp.py         # OTLP receiver (port of otlp-receiver.ts)
  models.py       # Pydantic models for TokenStats, AuditLogEntry, etc.
```

The FastAPI app runs on uvicorn, uses the same port (1898 default), writes `.bikerack-port`, and handles SIGINT for cleanup — matching the existing Node.js lifecycle.

### Launcher Changes

Current `launcher.py` flow:
1. `_find_wheelhub_entry()` — multi-strategy discovery of `wheelhub.mjs` / `entry.js`
2. `start_wheelhub()` — `subprocess.Popen(["node", str(entry)], ...)`
3. `poll_for_port_file()` — wait for `.bikerack-port`

New flow:
1. Import and start uvicorn programmatically (or via subprocess)
2. Same `poll_for_port_file()` behavior
3. Eliminate `_find_wheelhub_entry()` complexity — Python module is importable directly

### OTLP Receiver Port Scope

For this story, port the **core OTLP endpoints only**:
- `POST /v1/logs` — parse OTLP log records, extract tool events
- `POST /v1/metrics` — parse OTLP metrics (token counters)
- `POST /v1/traces` — parse OTLP trace spans, aggregate token stats

Advanced features (span correlation, file enrichment, pending tool input correlation) are deferred to story 48-2 or 48-3. This story needs the endpoints to accept data and aggregate `TokenStats`.

### OTEL Environment Variables

Set by `build_otel_env()` in launcher.py (unchanged):
- `CLAUDE_CODE_ENABLE_TELEMETRY=1`
- `OTEL_LOGS_EXPORTER=otlp`
- `OTEL_METRICS_EXPORTER=otlp`
- `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`
- `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:{port}`

## Key Files

| File | Role |
|------|------|
| `pennyfarthing-dist/src/pf/wheelhub/app.py` | **NEW** — FastAPI application |
| `pennyfarthing-dist/src/pf/wheelhub/otlp.py` | **NEW** — OTLP receiver endpoints |
| `pennyfarthing-dist/src/pf/wheelhub/models.py` | **NEW** — Pydantic models |
| `pennyfarthing-dist/src/pf/wheelhub/__init__.py` | **NEW** — Package init |
| `pennyfarthing-dist/src/pf/bikerack/launcher.py` | **MODIFY** — Switch from Node to Python |
| `packages/core/src/server/otlp-receiver.ts` | **REFERENCE** — Source for OTLP port |
| `packages/core/src/server/server.ts` | **REFERENCE** — Source for app lifecycle |
| `docs/adr/0022-python-wheelhub-replacement.md` | **REFERENCE** — Architecture decision |

## Dependencies

- `fastapi` — ASGI web framework
- `uvicorn` — ASGI server
- `websockets` — WebSocket protocol (for future phases, declare now)
- No dependency on Node.js at runtime

## Out of Scope

- API data proxy routes (story 48-2)
- WebSocket channels and file watchers (story 48-3)
- Removal of Node.js server code (story 48-4)
- Advanced OTLP features: span correlation, file enrichment, pending tool input correlation
- GUI (Cyclist) proxy changes

## Testing Strategy (TDD)

RED phase tests should cover:
1. FastAPI app starts and responds to `GET /health`
2. Port file is written on startup and cleaned up on shutdown
3. `POST /v1/traces` accepts OTLP JSON and returns 200
4. `POST /v1/logs` accepts OTLP JSON and returns 200
5. `POST /v1/metrics` accepts OTLP JSON and returns 200
6. Token stats are aggregated from trace span attributes
7. Launcher starts Python server instead of Node.js
