"""Sprint story remove command.

Removes a story from sprint YAML (epics, standalone_stories, or stories).

Provides:
- remove_story(sprint_path, story_id, ...) -> dict
- story_remove_command (Click command for CLI registration)
"""

from pathlib import Path
from typing import Any

import click

from pf.sprint.loader import find_story_in_data, format_story_not_found_error
from pf.sprint.validator import validate_sprint_document
from pf.sprint.yaml_io import read_sprint, write_sprint


def remove_story(
    sprint_path: Path,
    story_id: str,
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Remove a story from the sprint YAML.

    Searches epics, standalone_stories, and top-level stories sections.

    Args:
        sprint_path: Path to sprint YAML file
        story_id: Story ID (e.g., "76-4", "td-1", "PROJ-15038")
        dry_run: If True, report what would be removed without writing

    Returns:
        Dict with success status, location, and story details
    """
    data = read_sprint(sprint_path)

    epic, story, location = find_story_in_data(data, story_id)
    if story is None:
        return {
            "success": False,
            "error": format_story_not_found_error(data, story_id),
        }

    details = {
        "id": story.get("id"),
        "title": story.get("title"),
        "status": story.get("status"),
        "location": location,
    }
    if dry_run:
        return {"success": True, "dry_run": True, "story": details}

    if epic is not None:
        epic["stories"].remove(story)
    elif location in ("standalone_stories", "stories"):
        data[location].remove(story)
    else:
        return {
            "success": False,
            "error": f"Internal: unexpected location '{location}' for top-level story",
        }

    result = validate_sprint_document(data)
    if not result.valid:
        return {
            "success": False,
            "error": f"Validation failed after removal: {result.errors}",
        }
    write_sprint(sprint_path, data)
    return {"success": True, "story": details}


@click.command("remove")
@click.argument("story_id")
@click.option("--dry-run", is_flag=True, help="Preview removal without writing")
@click.option("--sprint-file", type=click.Path(), default=None, help="Path to sprint YAML file")
def story_remove_command(
    story_id: str,
    dry_run: bool,
    sprint_file: str | None,
) -> None:
    """Remove a story from the sprint YAML.

    \b
    Arguments:
      STORY_ID  - Story ID (e.g., 76-4, td-1, PROJ-15038)

    \b
    Examples:
      pf sprint story remove td-1 --dry-run
      pf sprint story remove PROJ-15038
      pf sprint story remove 129-3
    """
    if sprint_file is None:
        from pf.common.config import get_project_root

        path = get_project_root() / "sprint" / "current-sprint.yaml"
    else:
        path = Path(sprint_file)

    result = remove_story(sprint_path=path, story_id=story_id, dry_run=dry_run)

    if result["success"]:
        story = result.get("story", {})
        if result.get("dry_run"):
            click.echo(
                f"[DRY-RUN] Would remove story {story.get('id')} from {story.get('location')}:"
            )
            click.echo(f"  title: {story.get('title')}")
            click.echo(f"  status: {story.get('status')}")
        else:
            click.echo(f"Removed story {story.get('id')} from {story.get('location')}")
    else:
        raise click.ClickException(result["error"])
