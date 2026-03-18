"""
Settings logic for reading and writing .pennyfarthing/config.local.yaml.

Provides dot-path traversal for get/set operations with type coercion.
"""

from typing import Any

import yaml

from pf.common.config import get_project_root, load_pennyfarthing_config

# Top-level keys to show in `pf settings show` (skip layout/panel blobs)
SHOW_KEYS = (
    "theme",
    "permission_mode",
    "portrait_size",
    "portrait_position",
    "portrait_dock",
    "workflow",
    "tui",
    "jira",

    "split",
    "last_panel",
)

# Default values for all known settings
DEFAULTS: dict[str, Any] = {
    "theme": "firefly",
    "permission_mode": "standard",
    "workflow": {
        "git_monitor": False,
        "relay_mode": False,
        "permission_mode": "standard",
        "pr_mode": "draft",
        "pr_merge": "auto",
        "tui_statusbar": True,
        "statusbar": True,
        "startup_agent": "sm",
        "saddle_mode": False,
        "reviewer_subagents": {
            "preflight": True,
            "edge_hunter": True,
            "silent_failure_hunter": True,
            "test_analyzer": True,
            "comment_analyzer": True,
            "type_design": True,
            "security": True,
            "simplifier": True,
            "rule_checker": True,
        },
    },
    "jira": {
        "project": "MSSCI",
        "url": "https://1898andco.atlassian.net",
    },

    "portrait_size": "auto",
    "portrait_position": "left",
    "portrait_dock": "top",
    "tui": {
        "toasts": False,
    },
    "peloton": {
        "layout": "grid",
    },
    "last_panel": "sprint",
}


def _coerce_value(value: str) -> Any:
    """Coerce a string value to bool, int, or leave as str."""
    lower = value.lower()
    if lower == "true":
        return True
    if lower == "false":
        return False
    try:
        return int(value)
    except ValueError:
        return value


def _get_by_path(data: dict, key: str) -> Any:
    """Traverse a dict by dot-separated path.

    Returns the value at the path, or raises KeyError if not found.
    """
    parts = key.split(".")
    current: Any = data
    for part in parts:
        if not isinstance(current, dict) or part not in current:
            raise KeyError(key)
        current = current[part]
    return current


def _set_by_path(data: dict, key: str, value: Any) -> None:
    """Set a value in a dict by dot-separated path, creating intermediates."""
    parts = key.split(".")
    current = data
    for part in parts[:-1]:
        if part not in current or not isinstance(current[part], dict):
            current[part] = {}
        current = current[part]
    current[parts[-1]] = value


def get_setting(key: str) -> Any:
    """Get a setting value by dot-path, falling back to DEFAULTS."""
    config = load_pennyfarthing_config()
    merged = _deep_merge(DEFAULTS, config)
    return _get_by_path(merged, key)


def set_setting(key: str, value: str) -> dict:
    """Set a setting value by dot-path. Returns the updated config."""
    root = get_project_root()
    config_path = root / ".pennyfarthing" / "config.local.yaml"

    config = load_pennyfarthing_config(root)
    coerced = _coerce_value(value)
    _set_by_path(config, key, coerced)

    config_path.parent.mkdir(parents=True, exist_ok=True)
    with open(config_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)

    return config


def set_setting_typed(key: str, value: Any) -> dict:
    """Set a setting value by dot-path without string coercion.

    Like set_setting() but takes a native Python value (bool, str, int)
    directly — no _coerce_value() pass. Use this when the value already
    has the correct type (e.g. from a Switch or Select widget).
    """
    root = get_project_root()
    config_path = root / ".pennyfarthing" / "config.local.yaml"

    config = load_pennyfarthing_config(root)
    _set_by_path(config, key, value)

    config_path.parent.mkdir(parents=True, exist_ok=True)
    with open(config_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)

    return config


def _deep_merge(base: dict, override: dict) -> dict:
    """Deep-merge override into base, returning a new dict."""
    result = dict(base)
    for k, v in override.items():
        if k in result and isinstance(result[k], dict) and isinstance(v, dict):
            result[k] = _deep_merge(result[k], v)
        else:
            result[k] = v
    return result


def show_settings() -> str:
    """Format all settings with defaults, annotating which are user-set."""
    config = load_pennyfarthing_config()
    merged = _deep_merge(DEFAULTS, config)
    lines: list[str] = []

    for key in SHOW_KEYS:
        if key not in merged:
            continue
        val = merged[key]
        is_set = key in config
        suffix = "" if is_set else "  # (default)"
        if isinstance(val, dict):
            lines.append(f"{key}:")
            user_dict = config.get(key, {}) if isinstance(config.get(key), dict) else {}
            for k, v in val.items():
                k_suffix = "" if k in user_dict else "  # (default)"
                if isinstance(v, dict):
                    nested = yaml.dump({k: v}, default_flow_style=False, sort_keys=False)
                    for i, line in enumerate(nested.rstrip().split("\n")):
                        lines.append(f"  {line}{k_suffix if i == 0 else ''}")
                else:
                    lines.append(f"  {k}: {v}{k_suffix}")
        else:
            lines.append(f"{key}: {val}{suffix}")

    return "\n".join(lines) if lines else "(no settings found)"
