"""Inline endpoints — ported from server.ts direct route definitions.

Story 48-2, AC4. Routes: welcome, bell-queue, bell-consumed,
pending-tool-input, hook-request.

These were defined inline in the Node.js server.ts rather than as
separate Express router modules.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# Welcome endpoint
# ---------------------------------------------------------------------------

welcome_router = APIRouter(prefix="/api/welcome", tags=["welcome"])

_welcome_message: dict[str, Any] = {}


@welcome_router.post("/")
async def post_welcome(request: Request) -> JSONResponse:
    body = await request.json()
    _welcome_message.update(body)
    return JSONResponse({"success": True, "broadcast": True})


# ---------------------------------------------------------------------------
# Bell queue endpoint
# ---------------------------------------------------------------------------

bell_queue_router = APIRouter(prefix="/api/bell-queue", tags=["bell"])

_bell_queue: list[dict[str, Any]] = []


@bell_queue_router.post("/")
async def post_bell_queue(request: Request) -> JSONResponse:
    body = await request.json()
    items = body.get("items", [])
    _bell_queue.clear()
    _bell_queue.extend(items)
    return JSONResponse({"success": True, "queued": len(items)})


# ---------------------------------------------------------------------------
# Bell consumed endpoint
# ---------------------------------------------------------------------------

bell_consumed_router = APIRouter(prefix="/api/bell-consumed", tags=["bell"])


@bell_consumed_router.post("/")
async def post_bell_consumed(request: Request) -> JSONResponse:
    return JSONResponse({"success": True, "broadcast": True})


# ---------------------------------------------------------------------------
# Pending tool input endpoint
# ---------------------------------------------------------------------------

pending_tool_input_router = APIRouter(prefix="/api/pending-tool-input", tags=["tool-input"])


@pending_tool_input_router.post("/")
async def post_pending_tool_input(request: Request) -> JSONResponse:
    _ = await request.json()  # consume body for protocol compliance
    return JSONResponse({"success": True, "forwarded": True})


# ---------------------------------------------------------------------------
# Hook request endpoint
# ---------------------------------------------------------------------------

hook_request_router = APIRouter(prefix="/api/hook-request", tags=["hooks"])

_pending_approvals: dict[str, dict[str, Any]] = {}


@hook_request_router.post("/")
async def post_hook_request(request: Request) -> JSONResponse:
    body = await request.json()
    request_id = body.get("request_id", "")
    _pending_approvals[request_id] = body
    return JSONResponse({"success": True, "request_id": request_id})


@hook_request_router.get("/pending")
async def get_pending_approvals() -> JSONResponse:
    return JSONResponse({"pending": list(_pending_approvals.values())})


@hook_request_router.post("/resolve/{request_id}")
async def resolve_approval(request_id: str, request: Request) -> JSONResponse:
    await request.json()  # consume body
    if request_id in _pending_approvals:
        del _pending_approvals[request_id]
        return JSONResponse({"success": True, "resolved": True})
    return JSONResponse({"error": "Request not found"}, status_code=404)


# ---------------------------------------------------------------------------
# All inline routers
# ---------------------------------------------------------------------------

all_inline_routers = [
    welcome_router,
    bell_queue_router,
    bell_consumed_router,
    pending_tool_input_router,
    hook_request_router,
]
