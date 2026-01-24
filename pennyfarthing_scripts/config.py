"""
Configuration loading utilities for Pennyfarthing scripts.

Provides YAML config loading with graceful degradation for missing files.
"""

from pathlib import Path
from typing import Any

import yaml


def get_project_root() -> Path:
    """Find the Pennyfarthing project root.

    Walks up from current file looking for package.json marker.

    Returns:
        Path to project root directory
    """
    current = Path(__file__).resolve().parent
    while current != current.parent:
        if (current / "package.json").exists():
            return current
        current = current.parent
    # Fallback to parent of pennyfarthing_scripts
    return Path(__file__).resolve().parent.parent


def load_yaml_config(path: Path) -> dict[str, Any] | None:
    """Load a YAML configuration file.

    Args:
        path: Path to the YAML file

    Returns:
        Parsed YAML as dict, or None if file doesn't exist
    """
    if not path.exists():
        return None

    with open(path, "r") as f:
        return yaml.safe_load(f)


def load_pennyfarthing_config() -> dict[str, Any]:
    """Load .pennyfarthing/config.local.yaml.

    Returns:
        Config dict, or empty dict if not found
    """
    config_path = get_project_root() / ".pennyfarthing" / "config.local.yaml"
    return load_yaml_config(config_path) or {}
