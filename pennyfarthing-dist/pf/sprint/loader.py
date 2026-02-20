"""
Sprint YAML parsing utilities for Pennyfarthing scripts.

Provides access to sprint data with support for:
- Default sprint: sprint/current-sprint.yaml
- Multi-sprint registry: sprint/sprints.yaml with per-user preference
  stored in .pennyfarthing/config.local.yaml
- Sharded per-epic format: epic-{ref}.yaml shard files
"""

from pathlib import Path
from typing import Any

from pf.common.config import (
    get_project_root,
    load_pennyfarthing_config,
    load_yaml_config,
    save_pennyfarthing_config_key,
)


def _merge_epic_shards(data: dict[str, Any], sprint_dir: Path) -> dict[str, Any]:
    """Merge sharded epic files into the sprint data structure.

    Thin wrapper around shard_merge.merge_epic_shards() that uses
    load_yaml_config as the file loader. Kept as a named function
    for any external importers (e.g. validator.py).

    Args:
        data: Sprint data with possible string refs in epics
        sprint_dir: Directory containing the shard files

    Returns:
        Sprint data with full epic dicts
    """
    from pf.sprint.shard_merge import merge_epic_shards

    return merge_epic_shards(data, sprint_dir, load_file=load_yaml_config)


def load_sprint(project_root: Path | None = None) -> dict[str, Any] | None:
    """Load sprint data from project root.

    Resolution order:
      1. Check .pennyfarthing/config.local.yaml for sprint.active preference
      2. If set, look up the sprint in sprint/sprints.yaml registry
      3. Load the referenced sprint file (resolved relative to sprint/)
      4. If no preference or no registry, fall back to sprint/current-sprint.yaml

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

    # Check for per-user sprint preference
    active_name = get_active_sprint_name(root)
    if active_name:
        registry = load_sprint_registry(root)
        if registry:
            sprints = registry.get("sprints", {})
            sprint_entry = sprints.get(active_name)
            if sprint_entry and sprint_entry.get("file"):
                sprint_path = (sprint_dir / sprint_entry["file"]).resolve()
                if sprint_path.exists():
                    data = load_yaml_config(sprint_path)
                    if data is not None:
                        # Inject registry metadata for downstream consumers
                        data["_registry"] = {
                            "name": active_name,
                            "type": sprint_entry.get("type", "project"),
                            "context_root": sprint_entry.get("context_root"),
                            "session_root": sprint_entry.get("session_root"),
                            "docs": sprint_entry.get("docs", {}),
                        }
                        return _merge_epic_shards(data, sprint_path.parent)

    # Default: load sprint/current-sprint.yaml
    sprint_path = sprint_dir / "current-sprint.yaml"
    data = load_yaml_config(sprint_path)
    if data is None:
        return None

    return _merge_epic_shards(data, sprint_dir)


def load_sprint_registry(project_root: Path | None = None) -> dict[str, Any] | None:
    """Load sprint registry from sprint/sprints.yaml.

    The sprint registry indexes multiple parallel sprints (e.g., a main
    project sprint and research spike sprints). Each entry maps a sprint
    name to its YAML file path, type, and metadata.

    Args:
        project_root: Project root path (defaults to auto-detect)

    Returns:
        Registry data as dict, or None if no registry exists
    """
    root = project_root or get_project_root()
    registry_path = root / "sprint" / "sprints.yaml"
    return load_yaml_config(registry_path)


def get_active_sprint_name(project_root: Path | None = None) -> str | None:
    """Get the name of the currently active sprint.

    Reads the per-user preference from .pennyfarthing/config.local.yaml
    (sprint.active key). Returns None if no preference is set, meaning
    the default sprint/current-sprint.yaml should be used.

    Args:
        project_root: Project root path (defaults to auto-detect)

    Returns:
        Active sprint name, or None if using the default sprint
    """
    root = project_root or get_project_root()
    config = load_pennyfarthing_config(root)
    sprint_config = config.get("sprint", {})
    if isinstance(sprint_config, dict):
        return sprint_config.get("active")
    return None


def switch_sprint(name: str, project_root: Path | None = None) -> dict[str, Any]:
    """Switch the active sprint by updating the per-user preference.

    Validates the sprint name against sprint/sprints.yaml, then writes
    the selection to .pennyfarthing/config.local.yaml (gitignored,
    per-user). Does not modify any shared repo files.

    Use name "default" to clear the preference and revert to the
    project's sprint/current-sprint.yaml.

    Args:
        name: Sprint name from the registry (e.g., "main", "ocsf-rs1")
              or "default" to clear the preference
        project_root: Project root path (defaults to auto-detect)

    Returns:
        Dict with 'success', 'message', and optional 'error' or 'sprint'
    """
    root = project_root or get_project_root()

    # "default" clears the preference
    if name == "default":
        config = load_pennyfarthing_config(root)
        sprint_config = config.get("sprint", {})
        if isinstance(sprint_config, dict) and "active" in sprint_config:
            del sprint_config["active"]
            if not sprint_config:
                save_pennyfarthing_config_key("sprint", {}, root)
            else:
                save_pennyfarthing_config_key("sprint", sprint_config, root)
        return {
            "success": True,
            "message": "Cleared sprint preference — using default sprint/current-sprint.yaml",
        }

    registry = load_sprint_registry(root)

    if registry is None:
        return {"success": False, "error": "No sprint registry found (sprint/sprints.yaml)"}

    sprints = registry.get("sprints", {})
    if name not in sprints:
        available = ", ".join(sprints.keys())
        return {"success": False, "error": f"Unknown sprint: {name}. Available: {available}"}

    sprint_entry = sprints[name]
    sprint_file = sprint_entry.get("file")
    if not sprint_file:
        return {"success": False, "error": f"Sprint '{name}' has no file configured"}

    # Verify the target sprint file exists
    sprint_dir = root / "sprint"
    target_path = (sprint_dir / sprint_file).resolve()
    if not target_path.exists():
        return {
            "success": False,
            "error": f"Sprint file not found: {sprint_file} (resolved to {target_path})",
        }

    # Write preference to config.local.yaml (per-user, gitignored)
    config = load_pennyfarthing_config(root)
    sprint_config = config.get("sprint", {})
    if not isinstance(sprint_config, dict):
        sprint_config = {}
    sprint_config["active"] = name
    save_pennyfarthing_config_key("sprint", sprint_config, root)

    return {
        "success": True,
        "message": f"Switched to sprint: {name}",
        "sprint": sprint_entry,
    }


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
