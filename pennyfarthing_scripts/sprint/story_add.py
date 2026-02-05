"""Sprint story add command.

Story: MSSCI-14256 - Sprint story add command

This module provides:
- generate_story_id(sprint_data, epic) -> str
- add_story(sprint_path, epic_id, title, points, ...) -> dict
- story_add_command (Click command for CLI registration)
"""

from pathlib import Path
from typing import Any

import click
from ruamel.yaml.comments import CommentedMap

from pennyfarthing_scripts.sprint.loader import find_epic
from pennyfarthing_scripts.sprint.validator import validate_full_sprint
from pennyfarthing_scripts.sprint.yaml_io import (
    STORY_KEY_ORDER,
    read_sprint,
    write_sprint,
)


def _extract_epic_num(epic: Any) -> str:
    """Extract the numeric part from an epic ID like 'epic-76' -> '76'."""
    epic_id = str(epic.get("id", ""))
    return epic_id.replace("epic-", "")


def generate_story_id(sprint_data: Any, epic: Any) -> str:
    """Generate the next story ID for an epic.

    Args:
        sprint_data: Full sprint YAML data
        epic: The target epic dict/CommentedMap

    Returns:
        Next story ID string (e.g., "76-3")
    """
    epic_num = _extract_epic_num(epic)
    stories = epic.get("stories", [])

    max_seq = 0
    for story in stories:
        story_id = str(story.get("id", ""))
        parts = story_id.split("-")
        if len(parts) >= 2:
            try:
                seq = int(parts[-1])
                if seq > max_seq:
                    max_seq = seq
            except ValueError:
                pass

    return f"{epic_num}-{max_seq + 1}"


def add_story(
    sprint_path: Path,
    epic_id: str,
    title: str,
    points: int,
    *,
    story_type: str | None = None,
    priority: str = "P1",
    workflow: str = "tdd",
    jira: str | None = None,
) -> dict[str, Any]:
    """Add a new story to an epic in the sprint YAML.

    Args:
        sprint_path: Path to sprint YAML file
        epic_id: Epic ID to add the story to
        title: Story title
        points: Story points
        story_type: Optional story type (feature, bug, chore, refactor)
        priority: Priority (default: P1)
        workflow: Workflow (default: tdd)
        jira: Optional Jira key

    Returns:
        Dict with success status and story_id or error
    """
    data = read_sprint(sprint_path)

    epic = find_epic(data, epic_id)
    if epic is None:
        available = []
        for e in data.get("epics", []):
            available.append(str(e.get("id", "")))
        return {
            "success": False,
            "error": f"Epic '{epic_id}' not found. Available epics: {', '.join(available)}",
        }

    story_id = generate_story_id(data, epic)

    # Build story as CommentedMap with canonical key ordering
    story = CommentedMap()
    fields: dict[str, Any] = {
        "id": story_id,
        "title": title,
        "points": points,
        "priority": priority,
        "status": "backlog",
        "workflow": workflow,
    }
    if jira is not None:
        fields["jira"] = jira
    if story_type is not None:
        fields["type"] = story_type

    # Insert keys in STORY_KEY_ORDER, then any extras
    for key in STORY_KEY_ORDER:
        if key in fields:
            story[key] = fields[key]
    for key in fields:
        if key not in STORY_KEY_ORDER:
            story[key] = fields[key]

    # Append to epic's stories list
    if "stories" not in epic:
        from ruamel.yaml.comments import CommentedSeq
        epic["stories"] = CommentedSeq()
    epic["stories"].append(story)

    # Validate before writing
    result = validate_full_sprint(data)
    if not result.valid:
        # Remove the story we just added to avoid corrupting data
        epic["stories"].pop()
        return {
            "success": False,
            "error": f"Validation failed after insertion: {result.errors}",
        }

    write_sprint(sprint_path, data)

    return {
        "success": True,
        "story_id": story_id,
    }


@click.command("add")
@click.argument("epic_id", type=str)
@click.argument("title", type=str)
@click.argument("points", type=int)
@click.option("--type", "story_type", type=click.Choice(["feature", "bug", "chore", "refactor"]), default="feature")
@click.option("--priority", type=click.Choice(["P0", "P1", "P2", "P3"]), default="P1")
@click.option("--workflow", type=click.Choice(["tdd", "trivial", "bdd"]), default="tdd")
@click.option("--jira", "jira_id", type=str, default=None)
@click.option("--sprint-file", type=click.Path(), default=None, help="Path to sprint YAML file")
def story_add_command(
    epic_id: str,
    title: str,
    points: int,
    story_type: str,
    priority: str,
    workflow: str,
    jira_id: str | None,
    sprint_file: str | None,
) -> None:
    """Add a new story to an epic."""
    if sprint_file is None:
        from pennyfarthing_scripts.common.config import get_project_root
        path = get_project_root() / "sprint" / "current-sprint.yaml"
    else:
        path = Path(sprint_file)

    result = add_story(
        sprint_path=path,
        epic_id=epic_id,
        title=title,
        points=points,
        story_type=story_type if story_type != "feature" else None,
        priority=priority,
        workflow=workflow,
        jira=jira_id,
    )

    if result["success"]:
        click.echo(f"Added story {result['story_id']}: {title} [{points}pts]")
    else:
        raise click.ClickException(result["error"])
