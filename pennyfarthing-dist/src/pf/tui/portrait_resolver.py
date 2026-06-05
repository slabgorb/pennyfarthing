"""Portrait path resolution for the Frame TUI.

Computes each persona's portrait ``slug`` (``shortName-OCEAN``) from the theme
YAML via the canonical discovery in ``pf.common.themes``, then fetches the image
from the R2 CDN (``pf.package.portrait_cdn``) — the single source of truth. There
are no local install, override, theme-sibling, Git-LFS, or Cyclist-package
fallbacks (story 153-12).

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


def resolve_portrait_path(
    theme: str,
    agent: str,
    project_root: Path | None = None,
    preferred_size: str | None = None,
) -> Path | None:
    """Resolve the full path to a portrait image.

    Uses ``discover_all_theme_dirs`` from ``common.themes`` only to compute the
    agent's portrait ``slug`` (``shortName-OCEAN``) from the theme YAML. The
    image itself is fetched from the R2 CDN — the single source of truth.

    Args:
        theme: Theme name (e.g., 'hogans-heroes', 'monty-python')
        agent: Agent role (e.g., 'sm', 'tea', 'dev')
        project_root: Project root for theme-YAML discovery. Defaults to cwd.

    Returns:
        Path to the cached portrait file, or None if the slug can't be resolved
        or the CDN has no image (e.g. offline).
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

    # R2 CDN is the ONLY portrait source (story 153-12). We already computed
    # ``slug`` locally, so we ask the bucket for exactly the file we need
    # (``{base}/portraits/{theme}/{size}/{slug}.png``): instant on a cache hit,
    # ``None`` when offline. No local install, ``~/.pennyfarthing`` override,
    # theme-sibling, Git-LFS self-heal, or Cyclist-package fallback — by decree.
    try:
        from pf.package import portrait_cdn

        return portrait_cdn.fetch_portrait(theme, slug, preferred_size=preferred_size or "medium")
    except Exception:
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

    # Inside tmux/screen the multiplexer masks TERM (→ ``tmux-256color``) and
    # TERM_PROGRAM (→ ``tmux``), hiding the host terminal. But host terminals
    # leak identifying env vars into the pane — sniff those. All hosts matched
    # here speak the Kitty graphics protocol, which the TUI forwards through
    # tmux via DCS passthrough (see app.py ``_patch_tgp_for_tmux``).
    in_multiplexer = bool(os.environ.get("TMUX")) or term.startswith(("tmux", "screen"))
    if in_multiplexer:
        cf_bundle = os.environ.get("__CFBundleIdentifier", "").lower()
        if (
            os.environ.get("GHOSTTY_RESOURCES_DIR")
            or os.environ.get("GHOSTTY_BIN_DIR")
            or "ghostty" in cf_bundle
            or os.environ.get("KITTY_PID")
            or os.environ.get("WEZTERM_EXECUTABLE")  # WezTerm supports kitty graphics
            or os.environ.get("WEZTERM_PANE")
        ):
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
