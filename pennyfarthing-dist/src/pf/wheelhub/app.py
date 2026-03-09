"""FastAPI WheelHub application — replaces Node.js Express server.

Creates the FastAPI app with health check, OTLP endpoints, port file
management, and all API routes. Entry point for uvicorn.

Story 48-1: FastAPI skeleton + OTLP receiver.
Story 48-2: Port core API routes (data proxy, state, analysis, inline).
ADR-0022.
"""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .otlp import OTLPReceiver

# Module-level receiver instance (shared across routes)
_receiver = OTLPReceiver()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(title="WheelHub", docs_url=None, redoc_url=None)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

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
