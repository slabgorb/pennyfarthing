"""Complete a superpowers-flow story: status -> done + check its plan box."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import click

from pf.common.config import get_project_root
from pf.sprint.loader import find_story_in_data
from pf.sprint.story_update import update_story
from pf.sprint.yaml_io import read_sprint


def _check_complete_box(plan_file: Path, story_id: str, *, dry_run: bool) -> bool:
    """Flip the `- [ ]` -> `- [x]` on the line invoking complete for this story."""
    needle = f"pf sprint story complete {story_id}"
    lines = plan_file.read_text().splitlines()
    for i, ln in enumerate(lines):
        if needle in ln and "- [ ]" in ln:
            lines[i] = ln.replace("- [ ]", "- [x]", 1)
            if not dry_run:
                plan_file.write_text("\n".join(lines) + "\n")
            return True
    return False


def complete_story(
    sprint_path: Path,
    story_id: str,
    *,
    project_root: Path | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Mark ``story_id`` done and check its plan checkbox if a plan_ref exists.

    Returns ``{"success", "story_id", "plan_checked"}`` or
    ``{"success": False, "error"}``.
    """
    res = update_story(sprint_path, story_id, status="done", dry_run=dry_run)
    if not res.get("success"):
        return res

    data = read_sprint(sprint_path)
    _epic, story, _loc = find_story_in_data(data, story_id)

    plan_checked = False
    if story:
        ref = story.get("plan_ref")
        if isinstance(ref, str) and ref.startswith("plan:"):
            rel = ref[len("plan:"):].split("#", 1)[0]
            root = Path(project_root) if project_root else get_project_root()
            plan_file = root / rel
            if plan_file.exists():
                plan_checked = _check_complete_box(plan_file, story_id, dry_run=dry_run)

    return {"success": True, "story_id": story_id, "plan_checked": plan_checked}


@click.command("complete")
@click.argument("story_id", type=str)
@click.option("--sprint-file", type=click.Path(), default=None,
              help="Path to sprint YAML file")
@click.option("--dry-run", is_flag=True, help="Show what would change")
def story_complete_command(
    story_id: str, sprint_file: str | None, dry_run: bool,
) -> None:
    """Mark a story done and check its plan checkbox (superpowers flow)."""
    sprint_path = (
        Path(sprint_file) if sprint_file
        else get_project_root() / "sprint" / "current-sprint.yaml"
    )
    result = complete_story(sprint_path, story_id, dry_run=dry_run)
    if not result["success"]:
        raise click.ClickException(result["error"])
    box = "plan box checked" if result.get("plan_checked") else "no plan box"
    click.echo(f"Completed {story_id} ({box})")
