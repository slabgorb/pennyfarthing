"""
Configuration loading utilities for Pennyfarthing scripts.

Provides YAML config loading with graceful degradation for missing files.
"""

from pathlib import Path
from typing import Any

import yaml


def get_project_root(start_dir: Path | None = None) -> Path:
    """Find the Pennyfarthing project root.

    Walks up from start_dir (or cwd) looking for .pennyfarthing directory.

    Args:
        start_dir: Directory to start search from (defaults to cwd)

    Returns:
        Path to project root directory

    Raises:
        FileNotFoundError: If no .pennyfarthing directory found
    """
    current = Path(start_dir) if start_dir else Path.cwd()
    current = current.resolve()

    while current != current.parent:
        if (current / ".pennyfarthing").is_dir():
            return current
        current = current.parent

    raise FileNotFoundError("Could not find project root (no .pennyfarthing/ directory found)")


# Alias for backwards compatibility
find_project_root = get_project_root


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
