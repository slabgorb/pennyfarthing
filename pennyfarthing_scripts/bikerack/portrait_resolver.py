"""Portrait path resolution for BikeRack TUI.

Resolves persona portrait image paths from theme YAML and portrait directories.
Python port of packages/core/src/shared/portrait-resolver.ts.

Story 110-3: Portrait image header with textual-image.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml


def _to_slug(name: str) -> str:
    """Convert a name to URL-safe slug (lowercase kebab-case)."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _find_pennyfarthing_dist(start: Path) -> Path | None:
    """Walk up from start looking for a pennyfarthing-dist directory."""
    candidate = start / "pennyfarthing-dist"
    if candidate.is_dir():
        return candidate
    for parent in start.parents:
        candidate = parent / "pennyfarthing-dist"
        if candidate.is_dir():
            return candidate
    return None


def _extract_agent_slug(dist_dir: Path, theme: str, agent: str) -> str | None:
    """Extract portrait slug (shortName-OCEAN) from theme YAML."""
    theme_yaml = dist_dir / "personas" / "themes" / f"{theme}.yaml"
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
    for size in ["small", "medium", "large", "original"]:
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

    Args:
        theme: Theme name (e.g., 'hogans-heroes', 'monty-python')
        agent: Agent role (e.g., 'sm', 'tea', 'dev')
        project_root: Project root for path resolution. Defaults to cwd.

    Returns:
        Path to portrait file, or None if not found.
    """
    root = project_root or Path.cwd()
    dist_dir = _find_pennyfarthing_dist(root)
    if dist_dir is None:
        return None

    slug = _extract_agent_slug(dist_dir, theme, agent)
    if slug is None:
        return None

    portraits_theme_dir = dist_dir / "personas" / "portraits" / theme
    return _find_portrait(portraits_theme_dir, slug)


def detect_image_protocol() -> str | None:
    """Detect the best available terminal image protocol.

    Must be called BEFORE App.run() since protocol detection requires
    raw terminal access that Textual's event loop will claim.

    Returns:
        Protocol name ('kitty', 'sixel', 'halfcell', None for unsupported).
    """
    try:
        from textual_image._terminal import get_cell_size
    except ImportError:
        return None

    # Probe terminal for image protocol support via cell size query.
    # If the terminal responds, it supports at least halfcell rendering.
    # The Image widget auto-selects the best protocol at render time,
    # so we just confirm the terminal is capable.
    try:
        cell_size = get_cell_size()
        if cell_size and cell_size.width > 0:
            return "halfcell"  # baseline — widget upgrades to kitty/sixel if available
    except Exception:
        pass
    return None
