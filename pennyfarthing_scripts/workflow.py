"""
Scale level detection and workflow routing for Pennyfarthing.

BMAD Scale Levels:
- Level 0: fix, bug, typo, small change, patch (1 story, no artifacts)
- Level 1: simple, basic, small feature, add (1-10 stories, tech-spec)
- Level 2: dashboard, several features, admin panel (5-15 stories, PRD optional arch)
- Level 3: platform, integration, complex, system (12-40 stories, PRD + architecture)
- Level 4: enterprise, multi-tenant, multiple products (40+ stories, full BMAD)

Story: MSSCI-12416 - Define Scale Levels
Epic: MSSCI-12415 - Scale Adaptation and Brownfield Support
"""

from typing import Any
import re

# Scale level definitions with keywords, thresholds, and metadata
SCALE_LEVELS: dict[int, dict[str, Any]] = {
    0: {
        "level": 0,
        "scope": "fix, bug, typo, small change, patch",
        "keywords": ["fix", "bug", "typo", "patch", "hotfix", "small change"],
        "stories_min": 1,
        "stories_max": 1,
        "workflow": "trivial",
        "artifacts": [],
    },
    1: {
        "level": 1,
        "scope": "simple, basic, small feature, add",
        "keywords": ["simple", "basic", "small", "add", "minor"],
        "stories_min": 1,
        "stories_max": 10,
        "workflow": "prd",
        "artifacts": ["tech-spec"],
    },
    2: {
        "level": 2,
        "scope": "dashboard, several features, admin panel",
        "keywords": ["dashboard", "admin panel", "several", "multiple features"],
        "stories_min": 5,
        "stories_max": 15,
        "workflow": "prd",
        "artifacts": ["prd"],
    },
    3: {
        "level": 3,
        "scope": "platform, integration, complex, system",
        "keywords": ["platform", "integration", "complex", "system"],
        "stories_min": 12,
        "stories_max": 40,
        "workflow": "prd",
        "artifacts": ["prd", "architecture"],
    },
    4: {
        "level": 4,
        "scope": "enterprise, multi-tenant, multiple products",
        "keywords": ["enterprise", "multi-tenant", "multiple products"],
        "stories_min": 40,
        "stories_max": None,  # No upper limit
        "workflow": "prd",
        "artifacts": ["prd", "architecture", "epics-and-stories"],
    },
}


def detect_scale_level(description: str) -> int:
    """Detect scale level from description keywords.

    Keywords are matched case-insensitively. When multiple levels match,
    the highest level wins (higher specificity).

    Args:
        description: Text describing the work to be done

    Returns:
        Scale level 0-4, defaults to 1 if no keywords match
    """
    description_lower = description.lower()
    matched_level = 1  # Default

    # Check from highest to lowest level (highest specificity wins)
    for level in [4, 3, 2, 1, 0]:
        keywords = SCALE_LEVELS[level]["keywords"]
        for keyword in keywords:
            # Use word boundary matching for better accuracy
            pattern = r"\b" + re.escape(keyword.lower()) + r"\b"
            if re.search(pattern, description_lower):
                # Higher levels have priority, so return immediately for L4-L2
                if level >= 2:
                    return level
                # For L0-L1, track the match but continue checking for higher levels
                matched_level = level

    return matched_level


def scale_level_from_story_count(count: int) -> int:
    """Infer scale level from estimated story count.

    Args:
        count: Estimated number of stories

    Returns:
        Scale level 0-4 based on story count thresholds
    """
    if count <= 1:
        return 1  # Could be 0 or 1, default to 1
    elif count <= 10:
        return 1
    elif count <= 15:
        return 2
    elif count <= 40:
        return 3
    else:
        return 4


def get_workflow_for_scale_level(level: int) -> str:
    """Get the recommended workflow for a scale level.

    Args:
        level: Scale level 0-4

    Returns:
        Workflow name (trivial or prd)
    """
    if level not in SCALE_LEVELS:
        return "prd"  # Safe default for unknown levels
    return SCALE_LEVELS[level]["workflow"]


def get_required_artifacts(level: int) -> list[str]:
    """Get required planning artifacts for a scale level.

    Args:
        level: Scale level 0-4

    Returns:
        List of required artifact names
    """
    if level not in SCALE_LEVELS:
        return []
    return SCALE_LEVELS[level]["artifacts"]


def determine_scale_level(
    description: str, explicit_level: int | None = None
) -> int:
    """Determine scale level with optional user override.

    Args:
        description: Text describing the work to be done
        explicit_level: User-specified level override (0-4)

    Returns:
        Scale level 0-4

    Raises:
        ValueError: If explicit_level is not 0-4
    """
    if explicit_level is not None:
        if explicit_level < 0 or explicit_level > 4:
            raise ValueError(f"Scale level must be 0-4, got {explicit_level}")
        return explicit_level

    return detect_scale_level(description)


def get_scale_level_info(level: int) -> dict[str, Any]:
    """Get complete metadata for a scale level.

    Args:
        level: Scale level 0-4

    Returns:
        Dict with level, scope, stories_min, stories_max, workflow, artifacts
    """
    if level not in SCALE_LEVELS:
        return {"level": level, "scope": "unknown", "stories_min": 0,
                "stories_max": 0, "workflow": "prd", "artifacts": []}
    return SCALE_LEVELS[level].copy()


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
