"""Peloton live mode — persistent tmux panes for team mode agents.

Pre-spawns tmux panes at story start, one per agent role in the workflow.
Panes persist through the full story lifecycle. User drives phase advancement
with `pf peloton next` and can switch to any pane with `pf peloton switch`.

This is NOT the replay/benchmark mode (see pane_orchestrator.py, result_aggregator.py).
This is the live working mode for real stories.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pf.tmux import panes as _panes
from pf.workflow.helpers import find_workflow_file, load_workflow_data


_STATE_FILE = "peloton-state.json"


def _state_path(project_root: Path) -> Path:
    return project_root / ".pennyfarthing" / _STATE_FILE


def load_state(project_root: Path) -> dict[str, Any]:
    """Load peloton state from disk.

    Returns:
        State dict or empty default if no state file exists.
    """
    path = _state_path(project_root)
    if path.exists():
        try:
            return json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {"active": False, "story_id": None, "workflow": None, "panes": {}, "active_role": None}


def save_state(project_root: Path, state: dict[str, Any]) -> dict[str, Any]:
    """Save peloton state to disk.

    Returns:
        {success: True} or {success: False, error: ...}
    """
    path = _state_path(project_root)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(state, indent=2) + "\n")
        return {"success": True}
    except OSError as e:
        return {"success": False, "error": str(e)}


def get_workflow_agents(workflow_name: str) -> dict[str, Any]:
    """Extract unique agent roles from a workflow's phases.

    Returns:
        {success: True, data: ["tea", "dev", "reviewer", ...]} or error
    """
    raise NotImplementedError("get_workflow_agents not implemented")


def spawn_panes(
    project_root: Path,
    story_id: str,
    workflow_name: str,
) -> dict[str, Any]:
    """Pre-spawn one tmux pane per agent role in the workflow.

    Creates idle shell panes (does NOT start claude in them).
    Registers panes in tmux registry and saves peloton state.

    Returns:
        {success: True, data: {role: pane_id, ...}} or error
    """
    raise NotImplementedError("spawn_panes not implemented")


def activate_next(project_root: Path) -> dict[str, Any]:
    """Activate the next workflow phase's agent in its pane.

    Reads current phase from session file, determines next agent,
    launches claude in that agent's pane.

    Returns:
        {success: True, data: {role, pane_id, command}} or error
    """
    raise NotImplementedError("activate_next not implemented")


def switch_to(project_root: Path, role: str) -> dict[str, Any]:
    """Switch to a specific agent's pane.

    Focuses the pane via tmux select-pane. Optionally starts the
    agent if not already running.

    Returns:
        {success: True, data: {role, pane_id}} or error
    """
    raise NotImplementedError("switch_to not implemented")


def get_status(project_root: Path) -> dict[str, Any]:
    """Get current peloton status.

    Returns:
        {success: True, data: {story_id, workflow, panes: [...], active_role, phase}} or error
    """
    raise NotImplementedError("get_status not implemented")


def stop(project_root: Path) -> dict[str, Any]:
    """Tear down all peloton panes and remove state.

    Kills all panes with peloton- prefix. Does NOT kill protected panes.

    Returns:
        {success: True, data: {killed: [...]}} or error
    """
    raise NotImplementedError("stop not implemented")
