"""Add standalone stories to current-sprint.yaml.

Provides a CLI command to register done standalone stories
in the sprint index's ``standalone_stories`` section.
"""

from pathlib import Path
from typing import Any

import click
from ruamel.yaml.comments import CommentedMap, CommentedSeq

from pf.sprint.yaml_io import (
    STORY_KEY_ORDER,
    read_sprint,
    write_sprint,
)


def add_standalone_story(
    sprint_path: Path,
    jira_key: str,
    title: str,
    points: int,
    *,
    status: str = "done",
    repos: str = "pennyfarthing",
    pr: int | None = None,
    branch: str | None = None,
) -> dict[str, Any]:
    """Add a standalone story to current-sprint.yaml.

    Args:
        sprint_path: Path to sprint YAML index file
        jira_key: Jira issue key (e.g., PROJ-15501)
        title: Story title
        points: Story points
        status: Story status (default: done)
        repos: Target repo (default: pennyfarthing)
        pr: PR number (optional)
        branch: Branch name (optional)

    Returns:
        Dict with success status or error
    """
    data = read_sprint(sprint_path)

    # Build story entry
    story = CommentedMap()
    fields: dict[str, Any] = {
        "id": jira_key,
        "jira": jira_key,
        "title": title,
        "points": points,
        "status": status,
        "repos": repos,
    }
    if pr is not None:
        fields["pr"] = pr
    if branch is not None:
        fields["branch"] = branch

    # Insert keys in canonical order, then extras
    for key in STORY_KEY_ORDER:
        if key in fields:
            story[key] = fields[key]
    for key in fields:
        if key not in STORY_KEY_ORDER:
            story[key] = fields[key]

    # Ensure standalone_stories section exists
    if "standalone_stories" not in data:
        data["standalone_stories"] = CommentedSeq()
    elif not isinstance(data["standalone_stories"], list):
        data["standalone_stories"] = CommentedSeq()

    # Check for duplicates
    for existing in data["standalone_stories"]:
        if isinstance(existing, dict) and existing.get("id") == jira_key:
            return {
                "success": False,
                "error": f"Standalone story {jira_key} already exists in sprint",
            }

    data["standalone_stories"].append(story)
    write_sprint(sprint_path, data)

    return {"success": True, "id": jira_key}


@click.command("add")
@click.argument("jira_key", type=str)
@click.argument("title", type=str)
@click.argument("points", type=int)
@click.option(
    "--status",
    type=click.Choice(["backlog", "ready", "in_progress", "done", "canceled"]),
    default="done",
    help="Story status (default: done)",
)
@click.option(
    "--repos", type=str, default="pennyfarthing", help="Target repo (default: pennyfarthing)"
)
@click.option("--pr", type=int, default=None, help="PR number")
@click.option("--branch", type=str, default=None, help="Branch name")
@click.option("--sprint-file", type=click.Path(), default=None, help="Path to sprint YAML file")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def standalone_add_command(
    jira_key: str,
    title: str,
    points: int,
    status: str,
    repos: str,
    pr: int | None,
    branch: str | None,
    sprint_file: str | None,
    dry_run: bool,
) -> None:
    """Add a standalone story to current sprint tracking.

    \b
    Usage:
      pf sprint standalone add PROJ-15501 "Auto-pull LFS portraits" 2
      pf sprint standalone add PROJ-15501 "Fix bug" 1 --pr 1070 --repos pennyfarthing
      pf sprint standalone add TEST-001 "Backlog item" 3 --status backlog
    """
    if dry_run:
        click.echo(
            f"[DRY-RUN] Would add standalone story {jira_key}: {title} [{points}pts] (status: {status})"
        )
        if pr:
            click.echo(f"  PR: {pr}")
        if branch:
            click.echo(f"  Branch: {branch}")
        return

    if sprint_file is None:
        from pf.common.config import get_project_root

        path = get_project_root() / "sprint" / "current-sprint.yaml"
    else:
        path = Path(sprint_file)

    result = add_standalone_story(
        sprint_path=path,
        jira_key=jira_key,
        title=title,
        points=points,
        status=status,
        repos=repos,
        pr=pr,
        branch=branch,
    )

    if result["success"]:
        click.echo(f"Added standalone story {jira_key}: {title} [{points}pts]")
    else:
        raise click.ClickException(result["error"])
