"""
Workflow state detection for Prime v2.

Detects current workflow state by analyzing:
- Active session files in .session/
- Session headers for phase and workflow
- Sprint backlog for available stories
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

from pf.common.config import get_dist_root, get_project_root
from pf.prime.models import WorkflowState, WorkflowStatus


def find_active_session(project_root: Path) -> Path | None:
    """Find the active session file.

    Looks in .session/ for *-session.md files, excluding context-*.md.
    Returns the most recently modified session file.

    Args:
        project_root: Project root path

    Returns:
        Path to active session file, or None if not found
    """
    session_dir = project_root / ".session"
    if not session_dir.is_dir():
        return None

    # Find *-session.md files (not context-*)
    session_files = [
        f for f in session_dir.glob("*-session.md") if not f.name.startswith("context-")
    ]

    if not session_files:
        return None

    # Return the most recently modified one
    return max(session_files, key=lambda f: f.stat().st_mtime)


def parse_session_header(session_path: Path) -> dict[str, Any]:
    """Parse session file header to extract metadata.

    Looks for key: value patterns throughout the session file header sections.
    Extracts workflow, phase, story_id, status from:
    - ## Story Context section
    - ## Workflow Phase section

    Args:
        session_path: Path to session file

    Returns:
        Dict with extracted metadata (workflow, phase, story_id, status)
    """
    content = session_path.read_text()
    lines = content.split("\n")

    result: dict[str, Any] = {}

    # Extract story ID from filename (e.g., MSSCI-12419-session.md -> MSSCI-12419)
    filename = session_path.stem
    if filename.endswith("-session"):
        result["story_id"] = filename[:-8]  # Remove "-session"

    # Track which sections we're in (we care about Story Context, Workflow Phase, Workflow State)
    in_relevant_section = True  # Start True to capture content before any ##

    for line in lines:
        # Track section headers
        if line.startswith("## "):
            # We care about Story Context, Workflow Phase, and Workflow State sections
            section_name = line[3:].strip().lower()
            in_relevant_section = (
                "story context" in section_name
                or "workflow phase" in section_name
                or "workflow state" in section_name
                or "workflow tracking" in section_name
                or "branch" in section_name
            )
            # Stop at assessment sections (too far down)
            if "assessment" in section_name:
                break
            continue

        # Only parse lines in relevant sections
        if not in_relevant_section:
            continue

        # Look for key-value patterns
        # Format is "**Key:** Value" (colon inside the bold)
        # e.g., "- **Workflow:** tdd" or "- **Current Phase:** green"
        match = re.search(r"\*\*([^*:]+):\*\*\s*(.+)", line)
        if match:
            key = match.group(1).lower().strip()
            value = match.group(2).strip()

            if key == "workflow":
                result["workflow"] = value.lower()
            elif key == "workflow name":
                result["workflow"] = value.lower()
            elif key in ("current phase", "phase"):
                # Extract phase name, handling "(APPROVED)" suffix
                # Matches both "**Current Phase:**" and "**Phase:**"
                phase_match = re.match(r"(\w+)(?:\s*\(([^)]+)\))?", value)
                if phase_match:
                    result["phase"] = phase_match.group(1).lower()
                    if phase_match.group(2):
                        result["phase_status"] = phase_match.group(2).lower()
            elif key == "type":
                result["workflow_type"] = value.lower()
            elif key == "current step":
                try:
                    result["current_step"] = int(value)
                except ValueError:
                    pass
            elif key == "total steps":
                try:
                    result["total_steps"] = int(value)
                except ValueError:
                    pass
            elif key == "step name":
                result["step_name"] = value
            elif key == "id" and "story_id" not in result:
                result["story_id"] = value
            elif key == "status":
                result["status"] = value.lower()

    return result


def get_phase_owner(workflow: str, phase: str, project_root: Path) -> str | None:
    """Look up the agent that owns a workflow phase.

    Reads the workflow YAML and finds the agent for the given phase.

    Args:
        workflow: Workflow name (tdd, trivial, bdd, etc.)
        phase: Phase name (setup, red, green, review, finish)
        project_root: Project root path

    Returns:
        Agent name (sm, tea, dev, reviewer), or None if not found
    """
    dist_root = get_dist_root(project_root=project_root)
    if dist_root:
        workflow_path = dist_root / "workflows" / f"{workflow}.yaml"
    else:
        workflow_path = project_root / "pennyfarthing-dist" / "workflows" / f"{workflow}.yaml"

    if not workflow_path.exists():
        # Fallback to symlinked location
        workflow_path = project_root / ".pennyfarthing" / "workflows" / f"{workflow}.yaml"
        if not workflow_path.exists():
            return None

    try:
        data = yaml.safe_load(workflow_path.read_text())
        phases = data.get("workflow", {}).get("phases", [])

        for p in phases:
            if p.get("name") == phase:
                return p.get("agent")

        return None
    except Exception:
        return None


def get_backlog_count(project_root: Path) -> int:
    """Count stories in backlog, ready, or planning status.

    Args:
        project_root: Project root path

    Returns:
        Number of stories available for work
    """
    # Import here to avoid circular imports
    from pf.sprint.loader import load_sprint

    sprint = load_sprint(project_root)
    if not sprint or "epics" not in sprint:
        return 0

    count = 0
    for epic in sprint["epics"]:
        if not isinstance(epic, dict):
            continue  # Skip string refs (defensive)
        for story in epic.get("stories", []):
            status = story.get("status", "").lower()
            if status in ("backlog", "ready", "planning"):
                count += 1

    return count


def detect_workflow_state(project_root: Path | None = None) -> WorkflowStatus:
    """Detect the current workflow state.

    Returns one of:
    - FINISH_STATE: Session exists with phase=approved or review-approved
    - IN_PROGRESS_STATE: Session exists with active phase
    - NEW_WORK_STATE: No session and backlog has stories
    - EMPTY_BACKLOG_STATE: No session and backlog is empty

    Args:
        project_root: Project root path (auto-detected if not provided)

    Returns:
        WorkflowStatus with detected state and metadata
    """
    root = project_root or get_project_root()
    session_file = find_active_session(root)

    if session_file:
        header = parse_session_header(session_file)
        story_id = header.get("story_id")
        workflow = header.get("workflow", "tdd")
        phase = header.get("phase")
        phase_status = header.get("phase_status", "")
        workflow_type = header.get("workflow_type")

        # Handle stepped workflows
        if workflow_type == "stepped":
            current_step = header.get("current_step")
            total_steps = header.get("total_steps")
            step_name = header.get("step_name")
            status = header.get("status", "")

            # Completed stepped workflow → FINISH_STATE
            if status == "completed":
                return WorkflowStatus(
                    state=WorkflowState.FINISH_STATE,
                    story_id=story_id,
                    workflow=workflow,
                    session_file=str(session_file),
                    current_step=current_step,
                    total_steps=total_steps,
                    step_name=step_name,
                    completion_status=status,
                )

            # In-progress stepped workflow → STEPPED_IN_PROGRESS_STATE
            return WorkflowStatus(
                state=WorkflowState.STEPPED_IN_PROGRESS_STATE,
                story_id=story_id,
                workflow=workflow,
                session_file=str(session_file),
                current_step=current_step,
                total_steps=total_steps,
                step_name=step_name,
                completion_status=status or "in_progress",
            )

        # Check for finish state
        if phase in ("approved", "review-approved", "finish"):
            return WorkflowStatus(
                state=WorkflowState.FINISH_STATE,
                story_id=story_id,
                phase=phase,
                phase_owner="sm",
                workflow=workflow,
                session_file=str(session_file),
            )

        # Check if phase is approved (e.g., "REVIEW (APPROVED)")
        if phase_status == "approved":
            return WorkflowStatus(
                state=WorkflowState.FINISH_STATE,
                story_id=story_id,
                phase=phase,
                phase_owner="sm",
                workflow=workflow,
                session_file=str(session_file),
            )

        # In progress state - look up phase owner
        owner = get_phase_owner(workflow, phase, root) if phase else None

        return WorkflowStatus(
            state=WorkflowState.IN_PROGRESS_STATE,
            story_id=story_id,
            phase=phase,
            phase_owner=owner,
            workflow=workflow,
            session_file=str(session_file),
        )

    # No active session - check backlog
    backlog_count = get_backlog_count(root)

    if backlog_count > 0:
        return WorkflowStatus(
            state=WorkflowState.NEW_WORK_STATE,
            backlog_count=backlog_count,
        )

    return WorkflowStatus(
        state=WorkflowState.EMPTY_BACKLOG_STATE,
    )


def check_redirect(workflow_status: WorkflowStatus, agent_name: str) -> tuple[str, str] | None:
    """Check if the activated agent should redirect to another agent.

    Returns redirect info if:
    - IN_PROGRESS_STATE and agent_name != phase_owner

    Args:
        workflow_status: Current workflow status
        agent_name: Name of the activated agent

    Returns:
        Tuple of (target_agent, reason) if redirect needed, None otherwise
    """
    if workflow_status.state == WorkflowState.IN_PROGRESS_STATE:
        if workflow_status.phase_owner and workflow_status.phase_owner != agent_name:
            return (
                workflow_status.phase_owner,
                f"Phase '{workflow_status.phase}' is owned by '{workflow_status.phase_owner}'",
            )

    return None


def get_phase_tandem_config(
    workflow_name: str, phase_name: str, project_root: Path | None = None
) -> dict[str, Any] | None:
    """Extract tandem configuration for a specific workflow phase.

    Reads the workflow YAML and returns the tandem block for the given phase,
    or None if the phase has no tandem configuration.

    Args:
        workflow_name: Workflow name (tdd-team, bdd-team, etc.)
        phase_name: Phase name (red, green, review, etc.)
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Dict with tandem config (partner, mode, model, token_budget, triggers, scope)
        or None if no tandem config on this phase.
    """
    root = project_root or get_project_root()
    dist_root = get_dist_root(project_root=root)
    if dist_root:
        workflow_path = dist_root / "workflows" / f"{workflow_name}.yaml"
    else:
        workflow_path = root / "pennyfarthing-dist" / "workflows" / f"{workflow_name}.yaml"

    if not workflow_path.exists():
        return None

    try:
        data = yaml.safe_load(workflow_path.read_text())
        phases = data.get("workflow", {}).get("phases", [])

        for phase in phases:
            if isinstance(phase, dict) and phase.get("name") == phase_name:
                tandem = phase.get("tandem")
                if isinstance(tandem, dict):
                    return dict(tandem)
                return None

        return None
    except Exception:
        return None


def get_phase_team_config(
    workflow_name: str, phase_name: str, project_root: Path | None = None
) -> dict[str, Any] | None:
    """Extract team configuration for a specific workflow phase.

    Reads the workflow YAML and returns the team block for the given phase,
    or None if the phase has no team configuration.

    Args:
        workflow_name: Workflow name (tdd-team, etc.)
        phase_name: Phase name (red, green, review, etc.)
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Dict with team config (teammates list, model, etc.)
        or None if no team config on this phase.
    """
    root = project_root or get_project_root()
    dist_root = get_dist_root(project_root=root)
    if dist_root:
        workflow_path = dist_root / "workflows" / f"{workflow_name}.yaml"
    else:
        workflow_path = root / "pennyfarthing-dist" / "workflows" / f"{workflow_name}.yaml"

    if not workflow_path.exists():
        return None

    try:
        data = yaml.safe_load(workflow_path.read_text())
        phases = data.get("workflow", {}).get("phases", [])

        for phase in phases:
            if isinstance(phase, dict) and phase.get("name") == phase_name:
                team = phase.get("team")
                if isinstance(team, dict):
                    return dict(team)
                return None

        return None
    except Exception:
        return None


def get_step_tandem_config(
    workflow_name: str, step_number: int, project_root: Path | None = None
) -> dict[str, Any] | None:
    """Extract tandem configuration for a specific stepped workflow step.

    Reads the workflow YAML and returns the tandem block for the given step
    number, or None if the step has no tandem configuration.

    Args:
        workflow_name: Workflow name (architecture, research, etc.)
        step_number: Step number (1-based)
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Dict with tandem config (partner, scope, model, token_budget)
        or None if no tandem config on this step.
    """
    return _get_step_config_block(workflow_name, step_number, "tandem", project_root)


def get_step_team_config(
    workflow_name: str, step_number: int, project_root: Path | None = None
) -> dict[str, Any] | None:
    """Extract team configuration for a specific stepped workflow step.

    Reads the workflow YAML and returns the team block for the given step
    number, or None if the step has no team configuration.

    Args:
        workflow_name: Workflow name (architecture, research, etc.)
        step_number: Step number (1-based)
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Dict with team config (teammates list, model, etc.)
        or None if no team config on this step.
    """
    return _get_step_config_block(workflow_name, step_number, "team", project_root)


def _get_step_config_block(
    workflow_name: str, step_number: int, block: str, project_root: Path | None = None
) -> dict[str, Any] | None:
    """Shared helper to extract a config block from a stepped workflow step."""
    root = project_root or get_project_root()
    dist_root = get_dist_root(project_root=root)
    base = dist_root if dist_root else root / "pennyfarthing-dist"

    # Try flat file first, then directory-based workflow
    for candidate in [
        base / "workflows" / f"{workflow_name}.yaml",
        base / "workflows" / workflow_name / "workflow.yaml",
    ]:
        if not candidate.exists():
            continue
        try:
            data = yaml.safe_load(candidate.read_text())
            steps_cfg = data.get("workflow", {}).get("steps", {})
            config = steps_cfg.get("config", {})
            step_cfg = config.get(step_number, {})
            if isinstance(step_cfg, dict):
                value = step_cfg.get(block)
                if isinstance(value, dict):
                    return dict(value)
            return None
        except Exception:
            return None
    return None


def get_phase_gate_recovery(
    workflow_name: str, phase_name: str, project_root: Path | None = None
) -> bool:
    """Check if a workflow phase gate has a recovery configuration.

    Reads the workflow YAML and returns True if the given phase's gate
    has a ``recovery:`` block.

    Args:
        workflow_name: Workflow name (tdd, trivial, bdd, etc.)
        phase_name: Phase name (setup, red, green, review, etc.)
        project_root: Project root path (auto-detected if not provided)

    Returns:
        True if the phase gate has recovery config, False otherwise.
    """
    root = project_root or get_project_root()
    dist_root = get_dist_root(project_root=root)
    if dist_root:
        workflow_path = dist_root / "workflows" / f"{workflow_name}.yaml"
    else:
        workflow_path = root / "pennyfarthing-dist" / "workflows" / f"{workflow_name}.yaml"

    if not workflow_path.exists():
        return False

    try:
        data = yaml.safe_load(workflow_path.read_text())
        phases = data.get("workflow", {}).get("phases", [])

        for phase in phases:
            if isinstance(phase, dict) and phase.get("name") == phase_name:
                gate = phase.get("gate")
                if isinstance(gate, dict) and gate.get("recovery"):
                    return True
                return False

        return False
    except Exception:
        return False
