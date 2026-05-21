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
import os
import subprocess
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

    Reads from .pennyfarthing/config.local.yaml only.

    Args:
        project_root: Project root (auto-detected if not provided)

    Returns:
        Theme name, or None if not configured
    """
    # Environment override — allows concurrent benchmark runs without
    # mutating the shared config.local.yaml
    env_theme = os.environ.get("PF_THEME")
    if env_theme:
        return env_theme

    root = project_root or get_project_root()

    config_path = root / ".pennyfarthing" / "config.local.yaml"
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
                    metadata.append(
                        {
                            "id": theme_id,
                            "name": theme_info.get("name", theme_id),
                            "tier": theme_info.get("tier", "U"),
                        }
                    )
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
    lines.append(f"**{len(themes)} themes available.** Current: **{current or 'none'}**")
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


def format_theme_agent_list(
    agent_type: str,
    project_root: Path | None = None,
    *,
    as_json: bool = False,
) -> str:
    """List all themes showing the character assigned to a specific agent type.

    Args:
        agent_type: Agent role to filter on (e.g. 'tea', 'dev', 'reviewer')
        project_root: Project root (auto-detected if not provided)
        as_json: Return JSON instead of formatted text

    Returns:
        Formatted string for terminal display
    """
    seen: set[str] = set()
    entries: list[dict[str, str]] = []

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
                    if not data or "agents" not in data:
                        continue
                    agent = data["agents"].get(agent_type, {})
                    if not agent or not agent.get("character"):
                        continue
                    entries.append(
                        {
                            "theme": theme_id,
                            "tier": data.get("theme", {}).get("tier", "U"),
                            "character": agent["character"],
                            "style": agent.get("style", ""),
                        }
                    )
                except Exception:
                    continue
        except OSError:
            continue

    entries.sort(key=lambda e: e["theme"])

    if as_json:
        import json as json_mod

        return json_mod.dumps(entries, indent=2)

    if not entries:
        return f"No themes found with agent type '{agent_type}'."

    lines: list[str] = []
    lines.append(f"{len(entries)} themes with {agent_type.upper()} agent:\n")

    theme_w = max(len(e["theme"]) for e in entries) + 5
    char_w = max(len(e["character"]) for e in entries) + 2

    for e in entries:
        tier = f"[{e['tier']}]"
        theme_col = f"{e['theme']} {tier}".ljust(theme_w)
        char_col = e["character"].ljust(char_w)
        lines.append(f"  {theme_col} {char_col} {e['style']}")

    return "\n".join(lines)


def _is_lfs_pointer(path: Path) -> bool:
    """Check if a file is a git-lfs pointer instead of actual image data."""
    try:
        with open(path, "rb") as f:
            header = f.read(44)
        return header.startswith(b"version https://git-lfs")
    except OSError:
        return False


def ensure_portrait_lfs(
    theme_name: str,
    project_root: Path | None = None,
    *,
    quiet: bool = False,
) -> dict[str, Any]:
    """Pull LFS portrait files for a theme if any are detected as stubs.

    Checks portrait directories for the given theme. If any files are
    LFS pointers (not real images), runs ``git lfs pull`` scoped to
    that theme's portrait directory.

    Args:
        theme_name: Theme ID (e.g. "discworld")
        project_root: Project root (auto-detected if not provided)
        quiet: If True, suppress informational output

    Returns:
        Result dict: {success, pulled?, skipped?, error?}
    """
    root = project_root or get_project_root()
    theme_dirs = discover_all_theme_dirs(root)

    lfs_files: list[Path] = []
    for themes_dir in theme_dirs:
        portraits_dir = themes_dir.parent / "portraits" / theme_name
        if not portraits_dir.is_dir():
            continue
        for f in portraits_dir.rglob("*"):
            if f.is_file() and f.suffix in (".png", ".jpg") and _is_lfs_pointer(f):
                lfs_files.append(f)

    if not lfs_files:
        return {"success": True, "skipped": True}

    # Find the git repo root containing the portraits.
    # Resolve symlinks first — in monorepo setups, portrait paths may go
    # through symlinks (e.g. .pennyfarthing/personas → pennyfarthing/
    # pennyfarthing-dist/personas) and the unresolved path would find
    # the wrong git root (orchestrator instead of framework repo).
    repo_root = lfs_files[0].resolve().parent
    while repo_root != repo_root.parent:
        if (repo_root / ".git").exists():
            break
        repo_root = repo_root.parent
    else:
        return {"success": True, "skipped": True}

    # Build include path relative to repo root using resolved paths
    include_path: str | None = None
    for themes_dir in theme_dirs:
        base = (themes_dir.parent / "portraits" / theme_name).resolve()
        if base.is_dir():
            try:
                include_path = str(base.relative_to(repo_root)) + "/**"
                break
            except ValueError:
                continue

    if include_path is None:
        return {"success": True, "skipped": True}

    try:
        result = subprocess.run(
            ["git", "lfs", "pull", f"--include={include_path}"],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            if not quiet:
                import click

                click.echo(f"Pulled {len(lfs_files)} portrait images for {theme_name}.")
            return {"success": True, "pulled": len(lfs_files)}
        return {
            "success": False,
            "error": f"git lfs pull failed: {result.stderr.strip()}",
        }
    except FileNotFoundError:
        if not quiet:
            import click

            click.echo(
                "Warning: git-lfs not installed, portrait images may be missing.",
                err=True,
            )
        return {"success": True, "skipped": True, "error": "git-lfs not installed"}
    except subprocess.TimeoutExpired:
        if not quiet:
            import click

            click.echo("Warning: git lfs pull timed out.", err=True)
        return {"success": True, "skipped": True, "error": "git lfs pull timed out"}
