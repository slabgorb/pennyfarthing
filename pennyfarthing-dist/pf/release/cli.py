"""Release CLI - Click-based CLI for release management operations.

Usage:
    pf release [COMMAND] [ARGS]...

Commands:
    deprecate    Mark a published version as deprecated
    dry-run      Simulate release pipeline without executing
"""

from __future__ import annotations

import click


@click.group()
def release():
    """Release management operations.

    \b
    Commands:
      deprecate  - Mark a published version as deprecated
      dry-run    - Simulate release pipeline without executing
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


@release.command("dry-run")
@click.option("--version", default=None, help="Explicit target version (overrides --bump)")
@click.option(
    "--bump",
    type=click.Choice(["major", "minor", "patch"], case_sensitive=False),
    default=None,
    help="Bump type to simulate (default: patch)",
)
def dry_run(version: str | None, bump: str | None):
    """Simulate the release pipeline without executing.

    Runs through version bump, changelog, build, and pack steps
    without committing, tagging, or publishing. Shows exactly what
    would happen during a real release.

    \b
    Examples:
      pf release dry-run --bump=patch
      pf release dry-run --bump=minor
      pf release dry-run --version=12.0.0
      pf release dry-run  # defaults to current version
    """
    from pf.common.config import get_project_root
    from pf.release.dry_run import dry_run_release

    root = get_project_root()
    result = dry_run_release(root, version=version, bump=bump)

    if result["success"]:
        data = result.get("data", {})
        click.echo("DRY RUN — Release Pipeline Simulation")
        click.echo(f"  Current: {data.get('current_version', '?')}")
        click.echo(f"  Target:  {data.get('target_version', '?')}")
        click.echo("")
        click.echo("Steps:")
        for step in result.get("steps", []):
            status = "ok" if step.get("success", True) else "FAIL"
            click.echo(f"  [{status}] {step['action']}: {step.get('detail', '')}")
    else:
        click.echo(f"Error: {result['error']}", err=True)
        raise SystemExit(1)
