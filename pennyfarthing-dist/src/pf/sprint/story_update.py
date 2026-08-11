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
from pf.sprint.loader import (
    NO_JIRA_SENTINELS,
    _has_real_jira_key,
    find_story_in_data,
    format_story_not_found_error,
)
from pf.sprint.status_normalize import normalize_status
from pf.sprint.story_move import move_story
from pf.sprint.validator import (
    VALID_STORY_STATUSES,
    VALID_STORY_TYPES,
    validate_sprint_document,
)
from pf.sprint.yaml_io import read_sprint, write_sprint

# Sentinel handling consolidated into pf.sprint.loader (story 160-3).
# Keep the private alias for any in-module/back-compat references.
_NO_JIRA_SENTINELS = NO_JIRA_SENTINELS


def update_story(
    sprint_path: Path,
    story_id: str,
    *,
    status: str | None = None,
    title: str | None = None,
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
    story_type: str | None = None,
    depends_on: str | None = None,
    dry_run: bool = False,
    update_jira: bool = False,
    epic: str | None = None,
) -> dict[str, Any]:
    """Update fields on a story in the sprint YAML.

    Args:
        sprint_path: Path to sprint YAML file
        story_id: Story ID (e.g., "76-4")
        epic: Target epic to move the story into. Delegates to
            ``move_story`` (gh #13) — the story is renumbered to the target
            epic's next sequential id and dependents are rewritten. Cannot be
            combined with field updates (fail-loud, no silent drop).
        status: New status value
        title: New story title
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
        story_type: New story type tag (validated against VALID_STORY_TYPES)
        depends_on: Story ID this story depends on. Must resolve to a real
            story and may not be the story itself (fail-loud on either).
        dry_run: If True, report changes without writing
        update_jira: If True, sync changed fields to Jira after YAML update

    Returns:
        Result dict; both paths carry a top-level ``story_id`` on success.

        Field-update path: ``{"success": True, "story_id": <id>}`` plus
        ``dry_run: True`` under dry-run and optional ``jira``/``jira_errors``
        keys after a Jira sync.

        --epic path (delegates to ``move_story``): the move result with
        ``story_id`` added — ``{"success": True, "story": {...move
        details...}, "story_id": <post-move id>}``. After a real move
        ``story_id`` is the renumbered (new) id; under dry-run or a same-epic
        no-op it is the story's unchanged id.

        On any failure: ``{"success": False, "error": <message>}``.
    """
    # --epic delegates to move_story (gh #13). It owns the atomic
    # remove/insert/renumber/dependency-rewrite + shard-aware IO (SOUL #2), so
    # we don't reimplement any of it here. Reject the combination with field
    # updates so a co-passed flag is never silently dropped (epic-160 charter).
    if epic is not None:
        field_flags = {
            "--status": status is not None,
            "--title": title is not None,
            "--points": points is not None,
            "--priority": priority is not None,
            "--assigned-to": assigned_to is not None,
            "--completed": completed_date is not None,
            "--started": started_date is not None,
            "--workflow": workflow is not None,
            "--description": description is not None,
            "--review-findings": review_findings is not None,
            "--review-verdict": review_verdict is not None,
            "--add-ac": bool(add_ac),
            "--clear-ac": clear_ac,
            "--type": story_type is not None,
            "--depends-on": depends_on is not None,
        }
        conflicting = [flag for flag, present in field_flags.items() if present]
        if conflicting:
            return {
                "success": False,
                "error": (
                    f"--epic cannot be combined with field updates "
                    f"({', '.join(conflicting)}). Move the story first, then "
                    f"update its fields."
                ),
            }
        move_result = move_story(sprint_path, story_id, to_epic=epic, dry_run=dry_run)
        # Uniform result shape (160-24): every success from update_story
        # carries a top-level story_id. After a real move that's the
        # renumbered id; dry-run and same-epic no-op results have no new_id,
        # so the story's unchanged id is reported.
        if move_result.get("success"):
            details = move_result.get("story") or {}
            move_result["story_id"] = (
                details.get("new_id") or details.get("id") or story_id
            )
        return move_result

    # Validate status before reading file
    if status is not None and status not in VALID_STORY_STATUSES:
        return {
            "success": False,
            "error": f"Invalid status '{status}'. Must be one of: {', '.join(sorted(VALID_STORY_STATUSES))}",
        }

    # Validate type before reading file (fail-loud, no throw — SOUL #10)
    if story_type is not None and story_type not in VALID_STORY_TYPES:
        return {
            "success": False,
            "error": f"Invalid type '{story_type}'. Must be one of: {', '.join(sorted(VALID_STORY_TYPES))}",
        }

    data = read_sprint(sprint_path)

    _epic, story, _location = find_story_in_data(data, story_id)

    if story is None:
        return {
            "success": False,
            "error": format_story_not_found_error(data, story_id),
        }

    # A depends_on target may not be the story itself and must resolve to a real
    # story (truthfulness charter). One coherent guard, evaluated after the story
    # resolves so a self-dependency is reported only once the story is known (F6/D3).
    if depends_on is not None:
        if depends_on == story_id:
            return {
                "success": False,
                "error": f"Story '{story_id}' cannot depend on itself.",
            }
        _dep_epic, dep_story, _dep_loc = find_story_in_data(data, depends_on)
        if dep_story is None:
            return {
                "success": False,
                "error": f"--depends-on target '{depends_on}' does not resolve to a known story.",
            }

    # Apply field updates
    if status is not None:
        story["status"] = status
    if title is not None:
        story["title"] = title
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
    if story_type is not None:
        story["type"] = story_type
    if depends_on is not None:
        story["depends_on"] = depends_on
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
@click.option("--title", default=None, help="New story title")
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
@click.option(
    "--type",
    "story_type",
    type=click.Choice(sorted(VALID_STORY_TYPES), case_sensitive=False),
    default=None,
    # Help derived from the validator's set — one source of truth, no drift (F1).
    # click.Choice normalises case (`--type Feature` → `feature`) and yields a
    # Click parse error (exit 2) on an invalid value, matching --status/--review-verdict.
    help=f"Story type tag ({', '.join(sorted(VALID_STORY_TYPES))})",
)
@click.option(
    "--depends-on",
    default=None,
    help="Story ID this story depends on (must resolve to a real story)",
)
@click.option(
    "--epic",
    default=None,
    help=(
        "Move the story to another epic (delegates to `story move`): "
        "renumbers to the target epic's next id and rewrites dependents. "
        "Cannot be combined with the field flags above."
    ),
)
@click.option("--dry-run", is_flag=True)
@click.option("--jira", "update_jira", is_flag=True, help="Sync changed fields to Jira after YAML update")
@click.option("--sprint-file", type=click.Path(), default=None, help="Path to sprint YAML file")
def story_update_command(
    story_id: str,
    status: str | None,
    title: str | None,
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
    story_type: str | None,
    depends_on: str | None,
    dry_run: bool,
    update_jira: bool,
    epic: str | None,
    sprint_file: str | None,
) -> None:
    """Update a story's fields by ID.

    \b
    Field updates (all optional, combinable):
      --status --title --points --priority --assigned-to
      --completed --started --workflow --description
      --review-findings --review-verdict --add-ac --clear-ac
      --type --depends-on

    \b
    Move between epics (mutually exclusive with the field flags):
      --epic TARGET   Delegates to `pf sprint story move`.

    \b
    Modifiers: --dry-run, --jira, --sprint-file
    """
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
        title=title,
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
        story_type=story_type,
        depends_on=depends_on,
        dry_run=dry_run,
        update_jira=update_jira,
        epic=epic,
    )

    if result["success"]:
        # --epic delegated to move_story, which returns a move-shaped result.
        if epic is not None:
            story = result.get("story", {})
            if result.get("no_op"):
                click.echo(
                    f"Story {story.get('id')} is already in epic "
                    f"{story.get('to_epic')} — nothing to move"
                )
            elif result.get("dry_run"):
                click.echo(
                    f"[DRY-RUN] Would move story {story.get('id')} "
                    f"to epic {story.get('to_epic')}"
                )
            else:
                click.echo(
                    f"Moved story {story.get('old_id')} to epic "
                    f"{story.get('to_epic')} as {story.get('new_id')}"
                )
        elif result.get("dry_run"):
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
