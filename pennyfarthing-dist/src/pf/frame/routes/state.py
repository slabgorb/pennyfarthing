"""State routes — in-memory stores and file I/O for settings, permissions, etc.

Story 48-2, AC2. Routes: settings, permissions, audit-log, todos, token-stats,
telemetry, evaluation, spans.
"""

from __future__ import annotations

import csv
import io
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from pf.frame.otlp import OTLPReceiver

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_project_dir() -> str:
    return os.environ.get("PF_PROJECT_DIR", os.getcwd())


# ---------------------------------------------------------------------------
# Settings router
# ---------------------------------------------------------------------------

settings_router = APIRouter(prefix="/api/settings", tags=["settings"])

_settings: dict[str, Any] = {}


def _load_settings(project_dir: str) -> dict[str, Any]:
    """Load settings from config.local.yaml."""
    config_path = Path(project_dir, ".pennyfarthing", "config.local.yaml")
    result = dict(_settings)
    if config_path.is_file():
        try:
            import yaml

            config = yaml.safe_load(config_path.read_text()) or {}
            if config.get("theme"):
                result["theme"] = config["theme"]
            if config.get("display"):
                result["display"] = config["display"]
            if config.get("workflow"):
                result["workflow"] = {**result.get("workflow", {}), **config["workflow"]}
        except Exception:
            pass
    return result


@settings_router.get("/")
async def get_settings() -> JSONResponse:
    return JSONResponse(_load_settings(_get_project_dir()))


@settings_router.patch("/")
async def patch_settings(request: Request) -> JSONResponse:
    body = await request.json()
    _settings.update(body)
    return JSONResponse({"success": True})


@settings_router.get("/layout")
async def get_layout() -> JSONResponse:
    project_dir = _get_project_dir()
    config_path = Path(project_dir, ".pennyfarthing", "config.local.yaml")
    if config_path.is_file():
        try:
            import yaml

            config = yaml.safe_load(config_path.read_text()) or {}
            return JSONResponse({"layout": config.get("layout")})
        except Exception:
            pass
    return JSONResponse({"layout": None})


@settings_router.patch("/layout")
async def patch_layout(request: Request) -> JSONResponse:
    body = await request.json()
    project_dir = _get_project_dir()
    config_path = Path(project_dir, ".pennyfarthing", "config.local.yaml")
    try:
        import yaml

        config: dict[str, Any] = {}
        if config_path.is_file():
            config = yaml.safe_load(config_path.read_text()) or {}
        config["layout"] = body
        config_path.write_text(yaml.dump(config, default_flow_style=False))
        return JSONResponse({"success": True})
    except Exception:
        return JSONResponse({"error": "Failed to save layout"}, status_code=500)


@settings_router.get("/tui-layout")
async def get_tui_layout() -> JSONResponse:
    project_dir = _get_project_dir()
    config_path = Path(project_dir, ".pennyfarthing", "config.local.yaml")
    if config_path.is_file():
        try:
            import yaml

            config = yaml.safe_load(config_path.read_text()) or {}
            layout = config.get("tui_layout")
            return JSONResponse({"layout": layout})
        except Exception:
            pass
    return JSONResponse({"layout": None})



@settings_router.patch("/tui-layout")
async def patch_tui_layout(request: Request) -> JSONResponse:
    body = await request.json()
    project_dir = _get_project_dir()
    config_path = Path(project_dir, ".pennyfarthing", "config.local.yaml")
    try:
        import yaml

        config: dict[str, Any] = {}
        if config_path.is_file():
            config = yaml.safe_load(config_path.read_text()) or {}
        config["tui_layout"] = body
        config_path.write_text(yaml.dump(config, default_flow_style=False))
        return JSONResponse({"success": True})
    except Exception:
        return JSONResponse({"error": "Failed to save layout"}, status_code=500)



@settings_router.get("/themes")
async def get_themes() -> JSONResponse:
    project_dir = _get_project_dir()
    try:
        from pf.theme.discovery import list_themes

        themes = list_themes(project_dir)
        return JSONResponse({"themes": themes if isinstance(themes, list) else []})
    except Exception:
        return JSONResponse({"themes": []})


# ---------------------------------------------------------------------------
# Permissions router
# ---------------------------------------------------------------------------

permissions_router = APIRouter(prefix="/api/permissions", tags=["permissions"])

_grants: list[dict[str, Any]] = []
_VALID_GRANT_TYPES = ("once", "session", "always")


@permissions_router.get("/")
async def get_permissions() -> JSONResponse:
    return JSONResponse({"grants": _grants})


@permissions_router.post("/grant")
async def post_grant(request: Request) -> JSONResponse:
    body = await request.json()
    tool = body.get("tool")
    scope = body.get("scope")
    grant_type = body.get("grant_type", "session")

    if not tool or not isinstance(tool, str):
        return JSONResponse({"error": "Missing required field: tool"}, status_code=400)
    if not scope or not isinstance(scope, str):
        return JSONResponse({"error": "Missing required field: scope"}, status_code=400)
    if grant_type not in _VALID_GRANT_TYPES:
        return JSONResponse(
            {
                "error": f"Invalid grant_type: {grant_type}. Must be one of: {', '.join(_VALID_GRANT_TYPES)}"
            },
            status_code=400,
        )

    grant = {
        "tool": tool,
        "scope": scope,
        "grant_type": grant_type,
        "granted_at": datetime.now(UTC).isoformat(),
    }
    _grants.append(grant)
    return JSONResponse({"grant": grant}, status_code=201)


@permissions_router.delete("/revoke/{tool}")
async def revoke_grants(tool: str, request: Request) -> JSONResponse:
    scope_filter = request.query_params.get("scope")
    to_remove = [
        g for g in _grants if g["tool"] == tool and (not scope_filter or g["scope"] == scope_filter)
    ]
    for g in to_remove:
        _grants.remove(g)
    return JSONResponse({"removed": len(to_remove)})


@permissions_router.get("/show/{tool}")
async def show_grants(tool: str) -> JSONResponse:
    grants = [g for g in _grants if g["tool"] == tool]
    return JSONResponse({"grants": grants})


# ---------------------------------------------------------------------------
# Audit log router
# ---------------------------------------------------------------------------

audit_log_router = APIRouter(prefix="/api/audit-log", tags=["audit-log"])

_audit_entries: list[dict[str, Any]] = []
_tool_events: list[dict[str, Any]] = []


@audit_log_router.get("/")
async def get_audit_log() -> JSONResponse:
    return JSONResponse({"entries": _audit_entries, "total": len(_audit_entries)})


@audit_log_router.get("/events")
async def get_audit_events(request: Request) -> JSONResponse:
    # Basic filtering — return all for now (matches Node.js when no filters)
    return JSONResponse({"events": _tool_events, "total": len(_tool_events)})


@audit_log_router.get("/types")
async def get_audit_types() -> JSONResponse:
    types = sorted({e.get("type", "") for e in _tool_events})
    return JSONResponse({"types": types})


@audit_log_router.get("/stats")
async def get_audit_stats() -> JSONResponse:
    return JSONResponse(
        {
            "totalEntries": len(_audit_entries),
            "totalEvents": len(_tool_events),
        }
    )


@audit_log_router.get("/export/json")
async def export_audit_json() -> JSONResponse:
    return JSONResponse(_audit_entries)


@audit_log_router.get("/export/csv")
async def export_audit_csv() -> PlainTextResponse:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["timestamp", "type", "tool", "message"])
    for entry in _audit_entries:
        writer.writerow(
            [
                entry.get("timestamp", ""),
                entry.get("type", ""),
                entry.get("tool", ""),
                entry.get("message", ""),
            ]
        )
    return PlainTextResponse(output.getvalue(), media_type="text/csv")


@audit_log_router.delete("/")
async def reset_audit_log() -> JSONResponse:
    _audit_entries.clear()
    _tool_events.clear()
    return JSONResponse({"success": True})


# ---------------------------------------------------------------------------
# Todos router
# ---------------------------------------------------------------------------

todos_router = APIRouter(prefix="/api/todos", tags=["todos"])

_web_mode_todos: list[dict[str, Any]] = []


@todos_router.get("/")
async def get_todos() -> JSONResponse:
    return JSONResponse(_web_mode_todos)


# ---------------------------------------------------------------------------
# Token stats router
# ---------------------------------------------------------------------------

token_stats_router = APIRouter(prefix="/api/token-stats", tags=["token-stats"])

# Shared receiver instance — will be set from app.py
_receiver: OTLPReceiver | None = None


def set_receiver(receiver: OTLPReceiver) -> None:
    global _receiver
    _receiver = receiver


@token_stats_router.get("/")
async def get_token_stats() -> JSONResponse:
    if _receiver:
        return JSONResponse(_receiver.get_token_stats())
    return JSONResponse(
        {
            "inputTokens": 0,
            "outputTokens": 0,
            "cacheCreationTokens": 0,
            "cacheReadTokens": 0,
            "totalCost": 0,
        }
    )


# ---------------------------------------------------------------------------
# Telemetry router
# ---------------------------------------------------------------------------

telemetry_router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])

_tdd_metrics: dict[str, Any] = {}
_agent_stats: dict[str, Any] = {}
_story_stats: dict[str, Any] = {}


@telemetry_router.get("/")
async def get_telemetry() -> JSONResponse:
    return JSONResponse({"metrics": _tdd_metrics})


@telemetry_router.get("/tdd")
async def get_tdd_metrics() -> JSONResponse:
    return JSONResponse({"metrics": _tdd_metrics})


@telemetry_router.get("/hierarchy")
async def get_hierarchy() -> JSONResponse:
    return JSONResponse({"hierarchy": []})


@telemetry_router.get("/by-agent")
async def get_by_agent() -> JSONResponse:
    return JSONResponse({"stats": _agent_stats})


@telemetry_router.get("/by-story")
async def get_by_story() -> JSONResponse:
    return JSONResponse({"stats": _story_stats})


# ---------------------------------------------------------------------------
# Evaluation router
# ---------------------------------------------------------------------------

evaluation_router = APIRouter(prefix="/api/evaluation", tags=["evaluation"])

_evaluation: dict[str, Any] = {}
_eval_results: list[dict[str, Any]] = []


@evaluation_router.get("/")
async def get_evaluation() -> JSONResponse:
    return JSONResponse({"evaluation": _evaluation})


@evaluation_router.get("/results")
async def get_evaluation_results() -> JSONResponse:
    return JSONResponse({"results": _eval_results})


@evaluation_router.get("/summary")
async def get_evaluation_summary() -> JSONResponse:
    return JSONResponse({"summary": {}})


@evaluation_router.get("/trend")
async def get_evaluation_trend() -> JSONResponse:
    return JSONResponse({"trend": {}})


@evaluation_router.get("/recommendations")
async def get_evaluation_recommendations() -> JSONResponse:
    return JSONResponse({"recommendations": []})


@evaluation_router.delete("/")
async def clear_evaluation() -> JSONResponse:
    _evaluation.clear()
    _eval_results.clear()
    return JSONResponse({"success": True})


# ---------------------------------------------------------------------------
# Spans router
# ---------------------------------------------------------------------------

spans_router = APIRouter(prefix="/api/spans", tags=["spans"])

_enriched_spans: list[dict[str, Any]] = []


@spans_router.get("/")
async def get_spans() -> JSONResponse:
    return JSONResponse({"spans": _enriched_spans, "total": len(_enriched_spans)})


@spans_router.get("/filter")
async def get_spans_filter(request: Request) -> JSONResponse:
    # Basic: return all (filtering applied when populated)
    return JSONResponse({"spans": _enriched_spans, "total": len(_enriched_spans)})


@spans_router.delete("/")
async def clear_spans() -> JSONResponse:
    _enriched_spans.clear()
    return JSONResponse({"success": True})


# ---------------------------------------------------------------------------
# Benchmark router
# ---------------------------------------------------------------------------

benchmark_router = APIRouter(prefix="/api/benchmark", tags=["benchmark"])

_benchmark_events: list[dict[str, Any]] = []
_benchmark_phase: dict[str, Any] = {}


@benchmark_router.post("/phase")
async def post_benchmark_phase(request: Request) -> JSONResponse:
    """Receive phase transition from pipeline_replay and broadcast on benchmark-events."""
    body = await request.json()
    phase = body.get("phase", "")
    status = body.get("status", "")

    event = {
        "type": "phase",
        "phase": phase,
        "status": status,
        "timestamp": datetime.now(UTC).isoformat(),
    }
    _benchmark_phase.update(event)

    # Broadcast to benchmark-events channel
    try:
        import asyncio

        from pf.frame.app import broadcast
        asyncio.ensure_future(broadcast("benchmark-events", event))
    except Exception:
        pass

    return JSONResponse({"success": True})


@benchmark_router.get("/status")
async def get_benchmark_status() -> JSONResponse:
    return JSONResponse({"phase": _benchmark_phase, "events": len(_benchmark_events)})


# ---------------------------------------------------------------------------
# Subagent transitions router (Story 143-16)
# ---------------------------------------------------------------------------

subagent_router = APIRouter(prefix="/api", tags=["subagent"])

# In-memory ring buffer of recent transition events
MAX_SUBAGENT_EVENTS = 200
_subagent_events: list[dict[str, Any]] = []


@subagent_router.post("/subagent-event")
async def post_subagent_event(request: Request) -> JSONResponse:
    """Receive subagent transition event and broadcast on subagent-transitions."""
    body = await request.json()
    _subagent_events.append(body)
    if len(_subagent_events) > MAX_SUBAGENT_EVENTS:
        del _subagent_events[: len(_subagent_events) - MAX_SUBAGENT_EVENTS]

    # Broadcast to connected TUI panels
    try:
        import asyncio

        from pf.frame.app import broadcast
        asyncio.ensure_future(broadcast("subagent-transitions", {"type": "event", "event": body}))
    except Exception:
        pass

    return JSONResponse({"success": True})


@subagent_router.get("/subagent-events")
async def get_subagent_events() -> JSONResponse:
    """Return recent subagent transition events."""
    return JSONResponse({"events": _subagent_events, "total": len(_subagent_events)})


# ---------------------------------------------------------------------------
# All state routers
# ---------------------------------------------------------------------------

all_state_routers = [
    settings_router,
    permissions_router,
    audit_log_router,
    todos_router,
    token_stats_router,
    telemetry_router,
    evaluation_router,
    spans_router,
    benchmark_router,
    subagent_router,
]
