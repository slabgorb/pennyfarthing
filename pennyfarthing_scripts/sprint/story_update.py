"""Sprint story update command.

Story: MSSCI-14257 - Sprint story update command

This module provides:
- update_story(sprint_path, story_id, ...) -> dict
- story_update_command (Click command for CLI registration)

STUB: Not yet implemented. Tests should fail on assertions.
"""

from datetime import date
from pathlib import Path
from typing import Any

import click


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
    dry_run: bool = False,
) -> dict[str, Any]:
    """Update fields on a story in the sprint YAML.

    STUB: Not yet implemented.
    """
    raise NotImplementedError("update_story not implemented")


@click.command("update")
@click.argument("story_id")
@click.option("--status", type=click.Choice(["backlog", "ready", "in_progress", "done", "canceled"]))
@click.option("--completed", "completed_date", default=None)
@click.option("--assigned-to", default=None)
@click.option("--points", type=int, default=None)
@click.option("--priority", default=None)
@click.option("--started", "started_date", default=None)
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
    dry_run: bool,
    sprint_file: str | None,
) -> None:
    """Update a story's fields by ID."""
    raise NotImplementedError("story_update_command not implemented")
