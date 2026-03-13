"""Subagent transition event emitter for BikeRack observability.

CLI commands (handoff, agent start) call emit_subagent_event() to POST
transition events to WheelHub. WheelHub broadcasts them on the
``subagent-transitions`` WebSocket channel. The SubagentPanel in
BikeRack TUI renders them as a live timeline.

Story: 143-16
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any


def _get_wheelhub_url() -> str | None:
    """Resolve the WheelHub base URL from port file or env."""
    port = os.environ.get("WHEELHUB_PORT")
    if port:
        return f"http://127.0.0.1:{port}"

    project_dir = os.environ.get(
        "WHEELHUB_PROJECT_DIR",
        os.environ.get("PF_PROJECT_DIR", ""),
    )
    if project_dir:
        port_file = Path(project_dir) / ".bikerack-port"
        if port_file.is_file():
            try:
                port = port_file.read_text().strip()
                return f"http://127.0.0.1:{port}"
            except Exception:
                pass

    # Try CWD
    cwd_port = Path.cwd() / ".bikerack-port"
    if cwd_port.is_file():
        try:
            port = cwd_port.read_text().strip()
            return f"http://127.0.0.1:{port}"
        except Exception:
            pass

    return None


def emit_subagent_event(
    event_type: str,
    *,
    agent: str = "",
    story_id: str = "",
    workflow: str = "",
    phase: str = "",
    from_phase: str = "",
    to_phase: str = "",
    gate_type: str = "",
    gate_passed: bool | None = None,
    next_agent: str = "",
    model: str = "",
    duration_ms: float | None = None,
    error: str = "",
) -> dict[str, Any]:
    """Emit a subagent transition event to WheelHub.

    Fire-and-forget: returns {success: True/False} but never raises.
    If WheelHub is not running, silently returns {success: False}.

    Event types:
        agent_start     - Agent activated (pf agent start)
        phase_complete  - Phase completed (pf handoff complete-phase)
        handoff         - Handoff marker emitted (pf handoff marker)
        gate_check      - Gate resolved (pf handoff resolve-gate)
    """
    url = _get_wheelhub_url()
    if not url:
        return {"success": False, "error": "WheelHub not running"}

    payload: dict[str, Any] = {
        "type": event_type,
        "timestamp": time.time() * 1000,  # ms epoch
    }
    if agent:
        payload["agent"] = agent
    if story_id:
        payload["story_id"] = story_id
    if workflow:
        payload["workflow"] = workflow
    if phase:
        payload["phase"] = phase
    if from_phase:
        payload["from_phase"] = from_phase
    if to_phase:
        payload["to_phase"] = to_phase
    if gate_type:
        payload["gate_type"] = gate_type
    if gate_passed is not None:
        payload["gate_passed"] = gate_passed
    if next_agent:
        payload["next_agent"] = next_agent
    if model:
        payload["model"] = model
    if duration_ms is not None:
        payload["duration_ms"] = duration_ms
    if error:
        payload["error"] = error

    try:
        import urllib.request
        import json

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{url}/api/subagent-event",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=2)
        return {"success": True}
    except Exception:
        return {"success": False, "error": "Failed to reach WheelHub"}
