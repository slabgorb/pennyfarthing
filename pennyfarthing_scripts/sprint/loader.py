"""
Sprint YAML parsing utilities for Pennyfarthing scripts.

Provides access to sprint/current-sprint.yaml data.
Supports sharded per-epic format (epic-{ref}.yaml shard files).
"""

import warnings
from pathlib import Path
from typing import Any

from pennyfarthing_scripts.common.config import get_project_root, load_yaml_config


def _merge_epic_shards(data: dict[str, Any], sprint_dir: Path) -> dict[str, Any]:
    """Merge sharded epic files into the sprint data structure.

    When the epics list contains strings (shard references like "MSSCI-14298"
    or "epic-40"), load each epic-{ref}.yaml and replace the string with
    the full epic dict.

    Args:
        data: Sprint data with possible string refs in epics
        sprint_dir: Directory containing the shard files

    Returns:
        Sprint data with full epic dicts
    """
    epics = data.get("epics", [])
    if not epics or not isinstance(epics[0], str):
        return data

    merged_epics = []
    for ref in epics:
        if not isinstance(ref, str):
            merged_epics.append(ref)
            continue

        epic_file = sprint_dir / f"epic-{ref}.yaml"
        if epic_file.exists():
            epic_data = load_yaml_config(epic_file)
            if epic_data is not None:
                merged_epics.append(epic_data)
        else:
            warnings.warn(
                f"Sprint epic ref '{ref}' not found: {epic_file}",
                stacklevel=2,
            )

    data["epics"] = merged_epics
    return data


def load_sprint(project_root: Path | None = None) -> dict[str, Any] | None:
    """Load sprint data from project root.

    Supports both monolithic and sharded epic formats. When epics are
    string references, the corresponding epic-{ref}.yaml files are
    loaded and merged transparently.

    Args:
        project_root: Project root path (defaults to auto-detect)

    Returns:
        Sprint data as dict, or None if not found
    """
    root = project_root or get_project_root()
    sprint_dir = root / "sprint"
    sprint_path = sprint_dir / "current-sprint.yaml"
    data = load_yaml_config(sprint_path)
    if data is None:
        return None

    return _merge_epic_shards(data, sprint_dir)


def find_epic(sprint_data: dict[str, Any], epic_num: str) -> dict[str, Any] | None:
    """Find epic in sprint data (handles various ID formats).

    Args:
        sprint_data: Sprint YAML data
        epic_num: Epic number (e.g., "63", "epic-63", or "63")

    Returns:
        Epic dict if found, None otherwise
    """
    if not sprint_data or "epics" not in sprint_data:
        return None

    # Normalize the epic number
    epic_num_clean = epic_num.replace("epic-", "")

    for epic in sprint_data["epics"]:
        epic_id = str(epic.get("id", ""))
        # Match "63", "epic-63", or just the number
        if epic_id == epic_num or epic_id == f"epic-{epic_num}" or epic_id == epic_num_clean:
            return epic
        # Also try without prefix
        if epic_id.replace("epic-", "") == epic_num_clean:
            return epic

    return None


# Alias for backwards compatibility
load_current_sprint = load_sprint


def get_sprint_info() -> dict[str, Any]:
    """Get sprint metadata (number, dates, status, etc).

    Returns:
        Sprint info dict with number, status, goal, etc.
    """
    data = load_sprint()
    if data and "sprint" in data:
        return data["sprint"]
    return {}


def get_all_stories() -> list[dict[str, Any]]:
    """Get all stories from all epics.

    Returns:
        Flat list of all story dicts
    """
    data = load_sprint()
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
    data = load_sprint()
    if not data or "epics" not in data:
        return None

    for epic in data["epics"]:
        if epic.get("id") == epic_id:
            return epic
    return None


def find_story(epic: dict[str, Any] | None, story_id: str) -> dict[str, Any] | None:
    """Find a story within an epic by its ID.

    Args:
        epic: Epic dict containing stories
        story_id: The story ID (e.g., "63-7")

    Returns:
        Story dict if found, None otherwise
    """
    if not epic or "stories" not in epic:
        return None

    for story in epic["stories"]:
        if story.get("id") == story_id:
            return story

    return None


def get_story_field(
    sprint_data: dict[str, Any], story_id: str, field_name: str
) -> Any | None:
    """Get a specific field from a story in sprint data.

    Extracts the epic number from the story ID (e.g., "63-7" -> epic 63)
    and looks up the story within that epic.

    Args:
        sprint_data: Sprint YAML data
        story_id: The story ID (e.g., "63-7")
        field_name: The field to extract (e.g., "status", "points", "workflow")

    Returns:
        Field value if found, None otherwise
    """
    if not sprint_data or not story_id:
        return None

    # Extract epic number from story ID (e.g., "63-7" -> "63")
    parts = story_id.split("-")
    if len(parts) < 2:
        return None

    epic_num = parts[0]

    # Find the epic
    epic = find_epic(sprint_data, epic_num)
    if not epic:
        return None

    # Find the story within the epic
    story = find_story(epic, story_id)
    if not story:
        return None

    return story.get(field_name)
