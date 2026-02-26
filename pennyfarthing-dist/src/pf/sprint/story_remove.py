"""Sprint story remove command.

Removes a story from sprint YAML (epics, standalone_stories, or stories).

Provides:
- remove_story(sprint_path, story_id, ...) -> dict
- story_remove_command (Click command for CLI registration)
"""

from pathlib import Path
from typing import Any

import click

from pf.sprint.loader import find_epic, find_story
from pf.sprint.validator import validate_full_sprint
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
        story_id: Story ID (e.g., "76-4", "td-1", "MSSCI-15038")
        dry_run: If True, report what would be removed without writing

    Returns:
        Dict with success status, location, and story details
    """
    data = read_sprint(sprint_path)

    # Search epic stories
    parts = story_id.split("-")
    if len(parts) >= 2:
        epic = find_epic(data, parts[0])
        if epic is not None:
            story = find_story(epic, story_id)
            if story is not None:
                epic_id = str(epic.get("id", parts[0]))
                details = {
                    "id": story.get("id"),
                    "title": story.get("title"),
                    "status": story.get("status"),
                    "location": f"epic {epic_id}",
                }
                if dry_run:
                    return {"success": True, "dry_run": True, "story": details}
                epic["stories"].remove(story)
                result = validate_full_sprint(data)
                if not result.valid:
                    return {
                        "success": False,
                        "error": f"Validation failed after removal: {result.errors}",
                    }
                write_sprint(sprint_path, data)
                return {"success": True, "story": details}

    # Search standalone_stories and top-level stories
    for section in ("standalone_stories", "stories"):
        stories_list = data.get(section, [])
        for i, s in enumerate(stories_list):
            if isinstance(s, dict) and (s.get("id") == story_id or s.get("jira") == story_id):
                details = {
                    "id": s.get("id"),
                    "title": s.get("title"),
                    "status": s.get("status"),
                    "location": section,
                }
                if dry_run:
                    return {"success": True, "dry_run": True, "story": details}
                stories_list.pop(i)
                result = validate_full_sprint(data)
                if not result.valid:
                    return {
                        "success": False,
                        "error": f"Validation failed after removal: {result.errors}",
                    }
                write_sprint(sprint_path, data)
                return {"success": True, "story": details}

    return {
        "success": False,
        "error": f"Story '{story_id}' not found in epics, standalone_stories, or stories",
    }


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
      STORY_ID  - Story ID (e.g., 76-4, td-1, MSSCI-15038)

    \b
    Examples:
      pf sprint story remove td-1 --dry-run
      pf sprint story remove MSSCI-15038
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
            click.echo(f"[DRY-RUN] Would remove story {story.get('id')} from {story.get('location')}:")
            click.echo(f"  title: {story.get('title')}")
            click.echo(f"  status: {story.get('status')}")
        else:
            click.echo(f"Removed story {story.get('id')} from {story.get('location')}")
    else:
        raise click.ClickException(result["error"])
