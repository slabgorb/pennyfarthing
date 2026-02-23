"""Sprint story update command.

Story: MSSCI-14257 - Sprint story update command

This module provides:
- update_story(sprint_path, story_id, ...) -> dict
- story_update_command (Click command for CLI registration)
"""

import subprocess
from datetime import date
from pathlib import Path
from typing import Any

import click

from pf.sprint.loader import find_epic, find_story
from pf.sprint.validator import VALID_STORY_STATUSES, validate_full_sprint
from pf.sprint.yaml_io import read_sprint, write_sprint


def update_story(
    sprint_path: Path,
    story_id: str,
    *,
    status: str | None = None,
    points: int | None = None,
    priority: str | None = None,
    assigned_to: str | None = None,
    completed_date: str | None = None,
    started_date: str | None = None,
    workflow: str | None = None,
    description: str | None = None,
    review_findings: str | None = None,
    review_verdict: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Update fields on a story in the sprint YAML.

    Args:
        sprint_path: Path to sprint YAML file
        story_id: Story ID (e.g., "76-4")
        status: New status value
        points: New points value
        priority: New priority value
        assigned_to: New assignee
        completed_date: Completed date (ISO format)
        started_date: Started date (ISO format)
        workflow: Workflow type (tdd, trivial, bdd, agent-docs)
        description: Story description text
        review_findings: Reviewer findings text
        review_verdict: Review verdict (approved, rejected, pending)
        dry_run: If True, report changes without writing

    Returns:
        Dict with success status and optional error
    """
    # Validate status before reading file
    if status is not None and status not in VALID_STORY_STATUSES:
        return {
            "success": False,
            "error": f"Invalid status '{status}'. Must be one of: {', '.join(sorted(VALID_STORY_STATUSES))}",
        }

    # Parse story ID to find epic
    parts = story_id.split("-")
    if len(parts) < 2:
        return {
            "success": False,
            "error": f"Invalid story ID format '{story_id}'. Expected format: <epic>-<seq> (e.g., '76-4')",
        }

    epic_num = parts[0]

    data = read_sprint(sprint_path)

    epic = find_epic(data, epic_num)
    if epic is None:
        return {
            "success": False,
            "error": f"Epic '{epic_num}' not found for story '{story_id}'",
        }

    story = find_story(epic, story_id)
    if story is None:
        return {
            "success": False,
            "error": f"Story '{story_id}' not found in epic '{epic_num}'",
        }

    # Apply field updates
    if status is not None:
        story["status"] = status
    if points is not None:
        story["points"] = points
    if priority is not None:
        story["priority"] = priority
    if assigned_to is not None:
        story["assigned_to"] = assigned_to
    if completed_date is not None:
        story["completed"] = completed_date
    if started_date is not None:
        story["started"] = started_date
    if workflow is not None:
        story["workflow"] = workflow
    if description is not None:
        story["description"] = description
    if review_findings is not None:
        story["review_findings"] = review_findings
    if review_verdict is not None:
        if review_verdict not in ("approved", "rejected", "pending"):
            return {
                "success": False,
                "error": f"Invalid review_verdict '{review_verdict}'. Must be one of: approved, rejected, pending",
            }
        story["review_verdict"] = review_verdict

    # Auto-cleanup rules
    if status == "done":
        # Auto-set completed if not explicitly provided
        if completed_date is None and "completed" not in story:
            story["completed"] = date.today().isoformat()
        elif completed_date is not None:
            story["completed"] = completed_date

    if status == "in_progress":
        # Auto-set started if not already present
        if "started" not in story:
            story["started"] = date.today().isoformat()
        # Auto-set assignee from current Jira user if not already assigned
        if "assigned_to" not in story and assigned_to is None:
            try:
                result = subprocess.run(
                    ["jira", "me"], capture_output=True, text=True
                )
                if result.returncode == 0 and result.stdout.strip():
                    story["assigned_to"] = result.stdout.strip()
            except Exception:
                pass

    # Validate after mutation
    result = validate_full_sprint(data)
    if not result.valid:
        return {
            "success": False,
            "error": f"Validation failed after update: {result.errors}",
        }

    if dry_run:
        return {
            "success": True,
            "dry_run": True,
            "story_id": story_id,
        }

    write_sprint(sprint_path, data)

    return {
        "success": True,
        "story_id": story_id,
    }


@click.command("update")
@click.argument("story_id")
@click.option("--status", type=click.Choice(["backlog", "ready", "in_progress", "done", "canceled"]))
@click.option("--completed", "completed_date", default=None)
@click.option("--assigned-to", default=None)
@click.option("--points", type=int, default=None)
@click.option("--priority", default=None)
@click.option("--started", "started_date", default=None)
@click.option("--workflow", default=None)
@click.option("--description", default=None, help="Story description text")
@click.option("--review-findings", default=None, help="Reviewer findings text")
@click.option("--review-verdict", type=click.Choice(["approved", "rejected", "pending"]), default=None)
@click.option("--dry-run", is_flag=True)
@click.option("--sprint-file", type=click.Path(), default=None, help="Path to sprint YAML file")
def story_update_command(
    story_id: str,
    status: str | None,
    completed_date: str | None,
    assigned_to: str | None,
    points: int | None,
    priority: str | None,
    started_date: str | None,
    workflow: str | None,
    description: str | None,
    review_findings: str | None,
    review_verdict: str | None,
    dry_run: bool,
    sprint_file: str | None,
) -> None:
    """Update a story's fields by ID."""
    if sprint_file is None:
        from pf.common.config import get_project_root
        path = get_project_root() / "sprint" / "current-sprint.yaml"
    else:
        path = Path(sprint_file)

    result = update_story(
        sprint_path=path,
        story_id=story_id,
        status=status,
        points=points,
        priority=priority,
        assigned_to=assigned_to,
        completed_date=completed_date,
        started_date=started_date,
        workflow=workflow,
        description=description,
        review_findings=review_findings,
        review_verdict=review_verdict,
        dry_run=dry_run,
    )

    if result["success"]:
        if result.get("dry_run"):
            click.echo(f"[DRY-RUN] Would update story {result['story_id']}")
        else:
            click.echo(f"Updated story {result['story_id']}")
    else:
        raise click.ClickException(result["error"])
