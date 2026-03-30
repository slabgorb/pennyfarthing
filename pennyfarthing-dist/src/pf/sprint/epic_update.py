"""Sprint epic update command.

Provides:
- update_epic(sprint_path, epic_id, ...) -> dict
- epic_update_command (Click command for CLI registration)
"""

from pathlib import Path
from typing import Any

import click

from pf.sprint.loader import find_epic
from pf.sprint.yaml_io import _get_epic_ref, read_sprint, write_sprint

VALID_EPIC_STATUSES = {"backlog", "in_progress", "done", "canceled"}


def update_epic(
    sprint_path: Path,
    epic_id: str,
    *,
    status: str | None = None,
    priority: str | None = None,
    title: str | None = None,
    jira: str | None = None,
    description: str | None = None,
    repos: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Update fields on an epic in the sprint YAML.

    Args:
        sprint_path: Path to sprint YAML file
        epic_id: Epic ID (e.g., "103" or "PROJ-14951")
        status: New status value
        priority: New priority value
        title: New title
        jira: Jira key (may trigger shard rename)
        description: New description
        repos: Target repo(s)
        dry_run: If True, report changes without writing

    Returns:
        Dict with success status and optional error
    """
    if status is not None and status not in VALID_EPIC_STATUSES:
        return {
            "success": False,
            "error": f"Invalid status '{status}'. Must be one of: {', '.join(sorted(VALID_EPIC_STATUSES))}",
        }

    data = read_sprint(sprint_path)

    epic = find_epic(data, epic_id)
    if epic is None:
        return {
            "success": False,
            "error": f"Epic '{epic_id}' not found in sprint",
        }

    # Capture old shard ref before any mutations
    old_ref = _get_epic_ref(epic)

    changes = {}

    if status is not None:
        old = epic.get("status")
        epic["status"] = status
        changes["status"] = f"{old} -> {status}"

    if priority is not None:
        old = epic.get("priority")
        epic["priority"] = priority
        changes["priority"] = f"{old} -> {priority}"

    if title is not None:
        old = epic.get("title")
        epic["title"] = title
        changes["title"] = f"{old} -> {title}"

    if jira is not None:
        old = epic.get("jira")
        epic["jira"] = jira
        changes["jira"] = f"{old} -> {jira}"

    if description is not None:
        old = epic.get("description", "")
        epic["description"] = description
        changes["description"] = f"{'(set)' if old else '(added)'}"

    if repos is not None:
        old = epic.get("repos")
        epic["repos"] = repos
        changes["repos"] = f"{old} -> {repos}"

    if not changes:
        return {
            "success": False,
            "error": "No fields to update. Pass --status, --priority, --title, --jira, --description, or --repos.",
        }

    # Check if shard ref changed (e.g., from numeric to Jira key)
    new_ref = _get_epic_ref(epic)
    shard_renamed = old_ref != new_ref

    if shard_renamed:
        changes["shard"] = f"epic-{old_ref}.yaml -> epic-{new_ref}.yaml"

    if dry_run:
        return {
            "success": True,
            "dry_run": True,
            "epic_id": str(epic.get("id", epic_id)),
            "changes": changes,
        }

    write_sprint(sprint_path, data)

    return {
        "success": True,
        "epic_id": str(epic.get("id", epic_id)),
        "changes": changes,
    }


@click.command("update")
@click.argument("epic_id")
@click.option(
    "--status",
    type=click.Choice(sorted(VALID_EPIC_STATUSES)),
    help="New epic status",
)
@click.option("--priority", help="New priority (e.g., P0, P1)")
@click.option("--title", help="New epic title")
@click.option("--jira", help="Jira epic key (may trigger shard rename)")
@click.option("--description", help="Epic description text")
@click.option("--repos", help="Target repo(s)")
@click.option("--dry-run", is_flag=True, help="Show changes without writing")
@click.option(
    "--sprint-file",
    type=click.Path(),
    default=None,
    help="Path to sprint YAML file",
)
def epic_update_command(
    epic_id: str,
    status: str | None,
    priority: str | None,
    title: str | None,
    jira: str | None,
    description: str | None,
    repos: str | None,
    dry_run: bool,
    sprint_file: str | None,
) -> None:
    """Update an epic's fields by ID.

    \b
    Arguments:
      EPIC_ID  - Epic ID (e.g., 103, epic-103, or PROJ-14951)

    \b
    Examples:
      pf sprint epic update 103 --status in_progress
      pf sprint epic update PROJ-14951 --status in_progress
      pf sprint epic update 103 --priority P0 --dry-run
      pf sprint epic update 129 --jira PROJ-15680
      pf sprint epic update 103 --title "New title" --description "Updated desc"
    """
    if sprint_file is None:
        from pf.common.config import get_project_root

        path = get_project_root() / "sprint" / "current-sprint.yaml"
    else:
        path = Path(sprint_file)

    result = update_epic(
        sprint_path=path,
        epic_id=epic_id,
        status=status,
        priority=priority,
        title=title,
        jira=jira,
        description=description,
        repos=repos,
        dry_run=dry_run,
    )

    if result["success"]:
        if result.get("dry_run"):
            click.echo(f"[DRY-RUN] Would update epic {result['epic_id']}:")
            for field, change in result.get("changes", {}).items():
                click.echo(f"  {field}: {change}")
        else:
            click.echo(f"Updated epic {result['epic_id']}:")
            for field, change in result.get("changes", {}).items():
                click.echo(f"  {field}: {change}")
    else:
        raise click.ClickException(result["error"])
