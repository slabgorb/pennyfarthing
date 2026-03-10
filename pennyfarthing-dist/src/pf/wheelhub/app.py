"""FastAPI WheelHub application — replaces Node.js Express server.

Creates the FastAPI app with health check, OTLP endpoints, WebSocket
channels, static file serving, CORS, port file management, and all
API routes. Entry point for uvicorn.

Story 48-1: FastAPI skeleton + OTLP receiver.
Story 48-2: Port core API routes (data proxy, state, analysis, inline).
ADR-0022, ADR-0034.
"""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .otlp import OTLPReceiver

# Module-level receiver instance (shared across routes)
_receiver = OTLPReceiver()

# WebSocket channel names the React GUI connects to
WS_CHANNELS = [
    "sprint", "team", "tasks", "messages", "context", "stats",
    "claude", "git", "focus", "tandem", "settings", "persona",
    "diffs", "todos", "spans", "story", "bell", "token-stats",
    "hooks", "evaluation", "audit-log", "welcome",
]

# Connected WebSocket clients per channel
_ws_clients: dict[str, set[WebSocket]] = {ch: set() for ch in WS_CHANNELS}


async def _ws_handler(websocket: WebSocket, channel: str) -> None:
    """Generic WebSocket handler — accept, hold, broadcast."""
    await websocket.accept()
    _ws_clients[channel].add(websocket)
    try:
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


def _find_static_dir() -> Path | None:
    """Find the Vite-built React GUI assets directory."""
    # In monorepo: packages/cyclist/dist/public/ or packages/core/dist/public/
    # Walk up from this file to find the repo root
    current = Path(__file__).parent
    for _ in range(10):
        for pkg in ("cyclist", "core"):
            candidate = current / "packages" / pkg / "dist" / "public"
            if candidate.is_dir():
                return candidate
        parent = current.parent
        if parent == current:
            break
        current = parent
    return None


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(title="WheelHub", docs_url=None, redoc_url=None)

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
        return {"status": "ok"}

    # --- OTLP endpoints ---

    @app.post("/v1/logs")
    async def otlp_logs(request: Request) -> JSONResponse:
        try:
            body = await request.json()
            _receiver.process_logs(body)
        except Exception:
            pass
        return JSONResponse({"partialSuccess": {}})

    @app.post("/v1/metrics")
    async def otlp_metrics(request: Request) -> JSONResponse:
        try:
            body = await request.json()
            _receiver.process_metrics(body)
        except Exception:
            pass
        return JSONResponse({"partialSuccess": {}})

    @app.post("/v1/traces")
    async def otlp_traces(request: Request) -> JSONResponse:
        try:
            body = await request.json()
            _receiver.process_traces(body)
        except Exception:
            pass
        return JSONResponse({"partialSuccess": {}})

    # --- Story 48-2: Mount all API route groups ---
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

    # --- Static file serving for React GUI ---
    static_dir = _find_static_dir()
    if static_dir:
        # Serve static assets (JS, CSS, images)
        app.mount("/js", StaticFiles(directory=str(static_dir / "js")), name="js")
        app.mount("/css", StaticFiles(directory=str(static_dir / "css")), name="css")
        if (static_dir / "assets").is_dir():
            app.mount("/assets", StaticFiles(directory=str(static_dir / "assets")), name="assets")

        # SPA catch-all: serve index.html for non-API paths
        index_html = static_dir / "index.html"
        if index_html.is_file():
            @app.get("/bikerack")
            @app.get("/bikerack/{path:path}")
            async def spa_bikerack(path: str = "") -> FileResponse:
                return FileResponse(str(index_html))

            @app.get("/")
            async def spa_root() -> FileResponse:
                return FileResponse(str(index_html))

    return app


def write_port_file(project_dir: Path, port: int) -> None:
    """Write .bikerack-port file with the server port."""
    (project_dir / ".bikerack-port").write_text(str(port))


def cleanup_port_file(project_dir: Path) -> None:
    """Remove .bikerack-port file. No error if missing."""
    try:
        (project_dir / ".bikerack-port").unlink()
    except FileNotFoundError:
        pass


def get_server_command(port: int = 1898, host: str = "127.0.0.1") -> list[str]:
    """Return the command to start the WheelHub server via uvicorn."""
    return [
        sys.executable,
        "-m",
        "uvicorn",
        "pf.wheelhub.app:create_app",
        "--factory",
        "--host",
        host,
        "--port",
        str(port),
    ]
