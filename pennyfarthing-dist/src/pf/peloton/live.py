"""Peloton live mode — team mode agents for story workflows.

Initializes workflow state and provides team-mode activation data for the
SM agent to spawn teammates via TeamCreate. Does NOT spawn tmux panes —
team mode agents run within the current Claude Code session.

Legacy spawn_panes() is retained for backward compatibility but
start_session() is the preferred entry point.

This is NOT the replay/benchmark mode (see pane_orchestrator.py, result_aggregator.py).
This is the live working mode for real stories.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pf.common.config import get_project_root
from pf.tmux import panes as _panes
from pf.tmux.registry import registry_path, save_registry
from pf.workflow.helpers import find_workflow_file, get_all_workflows_dirs, load_workflow_data

_STATE_FILE = "peloton-state.json"

# Counter for generating unique pane IDs when tmux is unavailable (tests)
_pane_counter = 0


def _next_pane_id() -> str:
    global _pane_counter
    _pane_counter += 1
    return f"%{100 + _pane_counter}"


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
    return {"active": False, "story_id": None, "workflow": None, "panes": {}, "agents": [], "active_role": None}


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


def get_workflow_agents(workflow_name: str, project_root: Path | None = None) -> dict[str, Any]:
    """Extract unique agent roles from a workflow's phases.

    Args:
        workflow_name: Name of the workflow
        project_root: Project root directory (optional, uses system root if None)

    Returns:
        {success: True, data: ["tea", "dev", "reviewer", ...]} or error
    """
    # Try to find workflow in the specified project root first
    if project_root is not None:
        workflows_dirs = get_all_workflows_dirs(project_root)
        wf_file = find_workflow_file(workflows_dirs, workflow_name)
        if wf_file is not None:
            data = load_workflow_data(wf_file)
            agents = _extract_agents(data)
            if agents is not None:
                return {"success": True, "data": agents}

    # Fallback to system workflows
    try:
        system_root = get_project_root()
        workflows_dirs = get_all_workflows_dirs(system_root)
        wf_file = find_workflow_file(workflows_dirs, workflow_name)
        if wf_file is not None:
            data = load_workflow_data(wf_file)
            agents = _extract_agents(data)
            if agents is not None:
                return {"success": True, "data": agents}
    except Exception:
        pass

    return {"success": False, "error": f"Workflow '{workflow_name}' not found"}


def _extract_agents(data: dict[str, Any]) -> list[str] | None:
    """Extract unique agent roles from workflow data.

    Returns:
        List of agents or None if data is invalid.
    """
    phases = data.get("workflow", {}).get("phases", [])
    if not phases:
        return None

    # Extract unique agent roles, preserving first-seen order
    # Exclude SM — SM is the team lead in the main session, not a teammate
    seen: set[str] = set()
    agents: list[str] = []
    for phase in phases:
        agent = phase.get("agent")
        if agent and agent not in seen and agent != "sm":
            seen.add(agent)
            agents.append(agent)

    return agents if agents else None


def _register_panes_in_tmux_registry(
    project_root: Path,
    pane_state: dict[str, dict[str, Any]],
) -> None:
    """Register peloton panes in the tmux registry.

    Loads existing registry (or creates one), appends peloton pane entries,
    and saves. This makes peloton panes visible to pf tmux read/send/list.
    """
    reg_file = registry_path(project_root)
    if reg_file.exists():
        try:
            reg = json.loads(reg_file.read_text())
        except (json.JSONDecodeError, OSError):
            reg = {"session": "", "socket": "pf", "max_panes": 10, "panes": []}
    else:
        reg = {"session": "", "socket": "pf", "max_panes": 10, "panes": []}

    # Remove any existing peloton entries (in case of restart)
    reg["panes"] = [p for p in reg["panes"] if not p.get("title", "").startswith("peloton-")]

    # Add new peloton entries
    for _role, info in pane_state.items():
        reg["panes"].append({
            "pane_id": info["pane_id"],
            "role": "worker",
            "title": info["title"],
            "protected": False,
            "owner": "peloton",
        })

    save_registry(project_root, reg)


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
    agents_result = get_workflow_agents(workflow_name, project_root)
    if not agents_result["success"]:
        return agents_result

    agents = agents_result["data"]
    pane_map: dict[str, str] = {}
    pane_state: dict[str, dict[str, Any]] = {}

    for role in agents:
        pane_id = _allocate_pane(project_root, role)
        pane_map[role] = pane_id
        pane_state[role] = {
            "pane_id": pane_id,
            "title": f"peloton-{role}",
            "agent_started": False,
        }

    state = {
        "active": True,
        "story_id": story_id,
        "workflow": workflow_name,
        "panes": pane_state,
        "active_role": None,
        "created_at": datetime.now(UTC).isoformat(),
    }
    save_state(project_root, state)

    # Register panes in tmux registry so pf tmux read/send/list works
    _register_panes_in_tmux_registry(project_root, pane_state)

    return {"success": True, "data": pane_map}


def start_session(
    project_root: Path,
    story_id: str,
    workflow_name: str,
) -> dict[str, Any]:
    """Initialize peloton state for team mode — no tmux panes.

    Records workflow agent order in state so activate_next can advance
    through the team. Does NOT spawn tmux panes — team mode agents run
    as teammates within the current Claude Code session.

    Returns:
        {success: True, data: {agents: [...]}} or error
    """
    agents_result = get_workflow_agents(workflow_name, project_root)
    if not agents_result["success"]:
        return agents_result

    agents = agents_result["data"]

    state = {
        "active": True,
        "story_id": story_id,
        "workflow": workflow_name,
        "agents": agents,
        "active_role": None,
        "created_at": datetime.now(UTC).isoformat(),
    }
    save_state(project_root, state)

    return {"success": True, "data": {"agents": agents}}


def activate_next(project_root: Path) -> dict[str, Any]:
    """Activate the next agent in the peloton workflow.

    Returns team-mode activation data for the caller (SM as team lead)
    to spawn the agent as a teammate via TeamCreate/Agent/SendMessage.

    Returns:
        {success: True, data: {role, team_name, prompt, story_id}} or error
    """
    state = load_state(project_root)
    if not state.get("active"):
        return {"success": False, "error": "No peloton session active. Run 'pf peloton start' first."}

    workflow_name = state.get("workflow")
    if not workflow_name:
        return {"success": False, "error": "No workflow in peloton state"}

    story_id = state.get("story_id")

    # Use agents from state (start_session) or fall back to workflow query (spawn_panes)
    agents = state.get("agents")
    if not agents:
        agents_result = get_workflow_agents(workflow_name, project_root)
        if not agents_result["success"]:
            return agents_result
        agents = agents_result["data"]

    current = state.get("active_role")

    # Determine next role
    if current is None:
        next_role = agents[0]
    else:
        try:
            idx = agents.index(current)
            if idx + 1 >= len(agents):
                return {"success": False, "error": f"Already at last phase ({current}). No next agent."}
            next_role = agents[idx + 1]
        except ValueError:
            next_role = agents[0]

    team_name = f"peloton-{story_id}"
    prompt = f'Run `pf agent start {next_role}`. Story: {story_id}.'

    # Update state
    state["active_role"] = next_role
    if next_role in state.get("panes", {}):
        state["panes"][next_role]["agent_started"] = True
    save_state(project_root, state)

    return {
        "success": True,
        "data": {
            "role": next_role,
            "team_name": team_name,
            "prompt": prompt,
            "story_id": story_id,
        },
    }


def switch_to(project_root: Path, role: str) -> dict[str, Any]:
    """Switch to a specific agent's pane.

    Focuses the pane via tmux select-pane.

    Returns:
        {success: True, data: {role, pane_id}} or error
    """
    state = load_state(project_root)
    if not state.get("active") or not state.get("panes"):
        return {"success": False, "error": "No peloton session active."}

    pane_info = state["panes"].get(role)
    if not pane_info:
        return {"success": False, "error": f"No pane for role '{role}'"}

    pane_id = pane_info["pane_id"]

    # Try to focus pane in tmux
    try:
        _panes._run_tmux("select-pane", "-t", pane_id)
    except Exception:
        pass

    state["active_role"] = role
    save_state(project_root, state)

    return {"success": True, "data": {"role": role, "pane_id": pane_id}}


def get_status(project_root: Path) -> dict[str, Any]:
    """Get current peloton status.

    Returns:
        {success: True, data: {story_id, workflow, panes, active_role}} or error
    """
    state = load_state(project_root)

    return {
        "success": True,
        "data": {
            "story_id": state.get("story_id"),
            "workflow": state.get("workflow"),
            "agents": state.get("agents", []),
            "panes": state.get("panes", {}),
            "active_role": state.get("active_role"),
        },
    }


def stop(project_root: Path) -> dict[str, Any]:
    """Tear down all peloton panes and remove state.

    Kills all panes with peloton- prefix. Does NOT kill protected panes.

    Returns:
        {success: True, data: {killed: [...]}} or error
    """
    state = load_state(project_root)
    killed: list[str] = []

    for _role, pane_info in state.get("panes", {}).items():
        pane_id = pane_info.get("pane_id")
        if pane_id:
            try:
                _panes.kill_pane(pane_id)
            except Exception:
                pass
            killed.append(pane_id)

    # Clear state
    cleared = {
        "active": False,
        "story_id": None,
        "workflow": None,
        "panes": {},
        "agents": [],
        "active_role": None,
    }
    save_state(project_root, cleared)

    return {"success": True, "data": {"killed": killed}}


def _is_real_project(project_root: Path) -> bool:
    """Check if this is a real project root (not a test tmp_path).

    Real projects have .pennyfarthing/ with actual config files.
    Test tmp_paths only have the bare .pennyfarthing/ directory.
    """
    return (project_root / ".pennyfarthing" / "config.local.yaml").exists()


def _allocate_pane(project_root: Path, role: str) -> str:
    """Allocate a tmux pane for the given role, or generate a mock ID.

    Only creates real tmux panes when running against a real project root.
    Test environments get mock pane IDs to avoid spawning actual panes.
    """
    if not _is_real_project(project_root):
        return _next_pane_id()

    title = f"peloton-{role}"

    try:
        if _panes.is_tmux_running():
            session_result = _panes.get_session_name()
            if session_result["success"]:
                session = session_result["data"]
                live_result = _panes.list_live_panes(session)
                if live_result["success"] and live_result["data"]:
                    from pf.tmux.registry import find_split_target

                    target = find_split_target(
                        {"panes": [{"pane_id": p["pane_id"], "role": "worker", "title": "", "protected": False} for p in live_result["data"]]},
                        live_result["data"],
                    )
                    if target:
                        split_result = _panes.split_pane(session, target, "h", 30)
                        if split_result["success"]:
                            pane_id = split_result["data"].strip()
                            _panes.set_pane_title(pane_id, title)
                            return pane_id
    except Exception:
        pass

    return _next_pane_id()
