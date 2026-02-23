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


def get_dist_root(project_root: Path | None = None) -> Path | None:
    """Resolve the pennyfarthing-dist directory.

    Checks multiple locations to support both monorepo development
    and npm-installed consumer projects:
      1. {project_root}/pennyfarthing-dist/ (monorepo or symlink)
      2. {project_root}/node_modules/@pennyfarthing/core/pennyfarthing-dist/ (npm)
      3. Relative to this file (when running from within pennyfarthing-dist/pf/)

    Args:
        project_root: Project root path (defaults to auto-detect)

    Returns:
        Path to pennyfarthing-dist directory, or None if not found
    """
    try:
        root = (project_root or get_project_root()).resolve()
    except FileNotFoundError:
        return None

    # 1. Direct: monorepo layout or symlink at project root
    direct = root / "pennyfarthing-dist"
    if direct.is_dir():
        return direct

    # 2. npm-installed: node_modules/@pennyfarthing/core/pennyfarthing-dist/
    npm = root / "node_modules" / "@pennyfarthing" / "core" / "pennyfarthing-dist"
    if npm.is_dir():
        return npm

    # 3. Relative to this file (when inside pennyfarthing-dist/pf/)
    # Only use this fallback when no explicit project_root was given,
    # since an explicit root scopes the search to that directory.
    if project_root is None:
        this_file = Path(__file__).resolve()
        # __file__ is pennyfarthing-dist/pf/common/config.py → up 3 levels
        candidate = this_file.parent.parent.parent
        if candidate.name == "pennyfarthing-dist" and candidate.is_dir():
            return candidate

    return None


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


def load_pennyfarthing_config(project_root: Path | None = None) -> dict[str, Any]:
    """Load .pennyfarthing/config.local.yaml.

    Args:
        project_root: Project root path (defaults to auto-detect)

    Returns:
        Config dict, or empty dict if not found
    """
    root = project_root or get_project_root()
    config_path = root / ".pennyfarthing" / "config.local.yaml"
    return load_yaml_config(config_path) or {}


def save_pennyfarthing_config_key(
    key: str, value: Any, project_root: Path | None = None
) -> None:
    """Set a top-level key in .pennyfarthing/config.local.yaml.

    Creates the file if it doesn't exist. Preserves existing keys.

    Args:
        key: Top-level key (e.g., "sprint")
        value: Value to set (dict, str, etc.)
        project_root: Project root path (defaults to auto-detect)
    """
    root = project_root or get_project_root()
    config_path = root / ".pennyfarthing" / "config.local.yaml"

    config = load_yaml_config(config_path) or {}
    config[key] = value

    config_path.parent.mkdir(parents=True, exist_ok=True)
    with open(config_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)
