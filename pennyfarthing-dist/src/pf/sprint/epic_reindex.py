"""Sprint epic reindex command.

Adopts orphaned shard files into the sprint index.

Provides:
- reindex_epic(sprint_path, shard_ref, ...) -> dict
- epic_reindex_command (Click command for CLI registration)
"""

from pathlib import Path
from typing import Any

import click

from pf.sprint.shard_merge import safe_ref_path
from pf.sprint.yaml_io import _read_yaml_file, read_sprint, write_sprint


def reindex_epic(
    sprint_path: Path,
    shard_ref: str,
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Adopt an orphaned shard file into the sprint index.

    Verifies the shard file exists on disk, loads and validates its
    content, checks it isn't already indexed, and appends the ref
    to the sprint index epics list.

    Args:
        sprint_path: Path to sprint YAML index file
        shard_ref: Shard reference (e.g., "129", "PROJ-15680")
        dry_run: If True, preview without writing

    Returns:
        Dict with success status and shard details
    """
    sprint_dir = sprint_path.parent
    # Guarded: shard_ref is a raw CLI argument, and on the non-dry-run path the
    # ref is appended to the sprint index — so an unguarded traversal ref both
    # read out of bounds and *persisted* the escape (CWE-22, 162-44).
    try:
        shard_file = safe_ref_path(sprint_dir, shard_ref)
    except ValueError as e:
        return {"success": False, "error": str(e)}

    if not shard_file.exists():
        return {
            "success": False,
            "error": f"Shard file not found: {shard_file.name}",
        }

    # Load and validate shard content
    try:
        shard_data = _read_yaml_file(shard_file)
    except (FileNotFoundError, ValueError) as e:
        return {
            "success": False,
            "error": f"Failed to load shard: {e}",
        }

    epic_id = shard_data.get("id")
    epic_title = shard_data.get("title", "(untitled)")

    # Check if already indexed
    data = read_sprint(sprint_path)
    existing_refs: set[str] = set()
    for epic in data.get("epics", []):
        if isinstance(epic, dict):
            existing_refs.add(str(epic.get("id", "")))
            jira = epic.get("jira")
            if jira:
                existing_refs.add(str(jira))

    if str(epic_id) in existing_refs or shard_ref in existing_refs:
        return {
            "success": False,
            "error": f"Epic '{shard_ref}' is already indexed (id={epic_id})",
        }

    details = {
        "shard_ref": shard_ref,
        "shard_file": shard_file.name,
        "epic_id": str(epic_id),
        "title": epic_title,
    }

    if dry_run:
        return {"success": True, "dry_run": True, "details": details}

    # Re-read raw index to append string ref (sharded format)
    from ruamel.yaml import YAML

    yml = YAML()
    yml.preserve_quotes = True
    with open(sprint_path) as f:
        index_data = yml.load(f)

    epics_list = index_data.get("epics", [])
    if isinstance(epics_list, list) and epics_list and isinstance(epics_list[0], str):
        # Sharded format: append ref string
        epics_list.append(shard_ref)
        from pf.sprint.yaml_io import _write_yaml_file

        _write_yaml_file(sprint_path, index_data)
    else:
        # Monolithic format: append full epic data
        data["epics"].append(shard_data)
        write_sprint(sprint_path, data)

    return {"success": True, "details": details}


@click.command("reindex")
@click.argument("shard_ref")
@click.option("--dry-run", is_flag=True, help="Preview adoption without writing")
@click.option("--sprint-file", type=click.Path(), default=None, help="Path to sprint YAML file")
def epic_reindex_command(
    shard_ref: str,
    dry_run: bool,
    sprint_file: str | None,
) -> None:
    """Adopt an orphaned shard file into the sprint index.

    \b
    Arguments:
      SHARD_REF  - Shard reference (e.g., 129, PROJ-15680)

    \b
    Examples:
      pf sprint epic reindex 129 --dry-run
      pf epic reindex PROJ-15680
    """
    if sprint_file is None:
        from pf.common.config import get_project_root

        path = get_project_root() / "sprint" / "current-sprint.yaml"
    else:
        path = Path(sprint_file)

    result = reindex_epic(sprint_path=path, shard_ref=shard_ref, dry_run=dry_run)

    if result["success"]:
        details = result.get("details", {})
        if result.get("dry_run"):
            click.echo(f"[DRY-RUN] Would adopt shard {details.get('shard_file')} into index:")
            click.echo(f"  epic_id: {details.get('epic_id')}")
            click.echo(f"  title: {details.get('title')}")
        else:
            click.echo(f"Adopted shard {details.get('shard_file')} into index:")
            click.echo(f"  epic_id: {details.get('epic_id')}")
            click.echo(f"  title: {details.get('title')}")
    else:
        raise click.ClickException(result["error"])
