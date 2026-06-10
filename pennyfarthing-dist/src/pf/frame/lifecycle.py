"""Frame server self-termination lifecycle (Story 161-1, gh #97).

A long-lived ``pf.frame.app`` uvicorn server must not outlive the Claude Code
session that owns it — orphaned servers compound the kernel-side Mach-message
leak. The parent ``atexit`` cleanup in ``launcher.register_cleanup`` cannot
catch abnormal parent death (SIGKILL/crash), so the self-termination decision
lives *inside* the frame process.

This module exposes:

- :data:`DEFAULT_IDLE_TIMEOUT_S` — default idle window before shutdown.
- :func:`resolve_owner_pid` — owning-session PID from ``FRAME_OWNER_PID`` env.
- :func:`resolve_idle_timeout_s` — idle window from ``FRAME_IDLE_TIMEOUT_S`` env.
- :func:`should_shutdown` — pure decision function (unit-tested in isolation).
- :func:`monitor_and_shutdown` — async monitor wired into ``_lifespan``.
"""

from __future__ import annotations

import asyncio
import os
import time
from typing import Any, Callable

# Sane positive default: 30 minutes of no clients before an idle frame
# self-terminates. Overridable via FRAME_IDLE_TIMEOUT_S.
DEFAULT_IDLE_TIMEOUT_S: float = 1800.0

# How often the monitor re-evaluates the shutdown decision.
MONITOR_INTERVAL_S: float = 30.0


def resolve_owner_pid() -> int | None:
    """Parse the owning-session PID from ``FRAME_OWNER_PID``.

    Returns ``None`` when the env var is absent or not an integer — in that
    case owner-liveness can't gate shutdown and only idle-timeout applies.
    """
    raw = os.environ.get("FRAME_OWNER_PID")
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def resolve_idle_timeout_s() -> float:
    """Parse the idle window from ``FRAME_IDLE_TIMEOUT_S`` (else the default)."""
    raw = os.environ.get("FRAME_IDLE_TIMEOUT_S")
    if not raw:
        return DEFAULT_IDLE_TIMEOUT_S
    try:
        return float(raw)
    except (TypeError, ValueError):
        return DEFAULT_IDLE_TIMEOUT_S


def should_shutdown(
    *,
    owner_pid: int | None,
    owner_alive: bool,
    active_clients: int,
    last_activity: float,
    now: float,
    idle_timeout_s: float,
) -> bool:
    """Decide whether the frame server should self-terminate.

    Triggers (either is sufficient):

    - **Owner-liveness:** an owner PID is configured but its process is gone.
      An orphaned frame must not survive its session.
    - **Idle-timeout:** no clients are connected and the time since the last
      activity is *strictly greater* than the idle window. The boundary
      (``now - last_activity == idle_timeout_s``) keeps the server running.
    """
    if owner_pid is not None and not owner_alive:
        return True
    if active_clients == 0 and (now - last_activity) > idle_timeout_s:
        return True
    return False


async def monitor_and_shutdown(
    *,
    count_active_clients: Callable[[], int],
    last_activity_getter: Callable[[], float],
    trigger_shutdown: Callable[[], Any],
    interval_s: float = MONITOR_INTERVAL_S,
) -> None:
    """Periodically evaluate :func:`should_shutdown` and trigger a clean exit.

    Owner-liveness is checked via ``launcher.is_process_alive``. When a shutdown
    condition is met, ``trigger_shutdown`` is invoked (which flips uvicorn's
    ``should_exit`` so the server unwinds cleanly) and the monitor returns.
    """
    from .launcher import is_process_alive

    owner_pid = resolve_owner_pid()
    idle_timeout_s = resolve_idle_timeout_s()

    while True:
        await asyncio.sleep(interval_s)
        owner_alive = is_process_alive(owner_pid) if owner_pid is not None else True
        if should_shutdown(
            owner_pid=owner_pid,
            owner_alive=owner_alive,
            active_clients=count_active_clients(),
            last_activity=last_activity_getter(),
            now=time.monotonic(),
            idle_timeout_s=idle_timeout_s,
        ):
            trigger_shutdown()
            return
