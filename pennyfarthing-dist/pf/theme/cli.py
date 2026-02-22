"""
CLI commands for theme management.

Usage:
    pf theme list
    pf theme show [NAME] [--full]
    pf theme set <NAME>
    pf theme create <NAME> [--base <THEME>] [--user]
"""

from __future__ import annotations

import re
from pathlib import Path

import click


@click.group()
def theme():
    """Persona theme management.

    \b
    Commands:
      list    - Show all available themes
      show    - Show theme details
      set     - Set the active theme
      create  - Create a new custom theme
    """
    pass


@theme.command("list")
def list_cmd():
    """Show all available themes with current theme highlighted."""
    from pf.common.themes import format_theme_list

    click.echo(format_theme_list())


@theme.command("show")
@click.argument("name", required=False)
@click.option("--full", is_flag=True, help="Show full agent details (OCEAN, quirks, catchphrases, etc.)")
def show(name: str | None, full: bool):
    """Show theme details including agent character mappings.

    \b
    Arguments:
      NAME  - Theme to show (defaults to current theme)
    """
    import yaml

    from pf.common.themes import (
        get_current_theme,
        list_themes,
        resolve_theme_path,
    )

    theme_name = name
    if not theme_name:
        theme_name = get_current_theme()
        if not theme_name:
            click.echo("No theme currently set.")
            click.echo("Use 'pf theme set <name>' to select a theme.")
            return

    theme_path = resolve_theme_path(theme_name)
    if not theme_path:
        available = ", ".join(list_themes()[:10])
        raise click.ClickException(f"Theme '{theme_name}' not found.\nAvailable: {available}...")

    data = yaml.safe_load(theme_path.read_text())
    if not data:
        raise click.ClickException(f"Invalid theme file: {theme_path}")

    theme_meta = data.get("theme", {})
    agents = data.get("agents", {})

    # Header
    click.echo(f"Theme: {theme_name}")
    if theme_meta.get("description"):
        click.echo(f"Description: {theme_meta['description']}")
    if theme_meta.get("tier"):
        click.echo(f"Tier: {theme_meta['tier']}")
    click.echo()

    # Agents
    click.echo("Agents:")
    agent_order = [
        "sm", "tea", "dev", "reviewer", "orchestrator",
        "pm", "architect", "devops", "tech-writer", "ux-designer",
    ]

    displayed: set[str] = set()
    for agent_name in agent_order:
        agent = agents.get(agent_name)
        if agent and agent.get("character"):
            _display_agent(agent_name, agent, full)
            displayed.add(agent_name)

    for agent_name, agent in agents.items():
        if agent_name not in displayed and isinstance(agent, dict) and agent.get("character"):
            _display_agent(agent_name, agent, full)


def _display_agent(name: str, agent: dict, full: bool) -> None:
    """Display a single agent's info."""
    click.echo(f"  {name}:")
    click.echo(f"    Character: {agent['character']}")
    if agent.get("style"):
        click.echo(f"    Style: {agent['style']}")

    if not full:
        return

    if agent.get("ocean"):
        ocean = agent["ocean"]
        click.echo(
            f"    OCEAN: O={ocean.get('O', '?')} C={ocean.get('C', '?')} "
            f"E={ocean.get('E', '?')} A={ocean.get('A', '?')} N={ocean.get('N', '?')}"
        )
    if agent.get("trait"):
        click.echo(f"    Trait: {agent['trait']}")
    if agent.get("expertise"):
        click.echo(f"    Expertise: {agent['expertise']}")
    if agent.get("role"):
        click.echo(f"    Role: {agent['role']}")
    if agent.get("quirks"):
        click.echo("    Quirks:")
        for q in agent["quirks"]:
            click.echo(f"      - {q}")
    if agent.get("catchphrases"):
        click.echo("    Catchphrases:")
        for c in agent["catchphrases"]:
            click.echo(f"      - {c}")
    if agent.get("emoji"):
        click.echo(f"    Emoji: {agent['emoji']}")
    if agent.get("helper"):
        helper = agent["helper"]
        hname = helper.get("name", "?")
        hstyle = helper.get("style", "?")
        click.echo(f"    Helper: {hname} ({hstyle})")


def _check_portrait_lfs(theme_name: str, project_root: Path) -> None:
    """Pull LFS portrait stubs for a theme if any are detected."""
    import subprocess

    from pf.bikerack.portrait_resolver import _is_lfs_pointer
    from pf.common.themes import discover_all_theme_dirs

    theme_dirs = discover_all_theme_dirs(project_root)

    # Find portrait directories for this theme (sibling portraits/ of each themes/ dir)
    lfs_files: list[Path] = []
    for themes_dir in theme_dirs:
        portraits_dir = themes_dir.parent / "portraits" / theme_name
        if not portraits_dir.is_dir():
            continue
        for f in portraits_dir.rglob("*"):
            if f.is_file() and f.suffix in (".png", ".jpg") and _is_lfs_pointer(f):
                lfs_files.append(f)

    if not lfs_files:
        return

    # Determine the git repo root containing the portraits
    # Walk up from the first LFS file to find .git
    repo_root = lfs_files[0].parent
    while repo_root != repo_root.parent:
        if (repo_root / ".git").exists():
            break
        repo_root = repo_root.parent
    else:
        return

    # Build the include path relative to the repo root
    # Find the common portrait base dir for this theme
    for themes_dir in theme_dirs:
        base = themes_dir.parent / "portraits" / theme_name
        if base.is_dir():
            try:
                include_path = str(base.relative_to(repo_root)) + "/**"
                break
            except ValueError:
                continue
    else:
        return

    try:
        result = subprocess.run(
            ["git", "lfs", "pull", f"--include={include_path}"],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            click.echo(f"Pulled {len(lfs_files)} portrait images for {theme_name}.")
        else:
            click.echo(f"Warning: git lfs pull failed: {result.stderr.strip()}", err=True)
    except FileNotFoundError:
        click.echo("Warning: git-lfs not installed, portrait images may be missing.", err=True)
    except subprocess.TimeoutExpired:
        click.echo("Warning: git lfs pull timed out.", err=True)


@theme.command("set")
@click.argument("name")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def set_theme(name: str, dry_run: bool):
    """Set the active persona theme.

    \b
    Arguments:
      NAME  - Theme name to activate
    """
    import yaml

    from pf.common.config import get_project_root
    from pf.common.themes import (
        list_themes,
        resolve_theme_path,
    )

    theme_path = resolve_theme_path(name)
    if not theme_path:
        available = ", ".join(list_themes()[:10])
        raise click.ClickException(f"Theme '{name}' not found.\nAvailable: {available}...")

    theme_data = yaml.safe_load(theme_path.read_text())
    theme_meta = theme_data.get("theme", {})
    agents = theme_data.get("agents", {})

    if dry_run:
        click.echo(f"[DRY-RUN] Would set theme to '{name}'")
        samples = []
        for key in ["sm", "tea", "dev"]:
            agent = agents.get(key)
            if agent and agent.get("character"):
                samples.append(f"{key.upper()}: {agent['character']}")
        if samples:
            click.echo(f"  {' | '.join(samples)}")
        return

    # Build theme_characters map (matches Node.js setTheme behavior)
    theme_characters: dict[str, str] = {}
    for agent_id, agent_info in agents.items():
        if isinstance(agent_info, dict) and agent_info.get("character"):
            theme_characters[agent_id] = agent_info["character"]

    # Read existing config, preserve other fields
    root = get_project_root()
    config_path = root / ".pennyfarthing" / "config.local.yaml"

    config: dict = {}
    if config_path.exists():
        try:
            existing = yaml.safe_load(config_path.read_text())
            if existing and isinstance(existing, dict):
                config = existing
        except Exception:
            pass

    config["theme"] = name
    config["theme_characters"] = theme_characters

    config_path.parent.mkdir(parents=True, exist_ok=True)
    header = (
        "# Pennyfarthing Local Configuration\n"
        "# This file is gitignored - your personal preferences\n\n"
    )
    config_path.write_text(
        header + yaml.dump(config, default_flow_style=False, sort_keys=False)
    )

    click.echo(f"Theme changed to '{name}'.")

    _check_portrait_lfs(name, root)

    click.echo()
    click.echo(f"  {theme_meta.get('name', name)}")

    samples = []
    for key in ["sm", "tea", "dev"]:
        agent = agents.get(key)
        if agent and agent.get("character"):
            samples.append(f"{key.upper()}: {agent['character']}")
    if samples:
        click.echo(f"  {' | '.join(samples)}")

    click.echo()
    click.echo("Start a new agent session to use the new theme.")


@theme.command("create")
@click.argument("name")
@click.option("--base", default=None, help="Base theme to copy from (defaults to current theme)")
@click.option("--user", is_flag=True, help="Create as user-level theme (~/.claude/pennyfarthing/themes/)")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def create(name: str, base: str | None, user: bool, dry_run: bool):
    """Create a new custom theme from a base theme.

    \b
    Arguments:
      NAME  - Name for the new theme (lowercase, hyphens allowed)
    """
    from pathlib import Path

    import yaml

    from pf.common.config import get_project_root
    from pf.common.themes import (
        get_current_theme,
        list_themes,
        resolve_theme_path,
    )

    if not base:
        base = get_current_theme() or "blade-runner"

    if name != name.lower():
        raise click.ClickException("Theme name must be lowercase")
    if " " in name:
        raise click.ClickException("Theme name cannot contain spaces (use hyphens)")
    if not re.match(r"^[a-z][a-z0-9-]*$", name):
        raise click.ClickException(
            "Theme name must start with a letter and contain only lowercase letters, numbers, and hyphens"
        )

    if name in list_themes():
        raise click.ClickException(f"Theme '{name}' already exists")

    base_path = resolve_theme_path(base)
    if not base_path:
        available = ", ".join(list_themes()[:10])
        raise click.ClickException(f"Base theme '{base}' not found.\nAvailable: {available}...")

    if dry_run:
        if user:
            target = Path.home() / ".claude" / "pennyfarthing" / "themes" / f"{name}.yaml"
        else:
            root = get_project_root()
            target = root / ".claude" / "pennyfarthing" / "themes" / f"{name}.yaml"
        click.echo(f"[DRY-RUN] Would create theme '{name}' based on '{base}'")
        click.echo(f"  Target: {target}")
        return

    if user:
        target_dir = Path.home() / ".claude" / "pennyfarthing" / "themes"
    else:
        root = get_project_root()
        target_dir = root / ".claude" / "pennyfarthing" / "themes"

    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{name}.yaml"

    base_data = yaml.safe_load(base_path.read_text())
    base_data["theme"]["name"] = name.replace("-", " ").title()
    base_data["theme"]["description"] = f"Custom theme based on {base}"

    file_header = (
        f"# Custom Theme: {name}\n"
        f"# Based on: {base}\n"
        "# Edit this file to customize your agent personas\n\n"
    )
    target_path.write_text(
        file_header + yaml.dump(base_data, default_flow_style=False, sort_keys=False)
    )

    click.echo(f"Created theme '{name}'.")
    click.echo()
    click.echo(f"  File: {target_path}")
    click.echo()
    click.echo("Next steps:")
    click.echo("  1. Edit the theme file to customize your agents")
    click.echo(f"  2. Run 'pf theme set {name}' to activate")
