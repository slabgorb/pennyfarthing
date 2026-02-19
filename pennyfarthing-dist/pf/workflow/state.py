"""
Workflow phase ownership and state detection.

Maps workflow phases to their owning agents and provides session
state detection from .session/ files.
"""

from typing import Any

# Phase ownership mapping for TDD workflow
# Canonical YAML names: setup, red, green, review, finish
TDD_PHASE_OWNERS: dict[str, str] = {
    "setup": "sm",
    "red": "tea",
    "green": "dev",
    "review": "reviewer",
    "finish": "sm",
}

# Phase ownership mapping for trivial workflow (no TEA)
# Canonical YAML names: setup, implement, review, finish
TRIVIAL_PHASE_OWNERS: dict[str, str] = {
    "setup": "sm",
    "implement": "dev",
    "review": "reviewer",
    "finish": "sm",
}

# All workflow phase mappings
WORKFLOW_PHASES: dict[str, dict[str, str]] = {
    "tdd": TDD_PHASE_OWNERS,
    "trivial": TRIVIAL_PHASE_OWNERS,
    "bdd": TDD_PHASE_OWNERS,  # BDD uses same phases as TDD
}


def get_phase_owner(workflow: str, phase: str) -> str:
    """Get the agent that owns a workflow phase.

    Args:
        workflow: Workflow name (tdd, trivial, bdd)
        phase: Phase name (setup, red, implement, review, approved)

    Returns:
        Agent name (sm, tea, dev, reviewer)
    """
    phases = WORKFLOW_PHASES.get(workflow, TDD_PHASE_OWNERS)
    return phases.get(phase, "sm")


def get_workflow_state() -> dict[str, Any]:
    """Get current workflow state from session files.

    Scans .session/ directory for active session files and extracts
    workflow state information.

    Returns:
        Dict with state, story_id, workflow, phase fields
    """
    from pathlib import Path

    # Look for session files in .session/
    session_dir = Path(".session")
    if not session_dir.exists():
        return {"state": "EMPTY_BACKLOG_STATE"}

    # Find session files (pattern: *-session.md)
    session_files = list(session_dir.glob("*-session.md"))

    # Filter out workflow session files and archived files
    story_sessions = [
        f for f in session_files
        if not f.name.startswith("prd-")
        and not f.name.startswith("architecture-")
        and not f.name.startswith("research-")
        and "workflow" not in f.name.lower()
    ]

    if not story_sessions:
        return {"state": "NEW_WORK_STATE"}

    # Read the most recent session file
    session_file = max(story_sessions, key=lambda f: f.stat().st_mtime)
    content = session_file.read_text()

    # Extract fields from markdown format
    # Session files use list format: "- **Field:** value"
    # Also handle direct format: "**Field:** value"
    result: dict[str, Any] = {"state": "IN_PROGRESS_STATE"}

    for line in content.split("\n"):
        # Strip leading "- " for list items
        stripped = line.lstrip("- ").strip()

        if stripped.startswith("**Story:**"):
            result["story_id"] = stripped.replace("**Story:**", "").strip()
        elif stripped.startswith("**Jira:**"):
            result["story_id"] = stripped.replace("**Jira:**", "").strip()
        elif stripped.startswith("**ID:**"):
            # Also check **ID:** field (used in Story Details section)
            if "story_id" not in result:
                result["story_id"] = stripped.replace("**ID:**", "").strip()
        elif stripped.startswith("**Type:**"):
            # Workflow section uses **Type:** not **Workflow:**
            result["workflow"] = stripped.replace("**Type:**", "").strip()
        elif stripped.startswith("**Workflow:**"):
            result["workflow"] = stripped.replace("**Workflow:**", "").strip()
        elif stripped.startswith("**Phase:**"):
            result["phase"] = stripped.replace("**Phase:**", "").strip()

    return result
