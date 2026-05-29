"""Generate epic stories from a superpowers plan (1 story per ### Task N)."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import click

from pf.common.config import get_project_root
from pf.sprint.loader import find_epic
from pf.sprint.plan_parser import PlanTask, parse_plan
from pf.sprint.repo_map import repos_for_files
from pf.sprint.story_add import add_story
from pf.sprint.yaml_io import read_sprint

_COMPLETE_STEP = "- [ ] **Story {sid} complete** — run `pf sprint story complete {sid}`"
_TASK_NUM_RE = re.compile(r"^###\s+Task\s+(\d+):")


def _rel_plan(plan_path: Path, root: Path) -> str:
    try:
        return str(plan_path.resolve().relative_to(root.resolve()))
    except ValueError:
        return str(plan_path)


def _story_with_ref(epic: dict[str, Any], ref: str) -> dict[str, Any] | None:
    for s in epic.get("stories", []) or []:
        if isinstance(s, dict) and s.get("plan_ref") == ref:
            return s
    return None


def _annotate_task(lines: list[str], task: PlanTask, sid: str) -> list[str]:
    """Insert the closing `pf sprint story complete <sid>` step into a task block."""
    marker = None
    for idx, ln in enumerate(lines):
        m = _TASK_NUM_RE.match(ln)
        if m and int(m.group(1)) == task.number:
            marker = idx
            break
    if marker is None:
        return lines

    end = len(lines)
    for idx in range(marker + 1, len(lines)):
        if lines[idx].startswith("### ") or lines[idx].startswith("## "):
            end = idx
            break

    block = "\n".join(lines[marker:end])
    if f"pf sprint story complete {sid}" in block:
        return lines

    insert_at = end
    while insert_at - 1 > marker and lines[insert_at - 1].strip() == "":
        insert_at -= 1
    return lines[:insert_at] + ["", _COMPLETE_STEP.format(sid=sid)] + lines[insert_at:]


def epic_from_plan(
    sprint_path: Path,
    plan_path: Path | str,
    epic_id: str,
    *,
    project_root: Path | None = None,
    default_points: int = 1,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Create one story per plan Task and annotate the plan with closing steps.

    Idempotent: tasks whose generated plan_ref already exists on the epic are skipped.
    Returns ``{"success", "created", "skipped"}`` or ``{"success": False, "error"}``.
    """
    root = Path(project_root) if project_root else get_project_root()
    plan_file = Path(plan_path)
    if not plan_file.exists():
        return {"success": False, "error": f"Plan not found: {plan_path}"}

    tasks = parse_plan(plan_file.read_text())
    if not tasks:
        return {"success": False, "error": "No '### Task N:' headers found in plan"}

    data = read_sprint(sprint_path)
    if find_epic(data, epic_id) is None:
        return {"success": False, "error": f"Epic '{epic_id}' not found"}

    rel = _rel_plan(plan_file, root)
    created: list[str] = []
    skipped: list[int] = []
    lines = plan_file.read_text().splitlines()

    for task in tasks:
        ref = f"plan:{rel}#{task.anchor}"
        data = read_sprint(sprint_path)
        epic = find_epic(data, epic_id)
        if _story_with_ref(epic, ref):
            skipped.append(task.number)
            continue

        repo_list = repos_for_files(task.files, project_root)
        repos_str = ",".join(repo_list) if repo_list else None

        if dry_run:
            created.append(f"task-{task.number}")
            continue

        res = add_story(
            sprint_path, epic_id, task.title, default_points,
            workflow="superpowers", repos=repos_str, plan_ref=ref,
        )
        if not res.get("success"):
            return {"success": False, "error": f"Task {task.number}: {res.get('error')}"}
        sid = res["story_id"]
        created.append(sid)
        lines = _annotate_task(lines, task, sid)

    if not dry_run:
        plan_file.write_text("\n".join(lines) + "\n")

    return {"success": True, "created": created, "skipped": skipped}


@click.command("from-plan")
@click.argument("plan_path", type=click.Path(exists=True))
@click.argument("epic_id", type=str)
@click.option("--points", "default_points", type=int, default=1,
              help="Default points per generated story (default: 1)")
@click.option("--sprint-file", type=click.Path(), default=None,
              help="Path to sprint YAML file")
@click.option("--dry-run", is_flag=True, help="Show what would be created")
def epic_from_plan_command(
    plan_path: str, epic_id: str, default_points: int,
    sprint_file: str | None, dry_run: bool,
) -> None:
    """Generate epic stories from a superpowers plan (1 story per ### Task N)."""
    sprint_path = (
        Path(sprint_file) if sprint_file
        else get_project_root() / "sprint" / "current-sprint.yaml"
    )
    result = epic_from_plan(
        sprint_path, plan_path, epic_id,
        default_points=default_points, dry_run=dry_run,
    )
    if not result["success"]:
        raise click.ClickException(result["error"])
    if dry_run:
        click.echo(
            f"[DRY-RUN] Would create {len(result['created'])} stories; "
            f"skip {len(result['skipped'])}"
        )
    else:
        click.echo(f"Created {len(result['created'])} stories: "
                   f"{', '.join(str(c) for c in result['created'])}")
        if result["skipped"]:
            click.echo(f"Skipped (already present): tasks {result['skipped']}")
