"""CLI entry point for pf init command.

Story 126-2: Rewrite pf init in Python.
"""

from __future__ import annotations

from pathlib import Path

import click


@click.command()
@click.option("--dry-run", is_flag=True, help="Show what would be done without doing it")
@click.option("--yes", "-y", is_flag=True, help="Skip confirmation for hook changes")
@click.argument("target", required=False, default=".")
def init(dry_run: bool, yes: bool, target: str) -> None:
    """Initialize a Pennyfarthing project in the current directory.

    Creates .pennyfarthing/ and .claude/ directories, copies pf-*
    commands and skills, writes minimal settings.local.json with
    essential hooks, and updates .gitignore.

    Idempotent — safe to run multiple times. When settings.local.json
    already exists and hooks would change, shows a preview and asks
    for confirmation (use --yes to skip).
    """
    from pf.common.config import get_dist_root
    from pf.init.core import init_project, preview_hook_changes

    target_dir = Path(target).resolve()
    dist_root = get_dist_root(project_root=target_dir)

    if dist_root is None:
        click.echo("Could not locate pennyfarthing-dist. Is pf installed?", err=True)
        raise SystemExit(1)

    if dry_run:
        result = init_project(target_dir=target_dir, dist_root=dist_root, dry_run=True)
        if not result["success"]:
            click.echo(f"Error: {result['error']}", err=True)
            raise SystemExit(1)
        data = result["data"]
        click.echo("Dry run — would perform:")
        click.echo(f"  Create {len(data['directories'])} directories")
        click.echo(f"  Copy {len(data['commands'])} commands: {', '.join(data['commands'])}")
        click.echo(f"  Copy {len(data['skills'])} skills: {', '.join(data['skills'])}")
        content = data.get("content_dirs", [])
        if content:
            click.echo(f"  Copy {len(content)} content dirs: {', '.join(content)}")
        click.echo(f"  Write {data['settings']}")
        click.echo(f"  Update .gitignore ({len(data['gitignore_entries'])} entries)")
        jf = data.get("justfile", {})
        for action in jf.get("actions", []):
            click.echo(f"  {action}")

        # Show hook change preview
        hook_preview = preview_hook_changes(target_dir, dist_root)
        if hook_preview["has_changes"]:
            click.echo()
            _show_hook_preview(hook_preview)
        return

    # --- Hook change confirmation for existing projects ---
    skip_hooks = False
    hook_preview = preview_hook_changes(target_dir, dist_root)
    if hook_preview["has_changes"] and not hook_preview["is_new"]:
        click.echo()
        click.secho("Hook changes detected:", fg="yellow", bold=True)
        _show_hook_preview(hook_preview)
        click.echo()
        if not yes:
            if not click.confirm("Apply hook changes to settings.local.json?"):
                click.echo("Skipping hook changes (other files will still be updated)")
                skip_hooks = True

    result = init_project(
        target_dir=target_dir,
        dist_root=dist_root,
        skip_hooks=skip_hooks,
    )

    if not result["success"]:
        click.echo(f"Error: {result['error']}", err=True)
        raise SystemExit(1)

    data = result["data"]
    click.echo(f"Initialized Pennyfarthing project in {target_dir}")
    if data.get("dogfooding"):
        symlinks_fixed = data.get("symlinks_fixed", 0)
        if symlinks_fixed:
            click.echo(f"  dogfooding mode: {symlinks_fixed} symlinks created/repaired")
        else:
            click.echo("  dogfooding mode: all symlinks intact")
    else:
        click.echo(f"  {data['commands_copied']} commands copied")
        click.echo(f"  {data['skills_copied']} skills copied")
        content_count = data.get("content_dirs_copied", 0)
        if content_count:
            click.echo(f"  {content_count} content directories copied")
    click.echo(f"  {data['directories_created']} directories created")
    if data.get("settings_written"):
        click.echo("  settings.local.json written")
    elif skip_hooks:
        click.echo("  settings.local.json hooks unchanged (user declined)")
    elif data.get("hooks_upgraded"):
        click.echo("  settings.local.json upgraded (hooks updated)")
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
    if not data.get("dogfooding"):
        click.echo()
        click.echo("Next steps:")
        click.echo("  1. Start Claude Code in this directory")
        click.echo("  2. Run /pf-setup for interactive configuration")
        click.echo("  3. Run pf theme set <name> to pick a persona theme")


def _show_hook_preview(preview: dict) -> None:
    """Display hook change preview."""
    if preview["is_new"]:
        click.echo(f"  New install: {len(preview['added'])} hooks will be configured")
        return
    if preview["added"]:
        click.echo(f"  Adding {len(preview['added'])} hook(s):")
        for cmd in preview["added"]:
            # Show just the meaningful part of the command
            short = cmd.split("pf hooks ")[-1] if "pf hooks" in cmd else cmd
            click.secho(f"    + {short}", fg="green")
    if preview["removed"]:
        click.echo(f"  Removing {len(preview['removed'])} hook(s):")
        for cmd in preview["removed"]:
            short = cmd.split("pf hooks ")[-1] if "pf hooks" in cmd else cmd
            click.secho(f"    - {short}", fg="red")
    if preview["upgraded"]:
        click.echo(f"  Upgrading {len(preview['upgraded'])} hook(s):")
        for cmd in preview["upgraded"]:
            short = cmd.split("pf hooks ")[-1] if "pf hooks" in cmd else cmd
            click.secho(f"    ~ {short}", fg="yellow")
