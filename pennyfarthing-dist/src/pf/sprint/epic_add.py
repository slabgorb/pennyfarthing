"""Sprint epic add command.

Adds a new epic to the current sprint, creating a shard file
and updating the index.

Provides:
- add_epic(sprint_path, epic_id, title, ...) -> dict
- epic_add_command (Click command for CLI registration)
"""

from pathlib import Path
from typing import Any

import click
from ruamel.yaml.comments import CommentedMap, CommentedSeq

from pf.sprint import validator as _shard_validator
from pf.sprint.yaml_io import (
    EPIC_KEY_ORDER,
    _get_epic_ref,
    _read_yaml_file,
    _write_yaml_file,
)


def add_epic(
    sprint_path: Path,
    epic_id: str,
    title: str,
    *,
    priority: str = "P1",
    status: str = "backlog",
    repos: str = "pennyfarthing",
    jira: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    """Add a new epic to the current sprint.

    Creates a shard file for the epic and adds its reference to the index.

    Args:
        sprint_path: Path to sprint index YAML file
        epic_id: Epic ID (e.g., "epic-85" or "MSSCI-14400")
        title: Epic title
        priority: Priority (default: P1)
        status: Initial status (default: backlog)
        repos: Repository scope (default: pennyfarthing)
        jira: Optional Jira epic key
        description: Optional epic description

    Returns:
        Dict with success status and epic_id or error
    """
    sprint_dir = sprint_path.parent

    # Build epic as CommentedMap with canonical key ordering
    epic = CommentedMap()
    fields: dict[str, Any] = {
        "id": epic_id,
        "type": "epic",
        "title": title,
        "priority": priority,
        "status": status,
        "repos": repos,
        "stories": CommentedSeq(),
    }
    if description is not None:
        fields["description"] = description
    if jira is not None:
        fields["jira"] = jira

    # Insert keys in EPIC_KEY_ORDER, then any extras
    for key in EPIC_KEY_ORDER:
        if key in fields:
            epic[key] = fields[key]
    for key in fields:
        if key not in EPIC_KEY_ORDER:
            epic[key] = fields[key]

    # Validate epic shard before writing
    validation = _shard_validator.validate_epic_shard(dict(epic))
    if not validation.valid:
        error_msgs = "; ".join(e.message for e in validation.errors)
        return {"success": False, "error": f"Epic validation failed: {error_msgs}"}

    # Determine the shard reference
    ref = _get_epic_ref(epic)
    shard_file = sprint_dir / f"epic-{ref}.yaml"

    if shard_file.exists():
        return {
            "success": False,
            "error": f"Epic shard file already exists: {shard_file.name}",
        }

    # Read current index
    data = _read_yaml_file(sprint_path)
    epics = data.get("epics", [])

    # Check for duplicate refs
    for existing in epics:
        existing_str = str(existing) if isinstance(existing, str) else str(existing.get("id", ""))
        if existing_str == ref or existing_str == epic_id:
            return {
                "success": False,
                "error": f"Epic '{epic_id}' already exists in the sprint",
            }

    # Detect format: sharded (string refs) or monolithic (full dicts)
    is_sharded = bool(epics) and isinstance(epics[0], str)

    if is_sharded or not epics:
        # Sharded format: write shard file and add string ref to index
        _write_yaml_file(shard_file, epic)

        if not isinstance(epics, CommentedSeq):
            epics = CommentedSeq(epics)
        epics.append(ref)
        data["epics"] = epics
        _write_yaml_file(sprint_path, data)
    else:
        # Monolithic format: add full epic dict to index
        if not isinstance(epics, CommentedSeq):
            epics = CommentedSeq(epics)
        epics.append(epic)
        data["epics"] = epics
        _write_yaml_file(sprint_path, data)

    return {
        "success": True,
        "epic_id": epic_id,
        "ref": ref,
        "shard_file": shard_file.name if is_sharded or not epics else None,
    }


@click.command("epic-add")
@click.argument("epic_id", type=str)
@click.argument("title", type=str)
@click.option(
    "--priority", type=click.Choice(["p0", "p1", "p2", "p3"], case_sensitive=False), default="p1"
)
@click.option("--status", type=click.Choice(["backlog", "ready", "in_progress"]), default="backlog")
@click.option("--repos", default="pennyfarthing")
@click.option("--jira", "jira_id", type=str, default=None, help="Jira epic key (MSSCI-NNNNN)")
@click.option("--description", "-d", type=str, default=None, help="Epic description")
@click.option("--sprint-file", type=click.Path(), default=None, help="Path to sprint YAML file")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def epic_add_command(
    epic_id: str,
    title: str,
    priority: str,
    status: str,
    repos: str,
    jira_id: str | None,
    description: str | None,
    sprint_file: str | None,
    dry_run: bool,
) -> None:
    """Add a new epic to the current sprint."""
    if dry_run:
        click.echo(f"[DRY-RUN] Would add epic {epic_id}: {title}")
        return

    if sprint_file is None:
        from pf.common.config import get_project_root

        path = get_project_root() / "sprint" / "current-sprint.yaml"
    else:
        path = Path(sprint_file)

    result = add_epic(
        sprint_path=path,
        epic_id=epic_id,
        title=title,
        priority=priority,
        status=status,
        repos=repos,
        jira=jira_id,
        description=description,
    )

    if result["success"]:
        msg = f"Added epic {result['epic_id']}: {title}"
        if result.get("shard_file"):
            msg += f" ({result['shard_file']})"
        click.echo(msg)
    else:
        raise click.ClickException(result["error"])
