"""Saddle core — pane creation, agent lifecycle, and status reporting.

Saddle provides a dedicated tmux pane for interactive agent sessions.
It sits between the CLI (Claude Code) and TUI panels.

Layout (top to bottom): CLI → Saddle → TUI

Story 143-17
"""

from __future__ import annotations

import json
import shlex
from pathlib import Path

from pf.tmux import panes as _panes

VALID_AGENTS = {
    "sm", "tea", "dev", "reviewer", "architect", "pm",
    "tech-writer", "ux-designer", "devops", "orchestrator", "ba",
}

_STATE_FILE = "saddle-state.json"


def _state_path(project_root: Path) -> Path:
    return project_root / ".pennyfarthing" / _STATE_FILE


def _load_state(project_root: Path) -> dict:
    path = _state_path(project_root)
    if path.exists():
        try:
            return json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {"active": False, "agent": None, "pane_id": None}


def _save_state(project_root: Path, state: dict) -> None:
    path = _state_path(project_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2) + "\n")


def _pane_is_alive(pane_id: str, session: str) -> bool:
    """Check if a pane_id is still alive in tmux."""
    live_result = _panes.list_live_panes(session)
    if not live_result["success"]:
        return False
    return any(p["pane_id"] == pane_id for p in live_result["data"])


def ensure_saddle_pane(project_root: Path) -> dict:
    """Create or reuse a saddle pane between CLI and TUI.

    Returns:
        {success: True, data: {pane_id: str}} or {success: False, error: str}
    """
    if not _panes.is_tmux_running():
        return {"success": False, "error": "tmux is not running on pf socket"}

    session_result = _panes.get_session_name()
    if not session_result["success"]:
        return {"success": False, "error": session_result["error"]}
    session = session_result["data"]

    state = _load_state(project_root)
    cached_pane_id = state.get("pane_id")

    # Verify cached pane is still alive before reusing
    if cached_pane_id and _pane_is_alive(cached_pane_id, session):
        return {"success": True, "data": {"pane_id": cached_pane_id}}

    # Cached pane is dead or missing — clear it and create a new one
    live_result = _panes.list_live_panes(session)
    if not live_result["success"]:
        return {"success": False, "error": live_result["error"]}

    # Find CLI pane to split below
    cli_pane = None
    for p in live_result["data"]:
        if "claude" in p["title"].lower():
            cli_pane = p
            break
    if not cli_pane and live_result["data"]:
        cli_pane = live_result["data"][0]
    if not cli_pane:
        return {"success": False, "error": "No panes found to split"}

    split_result = _panes.split_pane(
        session, cli_pane["pane_id"], direction="v", size_pct=20,
    )
    if not split_result["success"]:
        return {"success": False, "error": split_result["error"]}

    pane_id = split_result["data"].strip()
    _panes.set_pane_title(pane_id, "Saddle")

    state["pane_id"] = pane_id
    _save_state(project_root, state)

    return {"success": True, "data": {"pane_id": pane_id}}


def start_agent(agent_name: str, project_root: Path) -> dict:
    """Start an agent in the saddle pane.

    Returns:
        {success: True, data: {agent: str, pane_id: str, command: str}} or error dict
    """
    if not agent_name:
        return {"success": False, "error": "Agent name cannot be empty"}

    if agent_name not in VALID_AGENTS:
        return {"success": False, "error": f"Unknown agent: {agent_name}"}

    if not _panes.is_tmux_running():
        return {"success": False, "error": "tmux is not running on pf socket"}

    # Stop any existing agent before starting a new one
    state = _load_state(project_root)
    if state.get("active") and state.get("agent"):
        stop_agent(project_root)

    pane_result = ensure_saddle_pane(project_root)
    if not pane_result["success"]:
        return pane_result

    pane_id = pane_result["data"]["pane_id"]
    command = f"claude /pf-{agent_name}"

    # Send command to saddle pane
    send_result = _panes.send_keys(pane_id, command)
    if not send_result["success"]:
        return {"success": False, "error": f"Failed to send command: {send_result['error']}"}

    # Emit telemetry (fire-and-forget, Story 143-16)
    try:
        from pf.frame.subagent_events import emit_subagent_event

        emit_subagent_event("agent_start", agent=agent_name)
    except Exception:
        pass

    state = _load_state(project_root)
    state["active"] = True
    state["agent"] = agent_name
    state["pane_id"] = pane_id
    _save_state(project_root, state)

    return {"success": True, "data": {"agent": agent_name, "pane_id": pane_id, "command": command}}


def stop_agent(project_root: Path) -> dict:
    """Stop the running agent in saddle.

    Returns:
        {success: True, data: {agent_stopped: str}} or {success: False, error: str}
    """
    state = _load_state(project_root)

    if not state.get("active") or not state.get("agent"):
        return {"success": False, "error": "No agent running in saddle"}

    agent_stopped = state["agent"]
    pane_id = state.get("pane_id")

    # Send Ctrl-C to interrupt the agent
    if pane_id:
        interrupt_result = _panes.send_keys(pane_id, "C-c")
        if not interrupt_result.get("success"):
            state["active"] = False
            state["agent"] = None
            _save_state(project_root, state)
            return {"success": True, "data": {"agent_stopped": agent_stopped, "warning": "Ctrl-C may not have reached the pane"}}

    state["active"] = False
    state["agent"] = None
    _save_state(project_root, state)

    return {"success": True, "data": {"agent_stopped": agent_stopped}}


def summon_agent(agent_name: str, project_root: Path, *, task: str | None = None) -> dict:
    """Summon an agent into the saddle pane with full prime context.

    Unlike start_agent which sends `claude /pf-{agent}`, summon builds a
    command that includes `pf agent start` context and an optional task description.

    Args:
        agent_name: The agent role to summon (e.g., "dev", "tea").
        project_root: Path to the project root.
        task: Optional task description for the summoned agent.

    Returns:
        {success: True, data: {agent, pane_id, command, task?}} or error dict
    """
    if not agent_name:
        return {"success": False, "error": "Agent name cannot be empty"}

    if agent_name not in VALID_AGENTS:
        return {"success": False, "error": f"Unknown agent: {agent_name}"}

    if not _panes.is_tmux_running():
        return {"success": False, "error": "tmux is not running on pf socket"}

    # Stop any existing agent before summoning a new one
    state = _load_state(project_root)
    if state.get("active") and state.get("agent"):
        stop_agent(project_root)

    pane_result = ensure_saddle_pane(project_root)
    if not pane_result["success"]:
        return pane_result

    pane_id = pane_result["data"]["pane_id"]

    # Build command with full prime context via pf agent start
    if task:
        # Close double quotes BEFORE the task so shlex.quote() operates at
        # the top quoting level where single quotes ARE protective.
        # Shell sees: "...Your task: " (double-quoted) + 'safe-task' (single-quoted).
        command = (
            f'claude -p "$(pf agent start {agent_name})\n\n'
            f'Your task: "{shlex.quote(task)}'
        )
    else:
        command = f'claude -p "$(pf agent start {agent_name})"'

    # Send command to saddle pane
    send_result = _panes.send_keys(pane_id, command)
    if not send_result["success"]:
        return {"success": False, "error": f"Failed to send command: {send_result['error']}"}

    # Emit telemetry (fire-and-forget)
    try:
        from pf.wheelhub.subagent_events import emit_subagent_event

        emit_subagent_event("agent_summon", agent=agent_name)
    except Exception:
        pass

    state["active"] = True
    state["agent"] = agent_name
    state["pane_id"] = pane_id
    _save_state(project_root, state)

    data: dict = {"agent": agent_name, "pane_id": pane_id, "command": command}
    if task:
        data["task"] = task  # Return original task value for visibility

    return {"success": True, "data": data}


def status(project_root: Path) -> dict:
    """Query current saddle state.

    Returns:
        {success: True, data: {active: bool, agent?: str, pane_id?: str}}
    """
    state = _load_state(project_root)

    return {
        "success": True,
        "data": {
            "active": bool(state.get("active")),
            "agent": state.get("agent"),
            "pane_id": state.get("pane_id"),
        },
    }
