"""
Docs CLI group — documentation management commands.

Usage:
    pf docs sync-skills              # Regenerate all skill usage.md files
    pf docs sync-skills --dry-run    # Preview changes without writing
    pf docs sync-skills --skill pf-theme  # Single skill only
"""

import click


@click.group()
def docs():
    """Documentation management commands."""
    pass


@docs.command("sync-skills")
@click.option("--dry-run", is_flag=True, help="Preview changes without writing files")
@click.option("--skill", "skill_name", default=None, help="Sync a single skill by name (e.g. pf-theme)")
def sync_skills(dry_run: bool, skill_name: str | None):
    """Regenerate usage.md files from live CLI --help output.

    Introspects skills that have a command_group field in the skill registry,
    runs their CLI help, and generates markdown documentation.
    """
    from pf.docs.sync_skills import run_sync_skills

    result = run_sync_skills(dry_run=dry_run, skill_filter=skill_name)

    if not result["success"]:
        click.echo(f"Error: {result['error']}", err=True)
        raise SystemExit(1)

    data = result["data"]

    if dry_run:
        click.echo("Dry run — no files written.\n")

    for entry in data["skills"]:
        status = entry["status"]
        name = entry["skill"]
        if status == "written":
            click.echo(f"  {name}: wrote {entry['path']}")
        elif status == "dry_run":
            click.echo(f"  {name}: would write {entry['path']} ({entry['commands']} commands)")
        elif status == "skipped":
            click.echo(f"  {name}: skipped — {entry['reason']}")

    click.echo(f"\n{data['summary']}")
