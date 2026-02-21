"""Release CLI - Click-based CLI for release management operations.

Usage:
    pf release [COMMAND] [ARGS]...

Commands:
    deprecate    Mark a published version as deprecated
"""

from __future__ import annotations

import click


@click.group()
def release():
    """Release management operations.

    \b
    Commands:
      deprecate  - Mark a published version as deprecated
    """
    pass


@release.command()
@click.option("--version", required=True, help="Semver version to deprecate (e.g., 11.3.7)")
@click.option("--reason", required=True, help="Reason for deprecation")
@click.option("--dry-run", is_flag=True, help="Preview actions without executing")
@click.option("--package", default="pennyfarthing", help="Package name (default: pennyfarthing)")
def deprecate(version: str, reason: str, dry_run: bool, package: str):
    """Mark a published npm version as deprecated.

    Deprecates the version in the npm registry, appends a deprecation
    entry to CHANGELOG.md, and creates a git note on the version tag.

    \b
    Examples:
      pf release deprecate --version=11.3.7 --reason="workspace:* leak"
      pf release deprecate --version=11.3.7 --reason="broken deps" --dry-run
    """
    import json

    from pf.common.config import get_project_root
    from pf.release.deprecate import deprecate_version

    root = get_project_root()
    result = deprecate_version(
        root,
        version,
        reason,
        dry_run=dry_run,
        package_name=package,
    )

    if result.get("dry_run"):
        click.echo("DRY RUN — no changes made")
        for step in result.get("steps", []):
            click.echo(f"  [{step['action']}] {step.get('detail', '')}")
        return

    if result["success"]:
        click.echo(f"Deprecated {package}@{version}: {reason}")
        for step in result.get("steps", []):
            status = "ok" if step.get("success", True) else "FAIL"
            click.echo(f"  [{status}] {step['action']}: {step.get('detail', '')}")
    else:
        click.echo(f"Error: {result['error']}", err=True)
        raise SystemExit(1)
