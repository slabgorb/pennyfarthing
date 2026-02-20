"""Panel focus management — read/write focus key in config.local.yaml.

Story 104-1: pf bc CLI command + /bc user skill
Story 104-4: Save and clear named layouts via /bc
Epic: 104 — /bc CLI Panel Focus
"""

from __future__ import annotations

import io
import re
from pathlib import Path

from ruamel.yaml import YAML


def _get_root() -> Path:
    """Get project root, falling back to cwd."""
    try:
        from pf.common.config import get_project_root

        return get_project_root()
    except Exception:
        return Path.cwd()

VALID_PANELS = [
    "sprint",
    "git",
    "diffs",
    "todo",
    "workflow",
    "audit-log",
    "ac",
    "debug",
    "progress",
    "settings",
    "tty",
]


def set_panel_focus(panel_name: str, project_dir: Path | None = None) -> dict:
    """Set focus panel in config.local.yaml.

    Args:
        panel_name: Panel to focus on (must be in VALID_PANELS)
        project_dir: Override project root (for testing)

    Returns:
        {success: bool, data?: str, error?: str}
    """
    if panel_name not in VALID_PANELS:
        return {
            "success": False,
            "error": f"Invalid panel '{panel_name}'. Valid panels: {', '.join(VALID_PANELS)}",
        }

    try:
        config_path, config = _read_config(project_dir)
        if config is None:
            return {"success": False, "error": "Config is not a YAML mapping"}
        config["focus"] = panel_name
        _write_config(config_path, config)
        return {"success": True, "data": panel_name}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def clear_panel_focus(project_dir: Path | None = None) -> dict:
    """Clear focus setting from config.local.yaml.

    Args:
        project_dir: Override project root (for testing)

    Returns:
        {success: bool, message?: str, error?: str}
    """
    try:
        root = project_dir or _get_root()
        config_path = root / ".pennyfarthing" / "config.local.yaml"

        if not config_path.exists():
            return {"success": True, "message": "No focus setting to clear"}

        config_path, config = _read_config(project_dir)
        if config is None:
            config = _make_yaml().load("{}")
        if "focus" in config:
            del config["focus"]
        _write_config(config_path, config)

        return {"success": True, "message": "focus cleared"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


LAYOUT_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_]+$")


def _make_yaml() -> YAML:
    """Create a configured ruamel.yaml instance that preserves formatting."""
    yml = YAML()
    yml.preserve_quotes = True
    yml.default_flow_style = False
    yml.width = 4096
    yml.indent(mapping=2, sequence=4, offset=2)
    return yml


def _read_config(project_dir: Path | None = None):
    """Read config.local.yaml using ruamel.yaml to preserve formatting.

    Returns:
        (config_path, config) where config is a CommentedMap or None if invalid.
    """
    root = project_dir or _get_root()
    config_path = root / ".pennyfarthing" / "config.local.yaml"
    yml = _make_yaml()
    if config_path.exists():
        config = yml.load(config_path.read_text())
        if config is None:
            config = yml.load("{}")
        return config_path, config
    return config_path, yml.load("{}")


def _write_config(config_path: Path, config) -> None:
    """Write config to YAML file, preserving formatting via ruamel.yaml."""
    config_path.parent.mkdir(parents=True, exist_ok=True)
    yml = _make_yaml()
    stream = io.StringIO()
    yml.dump(config, stream)
    config_path.write_text(stream.getvalue())


def validate_layout_name(name: str) -> bool:
    """Validate a layout name (alphanumeric + underscore only).

    Args:
        name: Layout name to validate

    Returns:
        True if valid, False otherwise
    """
    return bool(LAYOUT_NAME_PATTERN.match(name))


def save_named_layout(
    name: str, layout_data: dict, project_dir: Path | None = None
) -> dict:
    """Save a named layout to config.local.yaml.

    Args:
        name: Layout name (must match LAYOUT_NAME_PATTERN)
        layout_data: Serialized dockview layout
        project_dir: Override project root (for testing)

    Returns:
        {success: bool, data?: str, error?: str}
    """
    if not validate_layout_name(name):
        return {"success": False, "error": f"Invalid layout name '{name}'"}
    try:
        config_path, config = _read_config(project_dir)
        if "layouts" not in config or not isinstance(config.get("layouts"), dict):
            config["layouts"] = {}
        config["layouts"][name] = layout_data
        _write_config(config_path, config)
        return {"success": True, "data": name}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def load_named_layout(name: str, project_dir: Path | None = None) -> dict:
    """Load a named layout from config.local.yaml.

    Args:
        name: Layout name to load
        project_dir: Override project root (for testing)

    Returns:
        {success: bool, data?: dict, error?: str}
    """
    if not validate_layout_name(name):
        return {"success": False, "error": f"Invalid layout name '{name}'"}
    try:
        _, config = _read_config(project_dir)
        layouts = config.get("layouts")
        if not isinstance(layouts, dict) or name not in layouts:
            return {"success": False, "error": f"Layout '{name}' not found"}
        return {"success": True, "data": layouts[name]}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def list_named_layouts(project_dir: Path | None = None) -> dict:
    """List all saved named layouts.

    Args:
        project_dir: Override project root (for testing)

    Returns:
        {success: bool, data?: list[str], error?: str}
    """
    try:
        _, config = _read_config(project_dir)
        layouts = config.get("layouts")
        if not isinstance(layouts, dict):
            return {"success": True, "data": []}
        return {"success": True, "data": list(layouts.keys())}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def clear_named_layout(name: str, project_dir: Path | None = None) -> dict:
    """Delete a specific named layout from config.local.yaml.

    Args:
        name: Layout name to delete
        project_dir: Override project root (for testing)

    Returns:
        {success: bool, message?: str, error?: str}
    """
    if not validate_layout_name(name):
        return {"success": False, "error": f"Invalid layout name '{name}'"}
    try:
        config_path, config = _read_config(project_dir)
        layouts = config.get("layouts")
        if not isinstance(layouts, dict) or name not in layouts:
            return {"success": False, "error": f"Layout '{name}' not found"}
        del config["layouts"][name]
        _write_config(config_path, config)
        return {"success": True, "message": f"Layout '{name}' cleared"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def clear_all_named_layouts(project_dir: Path | None = None) -> dict:
    """Delete all named layouts from config.local.yaml.

    Args:
        project_dir: Override project root (for testing)

    Returns:
        {success: bool, message?: str, error?: str}
    """
    try:
        config_path, config = _read_config(project_dir)
        config.pop("layouts", None)
        _write_config(config_path, config)
        return {"success": True, "message": "All layouts cleared"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def get_last_panel(project_dir: Path | None = None) -> dict:
    """Read last_panel from config.local.yaml.

    Story 103-8: Panel persistence — single source of truth for last-viewed
    panel, shared between ERB and TUI.

    Args:
        project_dir: Override project root (for testing)

    Returns:
        {success: bool, last_panel?: str|None, error?: str}
    """
    try:
        _, config = _read_config(project_dir)
        last_panel = config.get("last_panel") if config else None
        if last_panel is not None and last_panel not in VALID_PANELS:
            return {"success": True, "last_panel": None}
        return {"success": True, "last_panel": last_panel}
    except Exception:
        return {"success": True, "last_panel": None}


def save_last_panel(panel_name: str, project_dir: Path | None = None) -> dict:
    """Save last_panel to config.local.yaml.

    Story 103-8: Panel persistence — persists the active panel so it can
    be restored on next launch. Shared between ERB and TUI.

    Args:
        panel_name: Panel ID to persist (must be in VALID_PANELS)
        project_dir: Override project root (for testing)

    Returns:
        {success: bool, data?: str, error?: str}
    """
    if panel_name not in VALID_PANELS:
        return {
            "success": False,
            "error": f"Invalid panel '{panel_name}'. Valid panels: {', '.join(VALID_PANELS)}",
        }

    try:
        config_path, config = _read_config(project_dir)
        if config is None:
            config = _make_yaml().load("{}")
        config["last_panel"] = panel_name
        _write_config(config_path, config)
        return {"success": True, "data": panel_name}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def get_panel_focus(project_dir: Path | None = None) -> dict:
    """Read current focus setting from config.local.yaml.

    Args:
        project_dir: Override project root (for testing)

    Returns:
        {success: bool, focus?: str|None, error?: str}
    """
    try:
        root = project_dir or _get_root()
        config_path = root / ".pennyfarthing" / "config.local.yaml"

        if not config_path.exists():
            return {"success": True, "focus": None}

        try:
            _, config = _read_config(project_dir)
            if config is not None:
                return {"success": True, "focus": config.get("focus")}
            return {"success": True, "focus": None}
        except Exception:
            return {"success": True, "focus": None}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
