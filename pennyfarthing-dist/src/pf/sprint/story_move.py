"""Sprint story move command.

Moves a story from its current epic to a different epic. Both the source and
target epic shards are persisted via the shard-aware ``read_sprint`` /
``write_sprint`` contract (the same path 153-4 fixed for remove/update), so a
move survives the sharded sprint layout.

Provides:
- move_story(sprint_path, story_id, to_epic, ...) -> dict
- story_move_command (Click command for CLI registration)
"""

from pathlib import Path
from typing import Any

import click
from ruamel.yaml.comments import CommentedSeq

from pf.sprint.loader import find_epic, find_story_in_data
from pf.sprint.story_add import generate_story_id
from pf.sprint.validator import validate_sprint_document
from pf.sprint.yaml_io import read_sprint, write_sprint


def _all_story_ids(data: dict[str, Any]) -> list[str]:
    """Collect every story id in the sprint (for not-found error messages)."""
    ids: list[str] = []
    for epic in data.get("epics", []):
        if not isinstance(epic, dict):
            continue
        for story in epic.get("stories", []):
            if isinstance(story, dict) and story.get("id"):
                ids.append(str(story["id"]))
    for section in ("standalone_stories", "stories"):
        for story in data.get(section, []):
            if isinstance(story, dict) and story.get("id"):
                ids.append(str(story["id"]))
    return ids


def _all_epic_ids(data: dict[str, Any]) -> list[str]:
    """Collect every epic id in the sprint (for not-found error messages)."""
    return [str(e.get("id", "")) for e in data.get("epics", []) if isinstance(e, dict)]


def move_story(
    sprint_path: Path,
    story_id: str,
    to_epic: str,
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Move a story from its current epic to ``to_epic``.

    The story is renumbered to the target epic's next sequential id so the id
    prefix stays consistent with epic membership.

    Args:
        sprint_path: Path to sprint YAML file
        story_id: Story id (e.g. "151-3") or Jira key (e.g. "PROJ-17082")
        to_epic: Target epic id to move the story into
        dry_run: If True, report the planned move without writing

    Returns:
        Result dict with ``success`` and either ``story`` details or ``error``.
    """
    data = read_sprint(sprint_path)

    source_epic, story, location = find_story_in_data(data, story_id)
    if story is None:
        candidates = ", ".join(_all_story_ids(data))
        return {
            "success": False,
            "error": f"Story '{story_id}' not found. Available stories: {candidates}",
        }

    target_epic = find_epic(data, to_epic)
    if target_epic is None:
        available = ", ".join(_all_epic_ids(data))
        return {
            "success": False,
            "error": f"Target epic '{to_epic}' not found. Available epics: {available}",
        }

    details: dict[str, Any] = {
        "id": story.get("id"),
        "title": story.get("title"),
        "from": location,
        "to_epic": str(target_epic.get("id", to_epic)),
    }

    if dry_run:
        return {"success": True, "dry_run": True, "story": details}

    # Remove from source (epic shard, standalone, or top-level stories).
    if source_epic is not None:
        source_epic["stories"].remove(story)
    elif location in ("standalone_stories", "stories"):
        data[location].remove(story)
    else:
        return {
            "success": False,
            "error": f"Internal: unexpected location '{location}' for story '{story_id}'",
        }

    # Renumber to the target epic's next id, then append.
    if not target_epic.get("stories"):
        target_epic["stories"] = CommentedSeq()
    old_id = story.get("id")
    new_id = generate_story_id(data, target_epic)
    story["id"] = new_id
    target_epic["stories"].append(story)
    details["old_id"] = old_id
    details["new_id"] = new_id

    result = validate_sprint_document(data)
    if not result.valid:
        return {
            "success": False,
            "error": f"Validation failed after move: {result.errors}",
        }
    write_sprint(sprint_path, data)
    return {"success": True, "story": details}


@click.command("move")
@click.argument("story_id")
@click.option("--to-epic", required=True, help="Target epic ID to move the story into")
@click.option("--dry-run", is_flag=True, help="Preview the move without writing")
@click.option("--sprint-file", type=click.Path(), default=None, help="Path to sprint YAML file")
def story_move_command(
    story_id: str,
    to_epic: str,
    dry_run: bool,
    sprint_file: str | None,
) -> None:
    """Move a story from its current epic to another epic.

    The story is renumbered to the target epic's next sequential id.

    \b
    Arguments:
      STORY_ID  - Story ID (e.g., 151-3) or Jira key (e.g., PROJ-17082)

    \b
    Examples:
      pf sprint story move 151-3 --to-epic 152
      pf sprint story move PROJ-17082 --to-epic 152 --dry-run
    """
    if sprint_file is None:
        from pf.common.config import get_project_root

        path = get_project_root() / "sprint" / "current-sprint.yaml"
    else:
        path = Path(sprint_file)

    result = move_story(sprint_path=path, story_id=story_id, to_epic=to_epic, dry_run=dry_run)

    if result["success"]:
        story = result.get("story", {})
        if result.get("dry_run"):
            click.echo(
                f"[DRY-RUN] Would move story {story.get('id')} to epic {story.get('to_epic')}"
            )
        else:
            click.echo(
                f"Moved story {story.get('old_id')} to epic {story.get('to_epic')} "
                f"as {story.get('new_id')}"
            )
    else:
        raise click.ClickException(result["error"])
