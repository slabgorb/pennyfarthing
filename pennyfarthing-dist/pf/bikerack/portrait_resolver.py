"""Portrait path resolution for BikeRack TUI.

Resolves persona portrait image paths using the canonical theme discovery
from ``pf.common.themes``.  Each theme directory that
contains ``themes/{name}.yaml`` has a sibling ``portraits/{name}/`` with
size-bucketed portrait images.

Story 110-3: Portrait image header with textual-image.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml


def _to_slug(name: str) -> str:
    """Convert a name to URL-safe slug (lowercase kebab-case)."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _extract_agent_slug(theme_yaml: Path, agent: str) -> str | None:
    """Extract portrait slug (shortName-OCEAN) from a theme YAML file."""
    if not theme_yaml.exists():
        return None
    try:
        data = yaml.safe_load(theme_yaml.read_text())
        agent_data = (data or {}).get("agents", {}).get(agent)
        if not agent_data:
            return None
        short_name = agent_data.get("shortName") or (
            agent_data.get("character", "").split()[0] if agent_data.get("character") else None
        )
        ocean = agent_data.get("ocean", {})
        if short_name and all(k in ocean for k in "OCEAN"):
            return f"{_to_slug(short_name)}-{ocean['O']}{ocean['C']}{ocean['E']}{ocean['A']}{ocean['N']}"
    except Exception:
        pass
    return None


def _find_portrait(portraits_theme_dir: Path, slug: str) -> Path | None:
    """Find a portrait file matching the slug in a theme's portrait directory."""
    if not portraits_theme_dir.is_dir():
        return None
    for size in ["medium", "large", "small", "original"]:
        size_dir = portraits_theme_dir / size
        if size_dir.is_dir():
            for f in size_dir.iterdir():
                if f.name.lower().startswith(slug.lower()) and f.suffix in (".png", ".jpg"):
                    return f
    # Fallback to root of theme dir
    for f in portraits_theme_dir.iterdir():
        if f.is_file() and f.name.lower().startswith(slug.lower()) and f.suffix in (".png", ".jpg"):
            return f
    return None


def resolve_portrait_path(
    theme: str, agent: str, project_root: Path | None = None
) -> Path | None:
    """Resolve the full path to a portrait image.

    Uses ``discover_all_theme_dirs`` from ``common.themes`` to search core
    themes, installed theme packages, monorepo workspace packages, and
    custom themes — in canonical priority order.

    For each theme directory the portrait sibling is derived:
    - ``.pennyfarthing/personas/themes/`` → ``.pennyfarthing/personas/portraits/``
    - ``themes-*/themes/`` → ``themes-*/portraits/``

    Args:
        theme: Theme name (e.g., 'hogans-heroes', 'monty-python')
        agent: Agent role (e.g., 'sm', 'tea', 'dev')
        project_root: Project root for path resolution. Defaults to cwd.

    Returns:
        Path to portrait file, or None if not found.
    """
    from pf.common.themes import discover_all_theme_dirs

    theme_dirs = discover_all_theme_dirs(project_root)

    # Resolve slug from the first theme dir that has this theme's YAML
    slug: str | None = None
    for themes_dir in theme_dirs:
        theme_yaml = themes_dir / f"{theme}.yaml"
        slug = _extract_agent_slug(theme_yaml, agent)
        if slug:
            break

    if not slug:
        return None

    # Search portrait directories (sibling of each themes dir)
    for themes_dir in theme_dirs:
        portraits_dir = themes_dir.parent / "portraits" / theme
        result = _find_portrait(portraits_dir, slug)
        if result:
            return result

    return None


def detect_image_protocol() -> str | None:
    """Detect the best available terminal image protocol.

    Uses environment variables for reliable detection since subprocess
    stdout may not be a TTY (e.g., when launched via Claude Code).

    Returns:
        Protocol name ('kitty', 'sixel', 'halfcell', None for unsupported).
    """
    import os

    # Kitty: TERM=xterm-kitty or KITTY_WINDOW_ID present
    term = os.environ.get("TERM", "")
    if "kitty" in term or os.environ.get("KITTY_WINDOW_ID"):
        return "kitty"

    # Sixel: some terminals advertise via TERM or COLORTERM
    # WezTerm, foot, mlterm support sixel
    term_program = os.environ.get("TERM_PROGRAM", "")
    if term_program.lower() in ("wezterm", "foot", "mlterm"):
        return "sixel"

    # Fallback: try textual-image's cell size probe for halfcell baseline
    try:
        from textual_image._terminal import get_cell_size

        cell_size = get_cell_size()
        if cell_size and cell_size.width > 0:
            return "halfcell"
    except Exception:
        pass

    return None
