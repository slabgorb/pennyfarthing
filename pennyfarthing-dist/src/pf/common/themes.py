"""
Theme discovery and listing for Pennyfarthing.

Python implementation of the canonical theme discovery algorithm
(spec lives in @pennyfarthing/shared theme-loader.ts).

Discovery order (deduped by theme ID, first source wins):
  1. Core themes: .pennyfarthing/personas/themes/ and pennyfarthing-dist/personas/themes/
  2. Theme packages: node_modules/@pennyfarthing/themes-*/themes/
  3. Monorepo packages: packages/themes-*/themes/ (workspace dev)
  4. Project custom: .claude/pennyfarthing/themes/
  5. User custom: ~/.claude/pennyfarthing/themes/
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

from pf.common.config import get_dist_root, get_project_root, load_yaml_config


def discover_all_theme_dirs(project_root: Path | None = None) -> list[Path]:
    """Discover all directories containing theme YAML files.

    Returns dirs in priority order matching the canonical spec.

    Args:
        project_root: Project root (auto-detected if not provided)

    Returns:
        List of Path objects for directories containing theme YAMLs
    """
    root = project_root or get_project_root()
    dirs: list[Path] = []

    # 1a. Core themes via .pennyfarthing symlink
    symlink_themes = root / ".pennyfarthing" / "personas" / "themes"
    if symlink_themes.is_dir():
        dirs.append(symlink_themes)

    # 1b. Core themes via pennyfarthing-dist (development or npm)
    dist_root = get_dist_root(project_root=root)
    if dist_root:
        dist_themes = dist_root / "personas" / "themes"
        if dist_themes.is_dir() and dist_themes not in dirs:
            dirs.append(dist_themes)

    # 2. Theme packages via node_modules
    nm_pf = root / "node_modules" / "@pennyfarthing"
    if nm_pf.is_dir():
        for entry in sorted(nm_pf.iterdir()):
            if entry.name.startswith("themes-") and entry.is_dir():
                if _is_theme_pack(entry):
                    themes_dir = entry / "themes"
                    if themes_dir.is_dir():
                        dirs.append(themes_dir)

    # 3. Monorepo workspace packages (development)
    packages_dir = root / "packages"
    if packages_dir.is_dir():
        for entry in sorted(packages_dir.iterdir()):
            if entry.name.startswith("themes-") and entry.is_dir():
                if _is_theme_pack(entry):
                    themes_dir = entry / "themes"
                    if themes_dir.is_dir() and themes_dir not in dirs:
                        dirs.append(themes_dir)

    # 4. Project-level custom themes
    project_custom = root / ".claude" / "pennyfarthing" / "themes"
    if project_custom.is_dir():
        dirs.append(project_custom)

    # 5. User-level custom themes
    user_custom = Path.home() / ".claude" / "pennyfarthing" / "themes"
    if user_custom.is_dir():
        dirs.append(user_custom)

    return dirs


def _is_theme_pack(pkg_dir: Path) -> bool:
    """Check if a directory is a valid pennyfarthing theme pack."""
    pkg_json = pkg_dir / "package.json"
    if not pkg_json.exists():
        return False
    try:
        pkg = json.loads(pkg_json.read_text())
        return pkg.get("pennyfarthing-theme-pack") is True
    except Exception:
        return False


def list_themes(project_root: Path | None = None) -> list[str]:
    """List all available theme IDs across all sources.

    Deduplicates by theme ID (first source wins).

    Args:
        project_root: Project root (auto-detected if not provided)

    Returns:
        Sorted list of theme ID strings
    """
    seen: set[str] = set()
    theme_ids: list[str] = []

    for theme_dir in discover_all_theme_dirs(project_root):
        try:
            for f in sorted(theme_dir.iterdir()):
                if f.suffix == ".yaml" and f.is_file():
                    theme_id = f.stem
                    if theme_id not in seen:
                        seen.add(theme_id)
                        theme_ids.append(theme_id)
        except OSError:
            continue

    return sorted(theme_ids)


def resolve_theme_path(theme: str, project_root: Path | None = None) -> Path | None:
    """Resolve the file path for a specific theme across all sources.

    Args:
        theme: Theme ID (e.g., 'classical-composers')
        project_root: Project root (auto-detected if not provided)

    Returns:
        Path to the theme YAML, or None if not found
    """
    filename = f"{theme}.yaml"
    for theme_dir in discover_all_theme_dirs(project_root):
        candidate = theme_dir / filename
        if candidate.exists():
            return candidate
    return None


def get_current_theme(project_root: Path | None = None) -> str | None:
    """Get the currently configured theme.

    Checks config files in priority order:
    1. .pennyfarthing/config.local.yaml
    2. .pennyfarthing/persona-config.yaml

    Args:
        project_root: Project root (auto-detected if not provided)

    Returns:
        Theme name, or None if not configured
    """
    root = project_root or get_project_root()

    config_paths = [
        root / ".pennyfarthing" / "config.local.yaml",
        root / ".pennyfarthing" / "persona-config.yaml",
    ]

    for config_path in config_paths:
        config = load_yaml_config(config_path)
        if config and "theme" in config:
            return config["theme"]

    return None


def load_theme_metadata(project_root: Path | None = None) -> list[dict[str, Any]]:
    """Load metadata for all discoverable themes.

    Extracts id, name, tier from each theme YAML.
    Deduplicates by theme ID (first source wins).

    Args:
        project_root: Project root (auto-detected if not provided)

    Returns:
        List of theme metadata dicts with keys: id, name, tier
    """
    seen: set[str] = set()
    metadata: list[dict[str, Any]] = []

    for theme_dir in discover_all_theme_dirs(project_root):
        try:
            for f in sorted(theme_dir.iterdir()):
                if f.suffix != ".yaml" or not f.is_file():
                    continue
                theme_id = f.stem
                if theme_id in seen:
                    continue
                seen.add(theme_id)

                try:
                    data = yaml.safe_load(f.read_text())
                    if not data or "theme" not in data:
                        continue
                    theme_info = data["theme"]
                    metadata.append({
                        "id": theme_id,
                        "name": theme_info.get("name", theme_id),
                        "tier": theme_info.get("tier", "U"),
                    })
                except Exception:
                    continue
        except OSError:
            continue

    return sorted(metadata, key=lambda m: m["id"])


def format_theme_list(
    current_theme: str | None = None,
    project_root: Path | None = None,
) -> str:
    """Format theme listing for CLI output.

    Produces the same 3-column, tier-annotated output that list-themes.sh
    previously generated in pure bash.

    Args:
        current_theme: Currently active theme (will be starred)
        project_root: Project root (auto-detected if not provided)

    Returns:
        Formatted string for terminal display
    """
    themes = load_theme_metadata(project_root)
    if not themes:
        return "No themes found."

    current = current_theme or get_current_theme(project_root) or ""

    lines: list[str] = []
    lines.append(
        f"**{len(themes)} themes available.** Current: **{current or 'none'}**"
    )
    lines.append("")

    col_width = 28
    row: list[str] = []
    for t in themes:
        tid = t["id"]
        tier = t.get("tier", "U")
        label = f"*{tid} [{tier}]" if tid == current else f"{tid} [{tier}]"
        row.append(f"{label:<{col_width}}")
        if len(row) == 3:
            lines.append("".join(row))
            row = []
    if row:
        lines.append("".join(row))

    return "\n".join(lines)
