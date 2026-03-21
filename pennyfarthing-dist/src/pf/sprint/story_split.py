"""Sprint story split command.

Story: 150-15 — pf sprint story split with dependency tracking

This module provides:
- split_story(sprint_path, story_id, sub_stories, ...) -> dict
- story_split_command (Click command for CLI registration)
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import click
from ruamel.yaml.comments import CommentedMap, CommentedSeq

from pf.sprint.loader import find_epic, find_story
from pf.sprint.story_add import generate_story_id
from pf.sprint.yaml_io import STORY_KEY_ORDER, read_sprint, write_sprint


def _find_story_and_epic(
    data: Any, story_id: str
) -> tuple[Any | None, Any | None]:
    """Find a story and its parent epic in sprint data.

    Returns:
        (epic, story) tuple, either may be None if not found
    """
    for epic in data.get("epics", []):
        story = find_story(epic, story_id)
        if story is not None:
            return epic, story
    return None, None


def split_story(
    sprint_path: Path,
    story_id: str,
    sub_stories: list[dict[str, Any]],
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Split a story into sub-stories with dependency tracking.

    Args:
        sprint_path: Path to sprint YAML file
        story_id: ID of the story to split (e.g., "150-5")
        sub_stories: List of dicts with 'title' and 'points' for each child
        dry_run: If True, preview without making changes

    Returns:
        {success, child_ids?, error?}
    """
    data = read_sprint(sprint_path)

    epic, parent = _find_story_and_epic(data, story_id)
    if parent is None:
        return {
            "success": False,
            "error": f"Story '{story_id}' not found in any epic.",
        }

    if len(sub_stories) < 2:
        return {
            "success": False,
            "error": "Must split into at least 2 sub-stories.",
        }

    # Validate no zero-point children
    for i, sub in enumerate(sub_stories):
        if sub.get("points", 0) <= 0:
            return {
                "success": False,
                "error": f"Sub-story {i + 1} has {sub.get('points', 0)} points. All must be > 0.",
            }

    # Guard: cannot split done or already-split stories
    parent_status = parent.get("status", "backlog")
    if parent_status in ("done", "split"):
        return {
            "success": False,
            "error": f"Cannot split story with status '{parent_status}'.",
        }

    # Validate point sum
    original_points = parent.get("points", 0)
    child_points_sum = sum(s.get("points", 0) for s in sub_stories)
    if child_points_sum != original_points:
        return {
            "success": False,
            "error": (
                f"Points mismatch: sub-stories total {child_points_sum} "
                f"but original has {original_points} points."
            ),
        }

    # Generate child IDs
    child_ids: list[str] = []
    for _ in sub_stories:
        child_id = generate_story_id(data, epic)
        child_ids.append(child_id)

        # Create a temporary placeholder so generate_story_id increments
        placeholder = CommentedMap()
        placeholder["id"] = child_id
        if "stories" not in epic:
            epic["stories"] = CommentedSeq()
        epic["stories"].append(placeholder)

    # Remove the placeholders — we'll add the real stories next
    for _ in sub_stories:
        epic["stories"].pop()

    if dry_run:
        return {
            "success": True,
            "child_ids": child_ids,
            "dry_run": True,
        }

    # Inherit fields from parent
    parent_repos = parent.get("repos")
    parent_workflow = parent.get("workflow", "tdd")
    parent_priority = parent.get("priority", "p1")

    # Create child stories
    for child_id, sub in zip(child_ids, sub_stories):
        child = CommentedMap()
        fields: dict[str, Any] = {
            "id": child_id,
            "title": sub["title"],
            "points": sub["points"],
            "priority": parent_priority,
            "status": "backlog",
            "workflow": parent_workflow,
            "depends_on": story_id,
        }
        if parent_repos is not None:
            fields["repos"] = parent_repos

        # Insert keys in canonical order
        for key in STORY_KEY_ORDER:
            if key in fields:
                child[key] = fields[key]
        for key in fields:
            if key not in STORY_KEY_ORDER:
                child[key] = fields[key]

        epic["stories"].append(child)

    # Update parent: status → split, add split_into
    parent["status"] = "split"
    parent["split_into"] = child_ids

    write_sprint(sprint_path, data)

    return {
        "success": True,
        "child_ids": child_ids,
    }


@click.command("split")
@click.argument("story_id", type=str)
@click.option("--into", "-n", type=int, default=None, help="Number of sub-stories")
@click.option("--dry-run", is_flag=True, help="Preview without making changes")
@click.option("--sprint-file", type=click.Path(), default=None, help="Path to sprint YAML")
def story_split_command(
    story_id: str,
    into: int | None,
    dry_run: bool,
    sprint_file: str | None,
) -> None:
    """Split a story into sub-stories with dependency tracking.

    Prompts for titles and point allocation for each sub-story.
    Points must sum to the original story's total.
    """
    from pf.common.config import get_project_root

    root = get_project_root()
    sprint_path = Path(sprint_file) if sprint_file else root / "sprint" / "current-sprint.yaml"

    # Read the story to show context
    data = read_sprint(sprint_path)
    epic, parent = _find_story_and_epic(data, story_id)
    if parent is None:
        click.echo(f"Error: Story '{story_id}' not found.", err=True)
        raise SystemExit(1)

    original_points = parent.get("points", 0)
    click.echo(f"Splitting: {story_id} — {parent.get('title', '')} ({original_points} pts)")

    # Determine number of sub-stories
    count = into or click.prompt("How many sub-stories?", type=int)
    if count < 2:
        click.echo("Error: Must split into at least 2 sub-stories.", err=True)
        raise SystemExit(1)

    # Collect sub-story details
    sub_stories: list[dict[str, Any]] = []
    remaining = original_points
    for i in range(count):
        title = click.prompt(f"  Sub-story {i + 1} title")
        if i == count - 1:
            pts = remaining
            click.echo(f"  Sub-story {i + 1} points: {pts} (remaining)")
        else:
            pts = click.prompt(f"  Sub-story {i + 1} points (remaining: {remaining})", type=int)
        remaining -= pts
        sub_stories.append({"title": title, "points": pts})

    result = split_story(
        sprint_path=sprint_path,
        story_id=story_id,
        sub_stories=sub_stories,
        dry_run=dry_run,
    )

    if not result["success"]:
        click.echo(f"Error: {result['error']}", err=True)
        raise SystemExit(1)

    prefix = "[DRY RUN] " if dry_run else ""
    click.echo(f"\n{prefix}Split {story_id} into:")
    for child_id in result["child_ids"]:
        click.echo(f"  → {child_id}")
