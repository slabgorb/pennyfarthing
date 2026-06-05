"""Sprint story update command.

Story: PROJ-14257 - Sprint story update command

This module provides:
- update_story(sprint_path, story_id, ...) -> dict
- story_update_command (Click command for CLI registration)
"""

import subprocess
from datetime import date
from pathlib import Path
from typing import Any

import click

from pf.jira.client import get_client, is_jira_enabled, map_status_to_jira
from pf.sprint.loader import find_story_in_data
from pf.sprint.status_normalize import normalize_status
from pf.sprint.validator import VALID_STORY_STATUSES, validate_sprint_document
from pf.sprint.yaml_io import read_sprint, write_sprint

# Sentinel values that mean "no real Jira key" even though the field is present.
_NO_JIRA_SENTINELS = {"", "none", "null", "x"}


def _has_real_jira_key(story: dict[str, Any]) -> bool:
    """Return True only when the story carries a real Jira key.

    ``story.get("jira")`` is truthy for placeholder sentinels like the literal
    string ``"none"``, which would let an auto-assign lookup (``jira me``) run on
    a personal-project story that has no Jira side (gh #12). Normalize ``None``,
    empty/whitespace, and the ``none``/``null``/``x`` sentinels (case-insensitive)
    to "no key".
    """
    key = story.get("jira")
    if not isinstance(key, str):
        return bool(key)
    return key.strip().lower() not in _NO_JIRA_SENTINELS


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
    add_ac: list[str] | None = None,
    clear_ac: bool = False,
    dry_run: bool = False,
    update_jira: bool = False,
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
        add_ac: Acceptance criteria to append
        clear_ac: If True, clear existing ACs before adding
        dry_run: If True, report changes without writing
        update_jira: If True, sync changed fields to Jira after YAML update

    Returns:
        Dict with success status and optional error
    """
    # Validate status before reading file
    if status is not None and status not in VALID_STORY_STATUSES:
        return {
            "success": False,
            "error": f"Invalid status '{status}'. Must be one of: {', '.join(sorted(VALID_STORY_STATUSES))}",
        }

    data = read_sprint(sprint_path)

    _epic, story, _location = find_story_in_data(data, story_id)

    if story is None:
        return {
            "success": False,
            "error": f"Story '{story_id}' not found in epics, standalone_stories, or stories",
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
    if clear_ac:
        story["acceptance_criteria"] = []
    if add_ac:
        existing = story.get("acceptance_criteria", [])
        if not isinstance(existing, list):
            existing = []
        existing.extend(add_ac)
        story["acceptance_criteria"] = existing

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
        # Auto-set assignee from current Jira user if not already assigned.
        # Skip when (a) jira integration is not configured at all, or (b) the
        # story itself has no jira key — in either case running `jira me`
        # would either fail or pull data into a story that has no Jira side.
        if (
            "assigned_to" not in story
            and assigned_to is None
            and is_jira_enabled()
            and _has_real_jira_key(story)
        ):
            try:
                result = subprocess.run(["jira", "me"], capture_output=True, text=True)
                if result.returncode == 0 and result.stdout.strip():
                    story["assigned_to"] = result.stdout.strip()
            except Exception:
                pass

    # Validate after mutation — route by document type so a raw epic shard
    # (no top-level `sprint:` wrapper, handed in via --sprint-file) is checked
    # against the epic-shard schema instead of the full-sprint schema (gh #10).
    result = validate_sprint_document(data)
    if not result.valid:
        return {
            "success": False,
            "error": f"Validation failed after update: {result.errors}",
        }

    if dry_run:
        # Exercise the real write path against a throwaway location so
        # serialization/IO failures surface in dry-run too (parity with the
        # real run) — without persisting to the live sprint file.
        import tempfile

        with tempfile.TemporaryDirectory() as _td:
            write_sprint(Path(_td) / "current-sprint.yaml", data)
        return {
            "success": True,
            "dry_run": True,
            "story_id": story_id,
        }

    write_sprint(sprint_path, data)

    # Jira sync: after YAML succeeds, push changed fields to Jira
    jira_steps: list[dict[str, Any]] = []
    jira_key = story.get("jira")

    if update_jira and _has_real_jira_key(story):
        client = get_client()

        # Status transition
        if status is not None:
            jira_target = map_status_to_jira(status)
            try:
                jira_result = client.transition_sync(jira_key, jira_target)
                jira_steps.append({
                    "action": "transition",
                    "success": jira_result.get("success", False),
                    "error": jira_result.get("error"),
                })
            except Exception as exc:
                jira_steps.append({"action": "transition", "success": False, "error": str(exc)})

        # Field updates (points, description)
        jira_fields: dict[str, Any] = {}
        if points is not None:
            jira_fields["customfield_10031"] = points
        if description is not None:
            jira_fields["summary"] = description
        if jira_fields:
            try:
                client.update_issue_sync(jira_key, jira_fields)
                jira_steps.append({"action": "update_fields", "success": True})
            except Exception as exc:
                jira_steps.append({"action": "update_fields", "success": False, "error": str(exc)})

        # Assignee
        if assigned_to is not None:
            try:
                assign_result = client.assign_issue_sync(jira_key, assigned_to)
                jira_steps.append({
                    "action": "assign",
                    "success": assign_result.get("success", False),
                    "error": assign_result.get("error"),
                })
            except Exception as exc:
                jira_steps.append({"action": "assign", "success": False, "error": str(exc)})

    elif update_jira and not jira_key:
        jira_steps.append({"action": "skipped", "reason": "no jira key on story"})

    result_dict: dict[str, Any] = {
        "success": True,
        "story_id": story_id,
    }

    if jira_steps:
        result_dict["jira"] = jira_steps
        failed = [s for s in jira_steps if s.get("success") is False]
        if failed:
            result_dict["jira_errors"] = True

    return result_dict


@click.command("update")
@click.argument("story_id")
@click.option(
    "--status",
    type=click.Choice(
        [
            "backlog",
            "ready",
            "in_progress",
            "in-progress",
            "in_review",
            "in-review",
            "done",
            "canceled",
        ]
    ),
)
@click.option("--completed", "completed_date", default=None)
@click.option("--assigned-to", default=None)
@click.option("--points", type=int, default=None)
@click.option("--priority", default=None)
@click.option("--started", "started_date", default=None)
@click.option("--workflow", default=None)
@click.option("--description", default=None, help="Story description text")
@click.option("--review-findings", default=None, help="Reviewer findings text")
@click.option(
    "--review-verdict", type=click.Choice(["approved", "rejected", "pending"]), default=None
)
@click.option("--add-ac", multiple=True, help="Acceptance criterion to append (repeatable)")
@click.option(
    "--clear-ac", is_flag=True, help="Clear all acceptance criteria (use with --add-ac to replace)"
)
@click.option("--dry-run", is_flag=True)
@click.option("--jira", "update_jira", is_flag=True, help="Sync changed fields to Jira after YAML update")
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
    add_ac: tuple[str, ...],
    clear_ac: bool,
    dry_run: bool,
    update_jira: bool,
    sprint_file: str | None,
) -> None:
    """Update a story's fields by ID."""
    if status:
        status = normalize_status(status)
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
        add_ac=list(add_ac) if add_ac else None,
        clear_ac=clear_ac,
        dry_run=dry_run,
        update_jira=update_jira,
    )

    if result["success"]:
        if result.get("dry_run"):
            click.echo(f"[DRY-RUN] Would update story {result['story_id']}")
        else:
            click.echo(f"Updated story {result['story_id']}")
            if result.get("jira_errors"):
                click.echo("[WARN] YAML updated but some Jira syncs failed:")
                for step in result.get("jira", []):
                    if step.get("success") is False:
                        click.echo(f"  - {step['action']}: {step.get('error', 'unknown')}")
            elif result.get("jira"):
                skipped = [s for s in result["jira"] if s.get("action") == "skipped"]
                if skipped:
                    click.echo(f"[WARN] Jira sync skipped: {skipped[0].get('reason')}")
                else:
                    click.echo("Jira synced")
    else:
        raise click.ClickException(result["error"])
