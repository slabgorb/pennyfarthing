"""FastAPI Frame application — headless API + WebSocket server.

Creates the FastAPI app with health check, OTLP endpoints, WebSocket
channels, CORS, port file management, and all API routes.
TUI panels connect via WebSocket; no browser GUI.

Entry point for uvicorn.
"""

from __future__ import annotations

import asyncio
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .otlp import OTLPReceiver

# Module-level receiver instance (shared across routes)
_receiver = OTLPReceiver()

# WebSocket channel names for TUI panel data
WS_CHANNELS = [
    "sprint", "team", "tasks", "messages", "context", "stats",
    "claude", "git", "focus", "tandem", "settings", "persona",
    "diffs", "todos", "spans", "story", "bell", "token-stats",
    "hooks", "evaluation", "audit-log", "welcome",
    "benchmark-history", "benchmark-events",
    "subagent-transitions",
]

# Connected WebSocket clients per channel
_ws_clients: dict[str, set[WebSocket]] = {ch: set() for ch in WS_CHANNELS}


async def _ws_handler(websocket: WebSocket, channel: str) -> None:
    """Generic WebSocket handler — accept, send initial data, hold."""
    from .ws_push import send_initial_data

    await websocket.accept()
    _ws_clients[channel].add(websocket)
    try:
        # Send initial data for this channel
        await send_initial_data(websocket, channel)
        while True:
            # Keep connection alive, receive any client messages
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        _ws_clients[channel].discard(websocket)


async def broadcast(channel: str, data: dict) -> None:
    """Broadcast a message to all clients on a channel."""
    import json
    message = json.dumps(data)
    dead: list[WebSocket] = []
    for ws in _ws_clients.get(channel, set()):
        try:
            await ws.send_text(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _ws_clients[channel].discard(ws)


def _resolve_port() -> int:
    """Resolve the server port from FRAME_PORT env or default."""
    return int(os.environ.get("FRAME_PORT", "2898"))


def _resolve_project_dir() -> Path | None:
    """Resolve project dir from WHEELHUB_PROJECT_DIR env."""
    env = os.environ.get("WHEELHUB_PROJECT_DIR")
    return Path(env) if env else None


@asynccontextmanager
async def _lifespan(app: FastAPI):
    """Write .frame-port on startup, start poller, clean up on shutdown."""
    from .ws_push import poll_and_broadcast

    project_dir = _resolve_project_dir()
    port = _resolve_port()
    if project_dir:
        write_port_file(project_dir, port)
    # Start periodic broadcast for channels that change externally
    poll_task = asyncio.create_task(poll_and_broadcast(broadcast))
    try:
        yield
    finally:
        poll_task.cancel()
        try:
            await poll_task
        except asyncio.CancelledError:
            pass
        if project_dir:
            cleanup_port_file(project_dir)


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(title="Frame", docs_url=None, redoc_url=None, lifespan=_lifespan)

    # --- CORS middleware ---
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health() -> dict[str, str]:
        result: dict[str, str] = {"status": "ok"}
        project_dir = _resolve_project_dir()
        if project_dir:
            result["project_dir"] = str(project_dir)
        return result

    # --- OTLP endpoints ---

    @app.post("/v1/logs")
    async def otlp_logs(request: Request) -> JSONResponse:
        try:
            body = await request.json()
            new_spans = _receiver.process_logs(body)
            for span in new_spans:
                await broadcast("spans", {"type": "span", "span": span})
        except Exception:
            pass
        return JSONResponse({"partialSuccess": {}})

    @app.post("/v1/metrics")
    async def otlp_metrics(request: Request) -> JSONResponse:
        try:
            body = await request.json()
            from .otlp import parse_otlp_metrics
            parsed = parse_otlp_metrics(body)
            if parsed:
                _receiver.process_metrics(body)
                await broadcast("token-stats", _receiver.get_token_stats())
        except Exception:
            pass
        return JSONResponse({"partialSuccess": {}})

    @app.post("/v1/traces")
    async def otlp_traces(request: Request) -> JSONResponse:
        try:
            body = await request.json()
            new_spans = _receiver.process_traces(body)
            for span in new_spans:
                await broadcast("spans", {"type": "span", "span": span})
        except Exception:
            pass
        return JSONResponse({"partialSuccess": {}})

    # --- Mount all API route groups ---
    from .routes.analysis import all_analysis_routers
    from .routes.data_proxy import all_data_proxy_routers
    from .routes.inline import all_inline_routers
    from .routes.state import all_state_routers, set_receiver

    # Share the OTLP receiver with token-stats route
    set_receiver(_receiver)

    for router in all_data_proxy_routers:
        app.include_router(router)
    for router in all_state_routers:
        app.include_router(router)
    for router in all_analysis_routers:
        app.include_router(router)
    for router in all_inline_routers:
        app.include_router(router)

    # --- WebSocket channels ---
    for channel in WS_CHANNELS:
        # Create a closure to capture channel name
        def make_ws_route(ch: str):  # noqa: E301
            @app.websocket(f"/ws/{ch}")
            async def ws_endpoint(websocket: WebSocket) -> None:
                await _ws_handler(websocket, ch)
        make_ws_route(channel)

    return app


def write_port_file(project_dir: Path, port: int) -> None:
    """Write .frame-port file with the server port."""
    (project_dir / ".frame-port").write_text(str(port))


def cleanup_port_file(project_dir: Path) -> None:
    """Remove .frame-port file. No error if missing."""
    try:
        (project_dir / ".frame-port").unlink()
    except FileNotFoundError:
        pass


def get_server_command(port: int = 2898, host: str = "127.0.0.1") -> list[str]:
    """Return the command to start the Frame server via uvicorn."""
    return [
        sys.executable,
        "-m",
        "uvicorn",
        "pf.frame.app:create_app",
        "--factory",
        "--host",
        host,
        "--port",
        str(port),
    ]
