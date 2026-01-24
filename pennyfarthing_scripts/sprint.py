"""
Sprint YAML parsing utilities for Pennyfarthing scripts.

Provides access to sprint/current-sprint.yaml data.
"""

from typing import Any

from .config import get_project_root, load_yaml_config


def load_current_sprint() -> dict[str, Any] | None:
    """Load sprint/current-sprint.yaml.

    Returns:
        Sprint data as dict, or None if not found
    """
    sprint_path = get_project_root() / "sprint" / "current-sprint.yaml"
    return load_yaml_config(sprint_path)


def get_sprint_info() -> dict[str, Any]:
    """Get sprint metadata (number, dates, status, etc).

    Returns:
        Sprint info dict with number, status, goal, etc.
    """
    data = load_current_sprint()
    if data and "sprint" in data:
        return data["sprint"]
    return {}


def get_all_stories() -> list[dict[str, Any]]:
    """Get all stories from all epics.

    Returns:
        Flat list of all story dicts
    """
    data = load_current_sprint()
    if not data or "epics" not in data:
        return []

    stories = []
    for epic in data["epics"]:
        if "stories" in epic:
            stories.extend(epic["stories"])
    return stories


def get_story_by_id(story_id: str) -> dict[str, Any] | None:
    """Find a story by its ID.

    Args:
        story_id: The story ID (e.g., "63-4" or "MSSCI-12398")

    Returns:
        Story dict if found, None otherwise
    """
    for story in get_all_stories():
        if story.get("id") == story_id:
            return story
        # Also check jira field
        if story.get("jira") == story_id:
            return story
    return None


def get_stories_by_status(status: str) -> list[dict[str, Any]]:
    """Get all stories with a given status.

    Args:
        status: Status to filter by (e.g., "backlog", "in_progress", "done")

    Returns:
        List of stories matching the status
    """
    return [s for s in get_all_stories() if s.get("status") == status]


def get_epic_by_id(epic_id: str) -> dict[str, Any] | None:
    """Find an epic by its ID.

    Args:
        epic_id: The epic ID

    Returns:
        Epic dict if found, None otherwise
    """
    data = load_current_sprint()
    if not data or "epics" not in data:
        return None

    for epic in data["epics"]:
        if epic.get("id") == epic_id:
            return epic
    return None
