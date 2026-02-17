"""Phase check for agent activation.

Determines whether the requested agent owns the current workflow phase.
If not, returns a redirect to the correct agent. Replaces phase-check-start.sh.

Story: 110-8 (CLI Relay Handoff Fix)
"""

from __future__ import annotations

from pathlib import Path

from pennyfarthing_scripts.common.config import get_project_root
from pennyfarthing_scripts.prime.workflow import (
    check_redirect,
    detect_workflow_state,
    find_active_session,
    parse_session_header,
)


def phase_check_start(
    agent_name: str,
    project_root: Path | None = None,
) -> dict:
    """Check if requested agent owns current phase.

    Args:
        agent_name: Agent to check (e.g., "dev", "tea", "reviewer").
        project_root: Project root path (auto-detected if not provided).

    Returns:
        Dict with:
          action: "start" (proceed) or "redirect" (wrong agent)
          agent: The agent that should run
          story_id: Current story ID (if session exists)
          phase: Current phase (if session exists)
          phase_owner: Agent that owns the phase
          message: Human-readable explanation
    """
    root = project_root or get_project_root()

    # Find active session
    session_file = find_active_session(root)
    if not session_file:
        return {
            "action": "start",
            "agent": agent_name,
            "story_id": None,
            "phase": None,
            "phase_owner": None,
            "message": f"No active session — starting {agent_name}",
        }

    # Parse session header
    header = parse_session_header(session_file)
    story_id = header.get("story_id")
    workflow = header.get("workflow", "tdd")
    phase = header.get("phase")

    if not phase:
        return {
            "action": "start",
            "agent": agent_name,
            "story_id": story_id,
            "phase": None,
            "phase_owner": None,
            "message": f"No phase detected — starting {agent_name}",
        }

    # Use detect_workflow_state + check_redirect for consistent logic
    workflow_status = detect_workflow_state(root)
    redirect = check_redirect(workflow_status, agent_name)

    if redirect:
        target_agent, reason = redirect
        return {
            "action": "redirect",
            "agent": target_agent,
            "story_id": story_id,
            "phase": phase,
            "phase_owner": target_agent,
            "message": (
                f"Story {story_id} is in '{phase}' phase "
                f"(workflow: {workflow}) — owned by {target_agent}"
            ),
        }

    return {
        "action": "start",
        "agent": agent_name,
        "story_id": story_id,
        "phase": phase,
        "phase_owner": agent_name,
        "message": f"Agent {agent_name} owns phase '{phase}' — proceeding",
    }
