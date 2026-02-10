"""
Configuration loading utilities for Pennyfarthing scripts.

Provides YAML config loading with graceful degradation for missing files.
"""

import os
from pathlib import Path
from typing import Any

import yaml


def get_project_root(start_dir: Path | None = None) -> Path:
    """Find the Pennyfarthing project root.

    Detection order:
      1. Environment override (PROJECT_ROOT or CLAUDE_PROJECT_DIR)
      2. Marker walk-up from start_dir/cwd

    Marker preference: pennyfarthing-dist/ (non-symlink) before .pennyfarthing/.
    This avoids confusion in nested repos where an orchestrator-level
    .pennyfarthing/ exists above the framework's pennyfarthing-dist/.

    Args:
        start_dir: Directory to start search from (defaults to cwd)

    Returns:
        Path to project root directory

    Raises:
        FileNotFoundError: If no project root found
    """
    # Layer 1: Environment (caller already knows)
    if env_root := os.environ.get("PROJECT_ROOT"):
        return Path(env_root).resolve()
    if env_root := os.environ.get("CLAUDE_PROJECT_DIR"):
        return Path(env_root).resolve()

    # Layer 2: Marker detection (pennyfarthing-dist first, then .pennyfarthing)
    current = (Path(start_dir) if start_dir else Path.cwd()).resolve()

    # First pass: prefer pennyfarthing-dist/ (framework repo)
    # Must be a real directory, not a symlink (symlinks indicate consumer context)
    check = current
    while check != check.parent:
        candidate = check / "pennyfarthing-dist"
        if candidate.is_dir() and not candidate.is_symlink():
            return check
        check = check.parent

    # Second pass: fall back to .pennyfarthing/ (consumer/orchestrator)
    check = current
    while check != check.parent:
        if (check / ".pennyfarthing").is_dir():
            return check
        check = check.parent

    raise FileNotFoundError(
        "Could not find project root (no pennyfarthing-dist/ or .pennyfarthing/ directory found).\n"
        "If this is a fresh clone, run: just setup"
    )


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

    with open(path) as f:
        return yaml.safe_load(f)


def load_pennyfarthing_config() -> dict[str, Any]:
    """Load .pennyfarthing/config.local.yaml.

    Returns:
        Config dict, or empty dict if not found
    """
    config_path = get_project_root() / ".pennyfarthing" / "config.local.yaml"
    return load_yaml_config(config_path) or {}
