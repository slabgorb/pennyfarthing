"""
Spinner customization — sync theme verbs and feature tips to Claude Code settings.

Reads spinner_verbs from the active theme YAML and feature-discovery tips from
data/spinner-tips.yaml, then writes them into .claude/settings.local.json as
spinnerVerbs and spinnerTipsOverride.
"""

from __future__ import annotations

import json
from pathlib import Path

import yaml

from pf.common.config import get_dist_root, get_project_root
from pf.common.themes import resolve_theme_path


def load_spinner_tips(project_root: Path | None = None) -> list[str]:
    """Load feature-discovery tips from data/spinner-tips.yaml.

    Checks .pennyfarthing/data/ first (runtime copy), then pennyfarthing-dist/data/
    (development). Returns empty list if file not found.

    Args:
        project_root: Project root (auto-detected if not provided)

    Returns:
        List of tip strings
    """
    root = project_root or get_project_root()

    # Runtime path (copied by pf init)
    runtime_path = root / ".pennyfarthing" / "data" / "spinner-tips.yaml"
    if runtime_path.is_file():
        return _parse_tips(runtime_path)

    # Development path via get_dist_root (npm or direct)
    dist_root = get_dist_root(project_root=root)
    if dist_root:
        dev_path = dist_root / "data" / "spinner-tips.yaml"
        if dev_path.is_file():
            return _parse_tips(dev_path)

    # Fallback: resolve relative to this module (works in inlined monorepo)
    # spinner.py → src/pf/common/ → walk up to pennyfarthing-dist/
    module_dir = Path(__file__).resolve().parent
    for ancestor in [module_dir] + list(module_dir.parents):
        candidate = ancestor / "data" / "spinner-tips.yaml"
        if candidate.is_file():
            return _parse_tips(candidate)
        if ancestor.name == "pennyfarthing-dist":
            break

    return []


def _parse_tips(path: Path) -> list[str]:
    """Parse tips from a YAML file."""
    try:
        data = yaml.safe_load(path.read_text())
        if isinstance(data, dict) and isinstance(data.get("tips"), list):
            return [str(t) for t in data["tips"] if t]
    except Exception:
        pass
    return []


def load_theme_spinner_verbs(
    theme_name: str, project_root: Path | None = None
) -> list[str]:
    """Load spinner_verbs from a theme YAML.

    Args:
        theme_name: Theme ID (e.g., 'discworld')
        project_root: Project root (auto-detected if not provided)

    Returns:
        List of verb strings, or empty list if theme has none
    """
    root = project_root or get_project_root()
    theme_path = resolve_theme_path(theme_name, project_root=root)
    if not theme_path:
        return []

    try:
        data = yaml.safe_load(theme_path.read_text())
        if isinstance(data, dict):
            theme_block = data.get("theme", {})
            verbs = theme_block.get("spinner_verbs")
            if isinstance(verbs, list):
                return [str(v) for v in verbs if v]
    except Exception:
        pass

    return []


def sync_spinner_settings(
    project_root: Path | None = None,
    theme_name: str | None = None,
) -> dict:
    """Sync spinner verbs and tips into .claude/settings.local.json.

    Read-modify-write: preserves all existing keys (hooks, permissions, etc.).

    - spinnerVerbs: theme verbs with mode "replace" (full immersion)
    - spinnerTipsOverride: feature tips mixed with CC defaults

    If the theme has no spinner_verbs, the spinnerVerbs key is removed
    (falls back to CC defaults).

    Args:
        project_root: Project root (auto-detected if not provided)
        theme_name: Theme to load verbs from (auto-detected from config if not provided)

    Returns:
        Result dict: {success, data?, error?}
    """
    root = project_root or get_project_root()

    # Resolve theme name
    if not theme_name:
        from pf.common.themes import get_current_theme

        theme_name = get_current_theme(project_root=root)

    settings_path = root / ".claude" / "settings.local.json"
    if not settings_path.is_file():
        return {"success": False, "error": "settings.local.json not found"}

    # Read existing settings
    try:
        settings = json.loads(settings_path.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        return {"success": False, "error": f"Failed to read settings: {exc}"}

    changed = False

    # --- Spinner verbs (theme-specific) ---
    if theme_name:
        verbs = load_theme_spinner_verbs(theme_name, project_root=root)
    else:
        verbs = []

    if verbs:
        new_verbs = {"mode": "replace", "verbs": verbs}
        if settings.get("spinnerVerbs") != new_verbs:
            settings["spinnerVerbs"] = new_verbs
            changed = True
    else:
        if "spinnerVerbs" in settings:
            del settings["spinnerVerbs"]
            changed = True

    # --- Spinner tips (feature discovery) ---
    tips = load_spinner_tips(project_root=root)
    if tips:
        new_tips = {"tips": tips, "excludeDefault": False}
        if settings.get("spinnerTipsOverride") != new_tips:
            settings["spinnerTipsOverride"] = new_tips
            changed = True
    else:
        if "spinnerTipsOverride" in settings:
            del settings["spinnerTipsOverride"]
            changed = True

    if not changed:
        return {"success": True, "data": {"changed": False}}

    # Write back
    try:
        settings_path.write_text(json.dumps(settings, indent=2) + "\n")
    except OSError as exc:
        return {"success": False, "error": f"Failed to write settings: {exc}"}

    return {
        "success": True,
        "data": {
            "changed": True,
            "has_verbs": bool(verbs),
            "verb_count": len(verbs),
            "tip_count": len(tips),
        },
    }
