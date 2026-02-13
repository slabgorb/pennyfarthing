"""Panel focus management — read/write focus key in config.local.yaml.

Story 104-1: pf bc CLI command + /bc user skill
Story 104-4: Save and clear named layouts via /bc
Epic: 104 — /bc CLI Panel Focus
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml


def _get_root() -> Path:
    """Get project root, falling back to cwd."""
    try:
        from pennyfarthing_scripts.common.config import get_project_root

        return get_project_root()
    except Exception:
        return Path.cwd()

VALID_PANELS = [
    "sprint",
    "git",
    "diffs",
    "todo",
    "workflow",
    "background",
    "audit-log",
    "changed",
    "ac",
    "debug",
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
        root = project_dir or _get_root()
        config_path = root / ".pennyfarthing" / "config.local.yaml"

        config: dict = {}
        if config_path.exists():
            try:
                existing = yaml.safe_load(config_path.read_text())
                if existing and isinstance(existing, dict):
                    config = existing
                elif existing is not None and not isinstance(existing, dict):
                    return {"success": False, "error": "Config is not a YAML mapping"}
            except yaml.YAMLError as exc:
                return {"success": False, "error": f"Failed to parse config: {exc}"}

        config["focus"] = panel_name

        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text(
            yaml.dump(config, default_flow_style=False, sort_keys=False)
        )

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

        config: dict = {}
        try:
            existing = yaml.safe_load(config_path.read_text())
            if existing and isinstance(existing, dict):
                config = existing
        except Exception:
            pass

        config.pop("focus", None)

        config_path.write_text(
            yaml.dump(config, default_flow_style=False, sort_keys=False)
        )

        return {"success": True, "message": "focus cleared"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


LAYOUT_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_]+$")


def _read_config(project_dir: Path | None = None) -> tuple[Path, dict]:
    """Read config.local.yaml, returning (path, config_dict)."""
    root = project_dir or _get_root()
    config_path = root / ".pennyfarthing" / "config.local.yaml"
    config: dict = {}
    if config_path.exists():
        existing = yaml.safe_load(config_path.read_text())
        if existing and isinstance(existing, dict):
            config = existing
    return config_path, config


def _write_config(config_path: Path, config: dict) -> None:
    """Write config dict to YAML file."""
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(
        yaml.dump(config, default_flow_style=False, sort_keys=False)
    )


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
            config = yaml.safe_load(config_path.read_text())
            if config and isinstance(config, dict):
                return {"success": True, "focus": config.get("focus")}
            return {"success": True, "focus": None}
        except Exception:
            return {"success": True, "focus": None}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
