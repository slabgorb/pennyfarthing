"""CLI entry point for pf upgrade command.

Story 126-7: pf upgrade — detect npm-based install, migrate to Python-based.
"""

from __future__ import annotations

import click


@click.command()
@click.option("--dry-run", is_flag=True, help="Show migration plan without executing")
@click.argument("target", required=False, default=".")
def upgrade(dry_run: bool, target: str):
    """Upgrade from npm-based to Python-based Pennyfarthing installation.

    Detects npm-based installations, migrates directory structure,
    preserves custom hooks, migrates settings, and generates a report.

    \b
    Arguments:
      TARGET  - Project directory to upgrade (default: current directory)
    """
    from pathlib import Path

    from pf.upgrade.core import run_upgrade

    target_path = Path(target).resolve()
    result = run_upgrade(target_path, dry_run=dry_run)

    if not result["success"]:
        click.echo(f"Upgrade failed: {result.get('error', 'unknown error')}", err=True)
        raise SystemExit(1)

    click.echo(result.get("report", "Upgrade complete."))
