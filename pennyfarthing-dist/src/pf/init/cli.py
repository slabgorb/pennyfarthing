"""CLI entry point for pf init command.

Story 126-2: Rewrite pf init in Python.
"""

from __future__ import annotations

from pathlib import Path

import click


@click.command()
@click.option("--dry-run", is_flag=True, help="Show what would be done without doing it")
@click.argument("target", required=False, default=".")
def init(dry_run: bool, target: str) -> None:
    """Initialize a Pennyfarthing project in the current directory.

    Creates .pennyfarthing/ and .claude/ directories, copies pf-*
    commands and skills, writes minimal settings.local.json with
    essential hooks, and updates .gitignore.

    Idempotent — safe to run multiple times.
    """
    from pf.common.config import get_dist_root
    from pf.init.core import init_project

    target_dir = Path(target).resolve()
    dist_root = get_dist_root()

    if dist_root is None:
        click.echo("Could not locate pennyfarthing-dist. Is pf installed?", err=True)
        raise SystemExit(1)

    result = init_project(target_dir=target_dir, dist_root=dist_root, dry_run=dry_run)

    if not result["success"]:
        click.echo(f"Error: {result['error']}", err=True)
        raise SystemExit(1)

    if dry_run:
        data = result["data"]
        click.echo("Dry run — would perform:")
        click.echo(f"  Create {len(data['directories'])} directories")
        click.echo(f"  Copy {len(data['commands'])} commands: {', '.join(data['commands'])}")
        click.echo(f"  Copy {len(data['skills'])} skills: {', '.join(data['skills'])}")
        click.echo(f"  Write {data['settings']}")
        click.echo(f"  Update .gitignore ({len(data['gitignore_entries'])} entries)")
        jf = data.get("justfile", {})
        for action in jf.get("actions", []):
            click.echo(f"  {action}")
    else:
        data = result["data"]
        click.echo(f"Initialized Pennyfarthing project in {target_dir}")
        click.echo(f"  {data['commands_copied']} commands copied")
        click.echo(f"  {data['skills_copied']} skills copied")
        click.echo(f"  {data['directories_created']} directories created")
        if data.get("settings_written"):
            click.echo("  settings.local.json written")
        elif data.get("hooks_upgraded"):
            click.echo("  settings.local.json upgraded (deprecated hooks removed)")
        else:
            click.echo("  settings.local.json already exists (kept)")
        jf = data.get("justfile", {})
        if jf.get("justfile_created"):
            click.echo("  justfile created with framework import")
        elif jf.get("import_added"):
            migrated = jf.get("recipes_migrated", [])
            if migrated:
                click.echo(
                    f"  justfile updated (import added, {len(migrated)} legacy recipes migrated)"
                )
            else:
                click.echo("  justfile updated (import added)")
        if jf.get("justfile_pf_written"):
            click.echo("  .pennyfarthing/justfile.pf updated (framework recipes)")
        click.echo()
        click.echo("Next steps:")
        click.echo("  1. Start Claude Code in this directory")
        click.echo("  2. Run /pf-setup for interactive configuration")
        click.echo("  3. Run pf theme set <name> to pick a persona theme")
