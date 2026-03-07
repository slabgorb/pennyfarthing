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


def _is_lfs_pointer(path: Path) -> bool:
    """Check if a file is a git-lfs pointer instead of actual image data."""
    try:
        with open(path, "rb") as f:
            header = f.read(44)
        return header.startswith(b"version https://git-lfs")
    except OSError:
        return False


def _has_lfs_stubs(portraits_theme_dir: Path, slug: str) -> bool:
    """Check if a portrait directory has LFS stubs for the given slug."""
    if not portraits_theme_dir.is_dir():
        return False
    for size_dir in portraits_theme_dir.iterdir():
        if not size_dir.is_dir():
            continue
        for f in size_dir.iterdir():
            if f.name.lower().startswith(slug.lower()) and f.suffix in (".png", ".jpg"):
                if _is_lfs_pointer(f):
                    return True
    return False


def _find_portrait(
    portraits_theme_dir: Path, slug: str, preferred_size: str | None = None
) -> Path | None:
    """Find a portrait file matching the slug in a theme's portrait directory.

    Args:
        portraits_theme_dir: Path to the theme's portrait directory.
        slug: Portrait slug (shortName-OCEAN).
        preferred_size: Preferred size bucket. ``"large"`` or ``"medium"``
            searches large first; ``"small"`` searches small first.
            ``None`` keeps the default order (medium first).
    """
    if not portraits_theme_dir.is_dir():
        return None
    if preferred_size == "small":
        size_order = ["small", "medium", "large", "original"]
    elif preferred_size in ("large", "medium"):
        size_order = ["large", "medium", "small", "original"]
    else:
        size_order = ["medium", "large", "small", "original"]
    for size in size_order:
        size_dir = portraits_theme_dir / size
        if size_dir.is_dir():
            for f in size_dir.iterdir():
                if f.name.lower().startswith(slug.lower()) and f.suffix in (".png", ".jpg"):
                    if not _is_lfs_pointer(f):
                        return f
    # Fallback to root of theme dir
    for f in portraits_theme_dir.iterdir():
        if f.is_file() and f.name.lower().startswith(slug.lower()) and f.suffix in (".png", ".jpg"):
            if not _is_lfs_pointer(f):
                return f
    return None


def resolve_portrait_path(
    theme: str,
    agent: str,
    project_root: Path | None = None,
    preferred_size: str | None = None,
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
        result = _find_portrait(portraits_dir, slug, preferred_size=preferred_size)
        if result:
            return result

    # Self-healing: if portraits exist as LFS stubs, pull them and retry
    for themes_dir in theme_dirs:
        portraits_dir = themes_dir.parent / "portraits" / theme
        if _has_lfs_stubs(portraits_dir, slug):
            try:
                from pf.common.themes import ensure_portrait_lfs

                pull_result = ensure_portrait_lfs(theme, project_root, quiet=True)
                if pull_result.get("pulled"):
                    # Retry after successful LFS pull
                    for td in theme_dirs:
                        pd = td.parent / "portraits" / theme
                        found = _find_portrait(pd, slug, preferred_size=preferred_size)
                        if found:
                            return found
            except Exception:
                pass
            break  # Only attempt LFS pull once

    # Fallback: search Cyclist package portrait directories
    # Portraits are bundled in @pennyfarthing/cyclist, not alongside theme YAMLs
    root = project_root or Path.cwd()
    cyclist_portrait_dirs = [
        root / "packages" / "cyclist" / "portraits" / theme,  # monorepo dev
        root / "node_modules" / "@pennyfarthing" / "cyclist" / "portraits" / theme,  # npm
    ]
    # pnpm: resolve through .pennyfarthing symlink chain
    pnpm_cyclist = root / "node_modules" / ".pnpm"
    if pnpm_cyclist.is_dir():
        for entry in pnpm_cyclist.iterdir():
            if entry.name.startswith("@pennyfarthing+cyclist@"):
                candidate = entry / "node_modules" / "@pennyfarthing" / "cyclist" / "portraits" / theme
                cyclist_portrait_dirs.append(candidate)
                break

    for portraits_dir in cyclist_portrait_dirs:
        result = _find_portrait(portraits_dir, slug, preferred_size=preferred_size)
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

    # Kitty graphics protocol: kitty, Ghostty (native support)
    term = os.environ.get("TERM", "")
    term_program = os.environ.get("TERM_PROGRAM", "")
    if "kitty" in term or os.environ.get("KITTY_WINDOW_ID"):
        return "kitty"
    if "ghostty" in term or term_program.lower() == "ghostty":
        return "kitty"

    # Sixel: some terminals advertise via TERM or COLORTERM
    # WezTerm, foot, mlterm support sixel
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
