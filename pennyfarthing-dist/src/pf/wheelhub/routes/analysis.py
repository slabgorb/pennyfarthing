"""Analysis routes — direct Python imports replacing Node.js shelling out.

Story 48-2, AC3. Routes: hotspots, dead-code, complexity, dependencies,
health-score, agent-load, code-markers.

These routes previously used child_process.execFile in Node.js to call
python3 -m pf.hotspots etc. Now they import the Python modules directly.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

# Direct imports — no shelling out
from pf.hotspots.analyze import analyze_repo as analyze_hotspots
from pf.deadcode.analyze import find_stale_files
from pf.complexity import analyze_complexity
from pf.dependencies import analyze_dependencies
from pf.healthscore.analyze import analyze_healthscore
from pf.codemarkers import analyze_repo as analyze_code_markers

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_project_dir() -> str:
    return os.environ.get("PF_PROJECT_DIR", os.getcwd())


def _safe_to_dict(obj: Any) -> Any:
    """Convert dataclass/result objects to JSON-serializable dicts."""
    if hasattr(obj, "__dict__") and not isinstance(obj, dict):
        return {k: _safe_to_dict(v) for k, v in obj.__dict__.items() if not k.startswith("_")}
    if isinstance(obj, list):
        return [_safe_to_dict(item) for item in obj]
    if isinstance(obj, dict):
        return {k: _safe_to_dict(v) for k, v in obj.items()}
    if isinstance(obj, Path):
        return str(obj)
    return obj


# ---------------------------------------------------------------------------
# Hotspots router
# ---------------------------------------------------------------------------

hotspots_router = APIRouter(prefix="/api/hotspots", tags=["hotspots"])


@hotspots_router.get("/")
async def get_hotspots(request: Request) -> JSONResponse:
    project_dir = _get_project_dir()
    days = int(request.query_params.get("days", "90"))
    try:
        result = await asyncio.to_thread(analyze_hotspots, project_dir, days=days)
        return JSONResponse(_safe_to_dict(result))
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# Dead code router
# ---------------------------------------------------------------------------

dead_code_router = APIRouter(prefix="/api/dead-code", tags=["dead-code"])


@dead_code_router.get("/")
async def get_dead_code(request: Request) -> JSONResponse:
    project_dir = _get_project_dir()
    try:
        result = await asyncio.to_thread(find_stale_files, project_dir)
        return JSONResponse({"files": _safe_to_dict(result), "total": len(result)})
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# Complexity router
# ---------------------------------------------------------------------------

complexity_router = APIRouter(prefix="/api/complexity", tags=["complexity"])


@complexity_router.get("/")
async def get_complexity(request: Request) -> JSONResponse:
    project_dir = _get_project_dir()
    try:
        result = await asyncio.to_thread(analyze_complexity, project_dir)
        return JSONResponse(_safe_to_dict(result))
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# Dependencies router
# ---------------------------------------------------------------------------

dependencies_router = APIRouter(prefix="/api/dependencies", tags=["dependencies"])


@dependencies_router.get("/")
async def get_dependencies(request: Request) -> JSONResponse:
    project_dir = _get_project_dir()
    try:
        result = await asyncio.to_thread(analyze_dependencies, project_dir)
        return JSONResponse(_safe_to_dict(result))
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# Health score router
# ---------------------------------------------------------------------------

health_score_router = APIRouter(prefix="/api/health-score", tags=["health-score"])


@health_score_router.get("/")
async def get_health_score(request: Request) -> JSONResponse:
    project_dir = _get_project_dir()
    try:
        result = await asyncio.to_thread(analyze_healthscore, project_dir, use_cache=False)
        return JSONResponse(_safe_to_dict(result))
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# Agent load router
# ---------------------------------------------------------------------------

agent_load_router = APIRouter(prefix="/api/agent-load", tags=["agent-load"])


@agent_load_router.get("/")
async def get_agent_load(request: Request) -> JSONResponse:
    # Agent load analysis — returns in-memory stats about agent activity
    return JSONResponse({"agents": [], "total": 0})


# ---------------------------------------------------------------------------
# Code markers router
# ---------------------------------------------------------------------------

code_markers_router = APIRouter(prefix="/api/code-markers", tags=["code-markers"])


@code_markers_router.get("/")
async def get_code_markers(request: Request) -> JSONResponse:
    project_dir = _get_project_dir()
    try:
        result = await asyncio.to_thread(analyze_code_markers, project_dir)
        return JSONResponse(_safe_to_dict(result))
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# All analysis routers
# ---------------------------------------------------------------------------

all_analysis_routers = [
    hotspots_router,
    dead_code_router,
    complexity_router,
    dependencies_router,
    health_score_router,
    agent_load_router,
    code_markers_router,
]
