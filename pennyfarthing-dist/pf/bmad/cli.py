"""
CLI commands for BMAD adapter.

Provides:
    pf bmad import <path>              — Initial import from BMAD project
    pf bmad sync --pull [--dry-run]    — Pull BMAD changes into PF YAML
    pf bmad sync --push [--dry-run]    — Push PF changes to BMAD markdown
    pf bmad sync --both [--dry-run]    — Bidirectional sync
    pf bmad status                     — Drift report
"""

from __future__ import annotations

from pathlib import Path

import click


@click.group()
def bmad():
    """BMAD adapter — bidirectional sprint sync."""
    pass


# =============================================================================
# pf bmad import
# =============================================================================


@bmad.command("import")
@click.argument("bmad_path", type=click.Path(exists=True))
@click.option("--repos", default="axiathon", help="Default repos value for stories")
@click.option("--dry-run", is_flag=True, help="Preview without writing")
def bmad_import(bmad_path: str, repos: str, dry_run: bool):
    """Import a BMAD project into PF sprint YAML.

    BMAD_PATH is the path to the _bmad-output/ directory.
    """
    from pf.bmad.importer import import_bmad_project
    from pf.common.config import get_project_root

    root = get_project_root()
    sprint_dir = root / "sprint"
    source = Path(bmad_path).resolve()

    result = import_bmad_project(
        bmad_root=source,
        sprint_dir=sprint_dir,
        repos=repos,
        dry_run=dry_run,
        project_root=root,
    )

    if result.get("success"):
        prefix = "[DRY-RUN] " if result.get("dry_run") else ""
        click.echo(f"{prefix}{result['message']}")
        click.echo(f"  Epics:   {result['epics_count']}")
        click.echo(f"  Stories: {result['stories_count']}")
        click.echo(f"  Points:  {result['total_points']}")
        if result.get("epic_ids"):
            click.echo(f"  Epic IDs: {', '.join(result['epic_ids'])}")
    else:
        click.echo(f"Failed: {result.get('error')}", err=True)
        raise SystemExit(1)


# =============================================================================
# pf bmad sync
# =============================================================================


@bmad.command()
@click.option("--pull", "direction", flag_value="pull", help="Pull BMAD changes into PF")
@click.option("--push", "direction", flag_value="push", help="Push PF changes to BMAD")
@click.option("--both", "direction", flag_value="both", help="Bidirectional sync")
@click.option("--dry-run", is_flag=True, help="Preview without applying")
@click.option("--pf-wins", is_flag=True, default=True, help="PF status wins on conflict (default)")
@click.option("--bmad-wins", is_flag=True, help="BMAD status wins on conflict")
@click.option("--import-new", is_flag=True, help="Import new BMAD stories not in PF")
def sync(
    direction: str | None,
    dry_run: bool,
    pf_wins: bool,
    bmad_wins: bool,
    import_new: bool,
):
    """Sync status between PF YAML and BMAD markdown."""
    if not direction:
        click.echo("Specify --pull, --push, or --both", err=True)
        raise SystemExit(1)

    from pf.bmad.parser import discover_bmad_stories
    from pf.bmad.sync import (
        _collect_pf_stories,
        execute_sync_plan,
        format_sync_plan,
        generate_sync_plan,
    )
    from pf.common.config import get_project_root, load_pennyfarthing_config

    root = get_project_root()
    config = load_pennyfarthing_config(root)
    bmad_config = config.get("bmad", {})

    source_root_str = bmad_config.get("source_root")
    if not source_root_str:
        click.echo(
            "No bmad.source_root configured in .pennyfarthing/config.local.yaml",
            err=True,
        )
        raise SystemExit(1)

    bmad_root = (root / source_root_str).resolve()
    if not bmad_root.is_dir():
        click.echo(f"BMAD source root not found: {bmad_root}", err=True)
        raise SystemExit(1)

    sprint_path = root / "sprint" / "current-sprint.yaml"
    if not sprint_path.exists():
        click.echo(f"Sprint file not found: {sprint_path}", err=True)
        click.echo("Run 'pf bmad import' first.", err=True)
        raise SystemExit(1)

    story_subdir = bmad_config.get("story_dir", "implementation-artifacts")
    wins_pf = not bmad_wins

    pf_stories = _collect_pf_stories(sprint_path)
    bmad_stories = discover_bmad_stories(bmad_root, story_dir=story_subdir)

    plan = generate_sync_plan(
        pf_stories,
        bmad_stories,
        direction=direction,
        pf_wins=wins_pf,
    )

    click.echo(format_sync_plan(plan))

    if not plan.changes and not (import_new and plan.bmad_only):
        return

    result = execute_sync_plan(
        plan,
        dry_run=dry_run,
        sprint_path=sprint_path,
        bmad_root=bmad_root,
        import_new=import_new,
    )

    if dry_run:
        click.echo(f"\n[DRY-RUN] {result.changes_planned} changes would be applied")
        if import_new and plan.bmad_only:
            click.echo(f"[DRY-RUN] {len(plan.bmad_only)} new stories would be imported")
        return

    click.echo(f"\nApplied {result.changes_applied}/{result.changes_planned} changes")
    if result.new_stories_imported:
        click.echo(f"Imported {result.new_stories_imported} new stories")
    if result.errors:
        for err in result.errors:
            click.echo(f"  Error: {err}", err=True)
        raise SystemExit(1)


# =============================================================================
# pf bmad status
# =============================================================================


@bmad.command()
def status():
    """Show drift report — what's out of sync between PF and BMAD."""
    from pf.bmad.sync import drift_report
    from pf.common.config import get_project_root, load_pennyfarthing_config

    root = get_project_root()
    config = load_pennyfarthing_config(root)
    bmad_config = config.get("bmad", {})

    source_root_str = bmad_config.get("source_root")
    if not source_root_str:
        click.echo(
            "No bmad.source_root configured in .pennyfarthing/config.local.yaml",
            err=True,
        )
        raise SystemExit(1)

    bmad_root = (root / source_root_str).resolve()
    sprint_path = root / "sprint" / "current-sprint.yaml"

    if not sprint_path.exists():
        click.echo("No sprint file found. Run 'pf bmad import' first.", err=True)
        raise SystemExit(1)

    report = drift_report(sprint_path, bmad_root)
    click.echo(report)
