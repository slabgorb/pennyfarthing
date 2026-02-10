"""
Persona loading for Prime v2.

Loads agent personas from theme YAML files for character-driven agents.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from pennyfarthing_scripts.common.config import get_project_root, load_yaml_config
from pennyfarthing_scripts.common.themes import (
    get_current_theme as _get_current_theme,
)
from pennyfarthing_scripts.common.themes import (
    resolve_theme_path,
)
from pennyfarthing_scripts.prime.models import CrewMember, Persona

# Standard agent roles for crew manifest
AGENT_ROLES = [
    "sm", "tea", "dev", "reviewer", "architect",
    "pm", "tech-writer", "ux-designer", "devops", "orchestrator",
]


def get_current_theme(project_root: Path | None = None) -> str | None:
    """Get the currently configured theme.

    Delegates to common.themes canonical implementation.

    Args:
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Theme name, or None if not configured
    """
    return _get_current_theme(project_root)


def get_theme_path(theme: str, project_root: Path) -> Path | None:
    """Get the path to a theme YAML file.

    Delegates to common.themes canonical discovery algorithm.

    Args:
        theme: Theme name
        project_root: Project root path

    Returns:
        Path to theme file, or None if not found
    """
    return resolve_theme_path(theme, project_root)


def load_theme(theme: str, project_root: Path | None = None) -> dict[str, Any] | None:
    """Load a theme YAML file.

    Args:
        theme: Theme name
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Theme data dict, or None if not found
    """
    root = project_root or get_project_root()
    theme_path = get_theme_path(theme, root)

    if not theme_path:
        return None

    try:
        return yaml.safe_load(theme_path.read_text())
    except Exception:
        return None


def load_persona(agent_name: str, project_root: Path | None = None) -> tuple[Persona | None, str | None]:
    """Load persona for an agent from the current theme.

    Args:
        agent_name: Agent name (sm, tea, dev, etc.)
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Tuple of (Persona, theme_name) or (None, None) if not found
    """
    root = project_root or get_project_root()
    theme = get_current_theme(root)

    if not theme:
        return None, None

    theme_data = load_theme(theme, root)
    if not theme_data or "agents" not in theme_data:
        return None, None

    agent_data = theme_data["agents"].get(agent_name)
    if not agent_data:
        return None, None

    # Extract helper info if present
    helper = agent_data.get("helper", {})

    persona = Persona(
        character=agent_data.get("character", "Unknown"),
        style=agent_data.get("style", ""),
        role=agent_data.get("role", ""),
        quote=agent_data.get("quote"),
        trait=agent_data.get("trait"),
        quirk=agent_data.get("quirk"),
        motto=agent_data.get("motto"),
        helper_name=helper.get("name") if helper else None,
        helper_style=helper.get("style") if helper else None,
    )

    return persona, theme


def get_crew_manifest(project_root: Path | None = None) -> list[CrewMember]:
    """Get all agent characters from the current theme.

    Used for handoff reference so agents know other characters.

    Args:
        project_root: Project root path (auto-detected if not provided)

    Returns:
        List of CrewMember objects for all 10 standard roles
    """
    root = project_root or get_project_root()
    theme = get_current_theme(root)

    if not theme:
        return []

    theme_data = load_theme(theme, root)
    if not theme_data or "agents" not in theme_data:
        return []

    crew = []
    for role in AGENT_ROLES:
        agent_data = theme_data["agents"].get(role)
        if agent_data and "character" in agent_data:
            crew.append(CrewMember(role=role, character=agent_data["character"]))

    return crew


def get_user_title(project_root: Path | None = None) -> str | None:
    """Get the user title from the current theme.

    Args:
        project_root: Project root path (auto-detected if not provided)

    Returns:
        User title (e.g., "Bossmang"), or None if not set
    """
    root = project_root or get_project_root()
    theme = get_current_theme(root)

    if not theme:
        return None

    theme_data = load_theme(theme, root)
    if not theme_data or "theme" not in theme_data:
        return None

    return theme_data["theme"].get("user_title")


def format_persona_output(
    persona: Persona,
    theme: str,
    agent_name: str,
    crew: list[CrewMember] | None = None,
    user_title: str | None = None,
) -> str:
    """Format persona as XML output for Claude.

    Matches the format from agent-session.sh:
    <persona agent="dev" theme="the-expanse">
    Character: Naomi Nagata
    Style: ...
    </persona>

    Args:
        persona: Persona to format
        theme: Theme name
        agent_name: Agent name
        crew: Optional crew manifest for handoff reference
        user_title: Optional user title

    Returns:
        Formatted persona XML string
    """
    lines = [
        f'<persona agent="{agent_name}" theme="{theme}">',
        f"Character: {persona.character}",
        f"Style: {persona.style}",
        f"Role: {persona.role}",
    ]

    if persona.trait:
        lines.append(f"Trait: {persona.trait}")
    if persona.quirk:
        lines.append(f"Quirk: {persona.quirk}")
    if persona.motto:
        lines.append(f"Motto: {persona.motto}")
    if persona.quote:
        lines.append(f"Quote: {persona.quote}")
    if persona.helper_name:
        helper_line = f"Helper: {persona.helper_name}"
        if persona.helper_style:
            helper_line += f" - {persona.helper_style}"
        lines.append(helper_line)
        lines.append(f"When spawning subagents, refer to them as your {persona.helper_name}.")

    lines.append("</persona>")

    # Add user title if set
    if user_title:
        lines.append("")
        lines.append(f"<user-title>Address the user as: {user_title}</user-title>")

    # Add crew manifest for handoff reference
    if crew:
        lines.append("")
        lines.append(f'<crew theme="{theme}">')
        lines.append("When handing off to other agents, address them by character name:")
        for member in crew:
            lines.append(f"  {member.role:12} {member.character}")
        lines.append("</crew>")

    return "\n".join(lines)


def is_character_voice_enabled(project_root: Path | None = None) -> bool:
    """Check if character voice is enabled in preferences.

    Checks preferences files in order:
    1. .claude/pennyfarthing/preferences.local.yaml
    2. .claude/pennyfarthing/preferences.yaml

    Defaults to True if no preference is set.

    Args:
        project_root: Project root path (auto-detected if not provided)

    Returns:
        True if character voice is enabled
    """
    root = project_root or get_project_root()

    prefs_paths = [
        root / ".claude" / "pennyfarthing" / "preferences.local.yaml",
        root / ".claude" / "pennyfarthing" / "preferences.yaml",
    ]

    for prefs_path in prefs_paths:
        prefs = load_yaml_config(prefs_path)
        if prefs and "character_voice" in prefs:
            return prefs["character_voice"] is not False

    # Default to enabled
    return True


def format_persona_compressed(
    persona: Persona,
    theme: str,
    agent_name: str,
) -> str:
    """Format persona as compressed XML for reduced token usage.

    Compressed format (~100 tokens vs ~300 for full):
    <persona agent="dev" character="Rosie the Riveter">
      <voice>Can-do wartime spirit, practical, determined</voice>
      <catchphrase>"We Can Do It!"</catchphrase>
      <style>Direct, encouraging, efficiency-focused</style>
    </persona>

    Args:
        persona: Persona to format
        theme: Theme name
        agent_name: Agent name

    Returns:
        Compressed persona XML string (~100 tokens)
    """
    lines = [f'<persona agent="{agent_name}" character="{persona.character}">']

    # Voice from style (primary behavioral descriptor)
    if persona.style:
        lines.append(f"  <voice>{persona.style}</voice>")

    # Catchphrase from quote
    if persona.quote:
        lines.append(f"  <catchphrase>{persona.quote}</catchphrase>")

    # Style from role (short descriptor)
    if persona.role:
        lines.append(f"  <style>{persona.role}</style>")

    lines.append("</persona>")

    return "\n".join(lines)
