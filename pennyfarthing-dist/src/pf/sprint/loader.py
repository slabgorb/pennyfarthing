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
from pf.core.resolver import resolve_sprint_context


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

    Delegates path resolution to resolve_sprint_context(), which handles
    default sprint, multi-sprint registry, and per-user preference.

    Supports both monolithic and sharded epic formats. When epics are
    string references, the corresponding epic-{ref}.yaml files are
    loaded and merged transparently.

    Args:
        project_root: Project root path (defaults to auto-detect)

    Returns:
        Sprint data as dict, or None if not found
    """
    root = project_root or get_project_root()

    try:
        ctx = resolve_sprint_context(str(root))
    except (FileNotFoundError, ValueError):
        return None

    sprint_path = Path(ctx.sprint_file)
    data = load_yaml_config(sprint_path)
    if data is None:
        return None

    # Inject registry metadata for non-default contexts
    if not ctx.is_default:
        data["_registry"] = {
            "name": ctx.name,
            "type": ctx.type,
            "context_root": ctx.context_root,
            "session_root": ctx.session_root,
        }

    return _merge_epic_shards(data, sprint_path.parent)


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
    """Get all stories from epics, standalone_stories, and top-level stories.

    Returns:
        Flat list of all story dicts
    """
    data = load_sprint()
    if not data:
        return []

    stories = []
    for epic in data.get("epics", []):
        if isinstance(epic, dict) and "stories" in epic:
            stories.extend(epic["stories"])
    for s in data.get("standalone_stories", []):
        stories.append(s)
    for s in data.get("stories", []):
        stories.append(s)
    return stories


def get_archived_stories(
    project_root: Path | None = None,
    exclude_current: bool = False,
    only_current: bool = False,
) -> list[dict[str, Any]]:
    """Get completed stories from sprint archive shards.

    Reads sprint/archive/sprint-*-completed.yaml files and returns
    their completed_stories lists.

    Args:
        project_root: Project root path (defaults to auto-detect)
        exclude_current: If True, exclude the current sprint's archive
        only_current: If True, return only the current sprint's archive

    Returns:
        Flat list of archived story dicts
    """
    root = project_root or get_project_root()
    archive_dir = root / "sprint" / "archive"
    if not archive_dir.is_dir():
        return []

    current_id: int | str | None = None
    if exclude_current or only_current:
        sprint_info = get_sprint_info()
        current_id = sprint_info.get("number") or sprint_info.get("name")

    stories = []
    for path in sorted(archive_dir.glob("sprint-*-completed.yaml")):
        data = load_yaml_config(path)
        if not data or "completed_stories" not in data:
            continue

        if current_id is not None:
            archive_sprint = data.get("sprint", {})
            archive_id = archive_sprint.get("number") or archive_sprint.get("name")
            is_current = archive_id == current_id
            if exclude_current and is_current:
                continue
            if only_current and not is_current:
                continue

        stories.extend(data["completed_stories"])

        # Also load stories from archived epic shards referenced by completed_epics
        for epic_ref in data.get("completed_epics", []):
            shard_path = archive_dir / f"epic-{epic_ref}.yaml"
            if shard_path.exists():
                shard_data = load_yaml_config(shard_path)
                if shard_data and "stories" in shard_data:
                    for s in shard_data["stories"]:
                        if s.get("status") in ("done", "completed"):
                            stories.append(s)

    return stories


def get_story_by_id(story_id: str) -> dict[str, Any] | None:
    """Find a story by its ID.

    Args:
        story_id: The story ID (e.g., "63-4" or "PROJ-12398")

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


def find_story_in_data(
    sprint_data: dict[str, Any] | None, story_id: str
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, str | None]:
    """Locate a story anywhere in merged sprint data by id OR jira key.

    Used by mutation commands that accept either format on the CLI. Handles
    the case where ``story_id.split("-")[0]`` does not match any epic id —
    e.g. ``PROJ-17082`` against an epic whose id is ``"151"`` — by walking
    every epic shard and comparing both ``story.id`` and ``story.jira``.

    Args:
        sprint_data: Sprint dict (post-``read_sprint`` merge)
        story_id: Local id (e.g. ``151-3``) or Jira key (e.g. ``PROJ-17082``)

    Returns:
        ``(epic, story, location)`` triple where:
        - ``epic`` is the containing epic dict, or ``None`` if the story
          lives in ``standalone_stories`` or top-level ``stories``.
        - ``story`` is the story dict, or ``None`` if not found.
        - ``location`` describes where it was found:
          ``"epic <id>"``, ``"standalone_stories"``, ``"stories"``,
          or ``None`` when not found.
    """
    if not sprint_data:
        return None, None, None

    # Fast path: parts[0]-based epic lookup matches the original story id format.
    parts = story_id.split("-")
    if len(parts) >= 2:
        epic = find_epic(sprint_data, parts[0])
        if epic is not None:
            story = find_story(epic, story_id)
            if story is not None:
                return epic, story, f"epic {epic.get('id', parts[0])}"

    # Fallback: walk every epic's stories matching either id or jira.
    for epic in sprint_data.get("epics", []):
        if not isinstance(epic, dict):
            continue
        for story in epic.get("stories", []):
            if not isinstance(story, dict):
                continue
            if story.get("id") == story_id or story.get("jira") == story_id:
                return epic, story, f"epic {epic.get('id', '')}"

    # Fallback: standalone_stories and top-level stories (id or jira).
    for section in ("standalone_stories", "stories"):
        for story in sprint_data.get(section, []):
            if not isinstance(story, dict):
                continue
            if story.get("id") == story_id or story.get("jira") == story_id:
                return None, story, section

    return None, None, None


def get_story_field(sprint_data: dict[str, Any], story_id: str, field_name: str) -> Any | None:
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
