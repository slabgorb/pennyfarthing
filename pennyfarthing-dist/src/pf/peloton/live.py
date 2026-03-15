"""Peloton live mode — native agent teams for story workflows.

Uses Claude Code's built-in agent teams (TeamCreate / SendMessage / TeamDelete)
with teammateMode: "tmux" for persistent panes. SM is the team lead, each agent
role gets its own teammate with a tmux pane.

The pf peloton CLI is thin — it prepares the story context and produces the
TeamCreate prompt that SM uses to spawn the team. The actual orchestration
happens through native team mode tools, not custom pane management.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pf.workflow.helpers import find_workflow_file, get_all_workflows_dirs, load_workflow_data


_STATE_FILE = "peloton-state.json"

# Badge colors for each agent role — used in the TeamCreate prompt
# so SM instructs each teammate to run /color with the right value.
AGENT_BADGE_COLORS: dict[str, str] = {
    "tea": "blue",
    "dev": "green",
    "reviewer": "yellow",
    "architect": "purple",
}


def _state_path(project_root: Path) -> Path:
    return project_root / ".pennyfarthing" / _STATE_FILE


def load_state(project_root: Path) -> dict[str, Any]:
    """Load peloton state from disk."""
    path = _state_path(project_root)
    if path.exists():
        try:
            return json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {
        "active": False,
        "story_id": None,
        "workflow": None,
        "team_name": None,
        "agents": [],
    }


def save_state(project_root: Path, state: dict[str, Any]) -> dict[str, Any]:
    """Save peloton state to disk."""
    path = _state_path(project_root)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(state, indent=2) + "\n")
        return {"success": True}
    except OSError as e:
        return {"success": False, "error": str(e)}


def get_workflow_phases(workflow_name: str, project_root: Path | None = None) -> dict[str, Any]:
    """Extract all phases from a workflow's YAML definition.

    Returns:
        {success: True, data: [{name, agent, gate_type}, ...]} or error
    """
    from pf.common.config import get_project_root

    roots_to_try = []
    if project_root is not None:
        roots_to_try.append(project_root)
    try:
        roots_to_try.append(get_project_root())
    except Exception:
        pass

    for root in roots_to_try:
        workflows_dirs = get_all_workflows_dirs(root)
        wf_file = find_workflow_file(workflows_dirs, workflow_name)
        if wf_file is not None:
            data = load_workflow_data(wf_file)
            phases = data.get("workflow", {}).get("phases", [])
            if phases:
                result = []
                for phase in phases:
                    gate = phase.get("gate", {})
                    result.append({
                        "name": phase["name"],
                        "agent": phase["agent"],
                        "gate_type": gate.get("type") if gate else None,
                    })
                return {"success": True, "data": result}

    return {"success": False, "error": f"Workflow '{workflow_name}' not found"}


def get_workflow_agents(workflow_name: str, project_root: Path | None = None) -> dict[str, Any]:
    """Extract unique agent roles from a workflow's phases.

    Returns:
        {success: True, data: ["architect", "tea", "dev", "reviewer", ...]} or error
    """
    from pf.common.config import get_project_root

    roots_to_try = []
    if project_root is not None:
        roots_to_try.append(project_root)
    try:
        roots_to_try.append(get_project_root())
    except Exception:
        pass

    for root in roots_to_try:
        workflows_dirs = get_all_workflows_dirs(root)
        wf_file = find_workflow_file(workflows_dirs, workflow_name)
        if wf_file is not None:
            data = load_workflow_data(wf_file)
            agents = _extract_agents(data)
            if agents is not None:
                return {"success": True, "data": agents}

    return {"success": False, "error": f"Workflow '{workflow_name}' not found"}


def _extract_agents(data: dict[str, Any]) -> list[str] | None:
    """Extract unique agent roles from workflow data.

    Excludes SM — SM is the team lead, not a teammate.
    """
    phases = data.get("workflow", {}).get("phases", [])
    if not phases:
        return None

    seen: set[str] = set()
    agents: list[str] = []
    for phase in phases:
        agent = phase.get("agent")
        if agent and agent not in seen and agent != "sm":
            seen.add(agent)
            agents.append(agent)

    return agents if agents else None


def start_session(
    project_root: Path,
    story_id: str,
    workflow_name: str,
) -> dict[str, Any]:
    """Initialize peloton state and produce the TeamCreate prompt for SM.

    Records the team name and agent list in state. Returns the prompt
    that SM should use to create the team via native agent teams.

    Returns:
        {success: True, data: {team_name, agents, prompt}} or error
    """
    agents_result = get_workflow_agents(workflow_name, project_root)
    if not agents_result["success"]:
        return agents_result

    agents = agents_result["data"]
    team_name = f"peloton-{story_id}"

    state = {
        "active": True,
        "story_id": story_id,
        "workflow": workflow_name,
        "team_name": team_name,
        "agents": agents,
        "created_at": datetime.now(UTC).isoformat(),
    }
    save_state(project_root, state)

    # Build the prompt that SM uses to create the team
    agent_descriptions = []
    for agent in agents:
        color = AGENT_BADGE_COLORS.get(agent, "")
        color_instruction = f" Run `/color {color}` first to set badge color." if color else ""
        agent_descriptions.append(
            f"- **{agent}**: Load agent with `/pf-{agent}`. "
            f"Works on story {story_id}. Reads session file for context."
            f"{color_instruction}"
        )

    prompt = (
        f"Create a team called '{team_name}' with these teammates:\n"
        + "\n".join(agent_descriptions)
        + "\n\n"
        f"Each teammate should activate their agent role and work on story {story_id}. "
        f"The session file at .session/{story_id}-session.md has the full context. "
        f"Use teammateMode tmux so each agent gets a persistent pane."
    )

    return {
        "success": True,
        "data": {
            "team_name": team_name,
            "agents": agents,
            "prompt": prompt,
        },
    }


def get_status(project_root: Path) -> dict[str, Any]:
    """Get current peloton status."""
    state = load_state(project_root)
    return {
        "success": True,
        "data": {
            "active": state.get("active", False),
            "story_id": state.get("story_id"),
            "workflow": state.get("workflow"),
            "team_name": state.get("team_name"),
            "agents": state.get("agents", []),
        },
    }


def stop(project_root: Path) -> dict[str, Any]:
    """Stop peloton: kill peloton-owned panes, clean registry, clear state.

    The actual TeamDelete is called by SM in the Claude Code session.
    This kills peloton-owned tmux panes and cleans up both the registry
    and the state file.
    """
    from pf.tmux.panes import kill_pane

    killed: list[str] = []

    # Kill peloton-owned panes and update registry
    registry_file = project_root / ".pennyfarthing" / "tmux-panes.json"
    if registry_file.exists():
        try:
            registry = json.loads(registry_file.read_text())
        except (json.JSONDecodeError, OSError):
            registry = None

        if registry and "panes" in registry:
            surviving_panes = []
            for pane in registry["panes"]:
                if pane.get("owner") == "peloton" and not pane.get("protected", False):
                    try:
                        kill_pane(pane["pane_id"])
                    except Exception:
                        pass
                    killed.append(pane["pane_id"])
                else:
                    surviving_panes.append(pane)

            registry["panes"] = surviving_panes
            try:
                registry_file.write_text(json.dumps(registry, indent=2) + "\n")
            except OSError:
                pass

    # Clear peloton state
    cleared = {
        "active": False,
        "story_id": None,
        "workflow": None,
        "team_name": None,
        "agents": [],
    }
    save_state(project_root, cleared)
    return {"success": True, "data": {"team_name": None, "killed": killed}}
