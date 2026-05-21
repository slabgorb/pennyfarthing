"""CLI entry point for pf upgrade command.

Story 126-7: pf upgrade — detect npm-based install, migrate to Python-based.
Story 126-14: pf upgrade cleanup — remove npm artifacts and stale symlinks.
"""

from __future__ import annotations

import click


@click.command()
@click.option("--dry-run", is_flag=True, help="Show migration plan without executing")
@click.option("--clean", is_flag=True, help="Remove npm-era artifacts after migration")
@click.option("--yes", "-y", is_flag=True, help="Skip confirmation prompts (for CI)")
@click.argument("target", required=False, default=".")
def upgrade(dry_run: bool, clean: bool, yes: bool, target: str):
    """Upgrade from npm-based to Python-based Pennyfarthing installation.

    Detects npm-based installations, migrates directory structure,
    preserves custom hooks, migrates settings, and generates a report.

    Use --clean to remove npm-era artifacts (node_modules/@pennyfarthing,
    stale symlinks, old manifest.json). Use --dry-run --clean to preview
    what would be removed.

    \b
    Arguments:
      TARGET  - Project directory to upgrade (default: current directory)
    """
    from pathlib import Path

    from pf.upgrade.core import detect_cleanup_targets, run_upgrade

    target_path = Path(target).resolve()

    # If --clean without --yes and not --dry-run, confirm with user
    if clean and not yes and not dry_run:
        detection = detect_cleanup_targets(target_path)
        targets = detection.get("targets", [])
        if targets:
            click.echo("The following artifacts will be removed:")
            for t in targets:
                click.echo(f"  - {t['path']} ({t['reason']})")
            if not click.confirm("\nProceed with cleanup?"):
                click.echo("Cleanup cancelled.")
                return
        else:
            click.echo("No artifacts to clean up.")
            return

    result = run_upgrade(target_path, dry_run=dry_run, clean=clean)

    if not result["success"]:
        click.echo(f"Upgrade failed: {result.get('error', 'unknown error')}", err=True)
        raise SystemExit(1)

    click.echo(result.get("report", "Upgrade complete."))
