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
    from pennyfarthing_scripts.common.themes import format_theme_list

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

    from pennyfarthing_scripts.common.themes import (
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


@theme.command("set")
@click.argument("name")
def set_theme(name: str):
    """Set the active persona theme.

    \b
    Arguments:
      NAME  - Theme name to activate
    """
    import yaml

    from pennyfarthing_scripts.common.config import get_project_root
    from pennyfarthing_scripts.common.themes import (
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
@click.option("--base", default="minimalist", show_default=True, help="Base theme to copy from")
@click.option("--user", is_flag=True, help="Create as user-level theme (~/.claude/pennyfarthing/themes/)")
def create(name: str, base: str, user: bool):
    """Create a new custom theme from a base theme.

    \b
    Arguments:
      NAME  - Name for the new theme (lowercase, hyphens allowed)
    """
    import yaml
    from pathlib import Path

    from pennyfarthing_scripts.common.config import get_project_root
    from pennyfarthing_scripts.common.themes import (
        list_themes,
        resolve_theme_path,
    )

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
    click.echo(f"  1. Edit the theme file to customize your agents")
    click.echo(f"  2. Run 'pf theme set {name}' to activate")
