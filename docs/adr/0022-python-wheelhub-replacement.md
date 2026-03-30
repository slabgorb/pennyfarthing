# ADR-0022: Replace Node.js WheelHub with Python Server

**Status:** Accepted (Implemented)
**Date:** 2026-03-09
**Implemented:** 2026-03-09 (Epic 48, Stories 48-1 through 48-4)
**Author:** Architect Agent (Leonard of Quirm)

## Context

WheelHub is the central real-time server for Pennyfarthing — an Express/WebSocket Node.js bundle (`wheelhub.mjs`, ~1.7MB) that serves HTTP API routes, WebSocket channels, and an OTLP telemetry receiver. It is the **number one source of operational problems** in the framework:

### Pain Points

1. **Build pipeline fragility** — TypeScript → esbuild → banner injection → CLI block stripping → validation → copy to `pennyfarthing-dist/src/pf/_dist/server/`. The `build-wheelhub.sh` script has multiple failure modes (stale builds, missing banner, ESM compat hacks with `createRequire`).

2. **Deployment complexity** — Four discovery strategies (`_install_wheelhub()` copies the blob during `pf init`; launcher searches project-local, monorepo dev, pip-installed, and fallback paths). Each strategy can fail independently.

3. **Runtime instability** — "Is the .mjs file stale?" is a recurring debugging question. Node.js version compatibility, ESM vs CJS issues, and the bundled nature make errors opaque.

4. **Circular delegation** — Node.js WheelHub calls Python via subprocess for most real work (persona loading, sprint data, git status, story parsing, theme discovery, analysis tools). Python is the source of truth; Node is an expensive caching middleman.

5. **Dual-runtime requirement** — Users must have both Node.js ≥18 and Python ≥3.11 installed. The Node.js dependency exists solely for WheelHub.

6. **OTEL fragility** — OTEL connection depends on WheelHub running, which depends on a valid .mjs file, which depends on a successful build. Any link in this chain breaks telemetry silently.

### Current Architecture

```
Claude Code CLI
    │
    ├── OTEL spans ──→ WheelHub (Node.js, port 1898)
    │                      │
    │                      ├── subprocess → pf theme show (Python)
    │                      ├── subprocess → pf sprint status (Python)
    │                      ├── subprocess → git status
    │                      ├── in-memory OTLP processing
    │                      ├── WebSocket broadcast (16 channels)
    │                      └── Express HTTP (40+ routes)
    │
    └── Hooks (Python) ──→ HTTP requests to WheelHub /api/*
```

### What WheelHub Actually Does

| Category | Routes/Channels | Implementation |
|----------|----------------|----------------|
| **OTLP receiver** | `/v1/logs`, `/v1/metrics`, `/v1/traces` | JSON parsing, in-memory aggregation (~400 lines) |
| **Data proxy routes** | `/api/persona`, `/api/story`, `/api/git`, `/api/sprint`, etc. | Subprocess calls to `pf` CLI, cache results |
| **Analysis routes** | `/api/hotspots`, `/api/deadcode`, `/api/complexity`, etc. | Subprocess calls to `pf debug` CLI commands |
| **State routes** | `/api/settings`, `/api/permissions`, `/api/audit-log` | File reads + in-memory state |
| **WebSocket channels** | 16 channels (stats, persona, git, settings, etc.) | File watchers + broadcast |
| **Static files** | Portraits, React build output | `express.static()` |
| **Hook integration** | `/api/hook-request`, `/api/pending-tool-input` | WebSocket bridge for approval routing |

**Key observation:** The data proxy and analysis routes are thin wrappers that shell out to Python. The OTLP receiver is ~400 lines of JSON parsing with no Node-specific dependencies. The WebSocket layer is file watchers + JSON broadcast.

## Decision

**Replace WheelHub's Node.js server with a Python server using FastAPI + uvicorn.**

### Why FastAPI

- **Native async** — ASGI server, native WebSocket support, no callback hell
- **Zero build step** — Python source files run directly
- **Type-safe** — Pydantic models replace TypeScript interfaces
- **Already in the stack** — `pf` CLI is Python; this unifies the runtime
- **Battle-tested** — FastAPI is the most popular Python web framework for APIs

### What Changes

**Eliminated:**
- `build-wheelhub.sh` build script
- esbuild bundling + banner injection + CLI block stripping
- `wheelhub.mjs` artifact (1.7MB blob)
- `_install_wheelhub()` copy-on-init
- Multi-strategy discovery in `launcher.py`
- Node.js runtime dependency for server
- `packages/core/src/server/` (entire directory, ~30 files)

**Replaced with:**
- `pennyfarthing-dist/src/pf/wheelhub/` — Python package
  - `app.py` — FastAPI application, route mounting
  - `otlp.py` — OTLP receiver (port of `otlp-receiver.ts`)
  - `websocket.py` — WebSocket channel manager + file watchers
  - `routes/` — API route modules (most just call existing `pf` Python code directly)
  - `models.py` — Pydantic models for TokenStats, AuditLogEntry, etc.

**Unchanged:**
- `.bikerack-port` discovery pattern
- OTEL environment variable setup
- Hook integration (Python → HTTP → server)
- WebSocket channel names and message formats
- All API response shapes (backward compatible)

### Migration Architecture

```
Claude Code CLI
    │
    ├── OTEL spans ──→ Python WheelHub (FastAPI, port 1898)
    │                      │
    │                      ├── direct import → pf.prime.persona (no subprocess!)
    │                      ├── direct import → pf.sprint.status (no subprocess!)
    │                      ├── direct import → pf.hotspots (no subprocess!)
    │                      ├── in-memory OTLP processing (ported from TS)
    │                      ├── WebSocket broadcast (same channels)
    │                      └── FastAPI HTTP (same routes)
    │
    └── Hooks (Python) ──→ HTTP requests to Python WheelHub /api/*
```

**The critical improvement:** Instead of Node.js shelling out to Python, Python calls Python directly. Every subprocess call becomes a function import.

### Route Migration Complexity

| Route Category | Count | Migration Effort | Notes |
|---------------|-------|-----------------|-------|
| Data proxy (persona, story, git, sprint) | ~12 | **Trivial** | Remove subprocess, import Python module |
| Analysis (hotspots, deadcode, complexity) | ~6 | **Trivial** | Already have Python implementations |
| OTLP receiver | 3 | **Medium** | Port ~400 lines of JSON parsing |
| State (settings, permissions, audit log) | ~8 | **Low** | File reads, in-memory dicts |
| WebSocket channels | 16 | **Medium** | Port file watchers + broadcast pattern |
| Hook integration | 3 | **Low** | HTTP endpoints, WebSocket bridge |
| Static files | — | **Trivial** | FastAPI `StaticFiles` mount |

### GUI Impact

Deprecating the GUI (Cyclist/React) is **orthogonal** to this decision but complementary:

- **If GUI stays:** Python WheelHub serves the same static React build + same API/WS contract. GUI doesn't know or care what serves it.
- **If GUI deprecated:** WebSocket channels can be simplified to only what TUI needs (~6 channels instead of 16). Static file serving drops entirely. But this saves complexity, not the build pain — the build pain is the Node.js server itself, not the React client.

**Recommendation:** Deprecate the GUI separately if desired, but it doesn't block or accelerate this migration.

## Implementation Plan

### Phase 1: Skeleton + OTLP (Critical Path)

1. Create `pennyfarthing-dist/src/pf/wheelhub/` package
2. FastAPI app with health check, port file, SIGINT cleanup
3. Port OTLP receiver (`/v1/logs`, `/v1/metrics`, `/v1/traces`)
4. Port token stats aggregation + broadcast
5. Update `launcher.py` to start Python server instead of `node wheelhub.mjs`
6. **Validation:** OTEL data flows end-to-end

### Phase 2: Core API Routes

7. Port data proxy routes (persona, story, git, sprint) — direct Python imports
8. Port state routes (settings, permissions, audit log)
9. Port analysis routes (hotspots, deadcode, complexity, etc.)
10. Port inline endpoints (welcome, bell-queue, pending-tool-input)
11. **Validation:** All hooks communicate successfully with Python server

### Phase 3: WebSocket Channels

12. Port WebSocket channel manager (broadcast pattern)
13. Port file watchers (session, sprint, git state change detection)
14. Port panel-specific channels (stats, persona, git, settings, audit-log, etc.)
15. **Validation:** TUI panels render correctly

### Phase 4: Cleanup

16. Remove `packages/core/src/server/` (or mark deprecated)
17. Remove `build-wheelhub.sh`
18. Remove `_install_wheelhub()` from `init/core.py`
19. Update all docs and guides referencing wheelhub.mjs
20. Remove Node.js as a runtime requirement for server operation

### Parallel Running (Safety Net)

During migration, both servers can run simultaneously on different ports. The launcher can start the Python server on 1898 and fall back to Node.js on 2898 if the Python server fails. This allows incremental migration without breaking existing functionality.

## Consequences

### Positive

- **No build step** — Python source runs directly, eliminating the entire build-wheelhub pipeline
- **No subprocess overhead** — Direct Python imports replace ~20 subprocess calls per request cycle
- **Single runtime** — Only Python required at runtime (Node.js only needed for GUI dev, if kept)
- **Simpler installation** — `pip install pennyfarthing` includes the server; no .mjs blob copying
- **Faster startup** — No Node.js cold start; Python server starts in <1s
- **Reliable OTEL** — No stale bundle = no silent telemetry failures
- **Debuggable** — Python stack traces instead of bundled .mjs source maps

### Negative

- **Migration effort** — ~5-8 points of work across 4 phases
- **New dependency** — FastAPI + uvicorn added to Python requirements (well-maintained, MIT licensed)
- **WebSocket library change** — `ws` (Node) → FastAPI WebSocket (ASGI) — different API, same semantics
- **Cyclist coupling** — If GUI is kept, Cyclist's dev server (`npm run dev:web`) needs to proxy to Python instead of Node. Standard Vite proxy config change.
- **Test migration** — Core server tests in TypeScript need Python equivalents

### Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| OTLP receiver parity gaps | Medium | Port with comprehensive test coverage; run both servers in parallel during validation |
| WebSocket timing differences | Low | FastAPI's WebSocket is mature; same broadcast pattern applies |
| Performance regression | Very Low | Traffic is dashboard-level (~1 req/sec); Python is more than adequate |
| Cyclist breakage (if GUI kept) | Low | Same API contract; Vite proxy change is a one-line config |

## Alternatives Considered

### 1. Fix the Build Pipeline Instead

Improve `build-wheelhub.sh` reliability, add build caching, better error messages.

**Rejected:** Treats symptoms. The fundamental issue is maintaining a Node.js server that exists primarily to call Python. No amount of build improvement eliminates the architectural redundancy.

### 2. Use stdlib `http.server` Instead of FastAPI

Python's built-in HTTP server, no external dependencies.

**Rejected:** No native WebSocket support, no async, no routing framework. Would require reimplementing what FastAPI provides out of the box.

### 3. Use Flask Instead of FastAPI

More established, simpler API.

**Rejected:** No native async, no native WebSocket (needs flask-socketio). FastAPI's async-first design is better suited for WebSocket broadcast + file watching patterns.

### 4. Keep Node.js but Simplify Build

Use `tsx` or `ts-node` to run TypeScript directly, eliminating the esbuild step.

**Rejected:** Still requires Node.js runtime. Still has the subprocess delegation problem. Reduces but doesn't eliminate build pain.

### 5. Rewrite in Go/Rust for a Single Binary

Compile to a standalone binary with no runtime dependency.

**Rejected:** Introduces a third language. Can't import `pf` Python modules directly — would recreate the subprocess delegation problem in a different language.

## Implementation Outcome (2026-03-09)

All four phases completed in a single sprint as Epic 48 (PROJ-16312):

| Story | Points | Scope | Result |
|-------|--------|-------|--------|
| 48-1 | 3 | FastAPI skeleton + OTLP receiver + launcher switch | FastAPI app at `pf/wheelhub/app.py`, OTLP at `pf/wheelhub/otlp.py`, launcher updated |
| 48-2 | 3 | Port core API routes to FastAPI | Data proxy, state, analysis routes — direct Python imports, no subprocess |
| 48-3 | 5 | Port all 16 WebSocket channels | Channel manager at `pf/wheelhub/websocket.py` |
| 48-4 | 2 | Cleanup — remove Node.js server | `packages/core/src/server/` deleted (~90 files), `build-wheelhub.sh` deleted, express/ws removed |

**Final Python WheelHub:** 1,726 lines across 9 files in `pennyfarthing-dist/src/pf/wheelhub/`.

**What was eliminated:**
- `packages/core/src/server/` (entire directory, ~90 files)
- `scripts/build-wheelhub.sh` (esbuild pipeline)
- `pennyfarthing-dist/src/pf/_dist/server/wheelhub.mjs` (1.7MB bundle)
- `_install_wheelhub()` from init
- `express` and `ws` npm dependencies
- Node.js as a runtime requirement for the server

**What remains in TypeScript:** React GUI components only (`packages/core/src/public/`, 131 files). The workflow engine, benchmark tooling, and shared utilities in `packages/core/src/` still exist in TypeScript but are consumed only by the GUI build, not by the server.

**Impact on ADR-0030 (BikeRack Extraction):** The extraction plan's premise — moving code from `packages/core/src/server/` to `packages/bikerack/` — is now moot. The server directory no longer exists. ADR-0030 needs revision to reflect the Python-first architecture. See ADR-0034.

## References

- ADR-0004: WheelHub Background Agent Coordination (superseded architecture)
- ADR-0034: Post-Migration Architecture — Python Runtime with React GUI
- `pennyfarthing-dist/src/pf/wheelhub/` — Python WheelHub server (FastAPI + uvicorn)
- `pennyfarthing-dist/src/pf/bikerack/launcher.py` — Python launcher (starts uvicorn)
- `pennyfarthing/pennyfarthing-dist/guides/bikerack.md` — BikeRack architecture guide
