"""
Configuration loading utilities for Pennyfarthing scripts.

Provides YAML config loading with graceful degradation for missing files.
"""

import os
from pathlib import Path
from typing import Any

import yaml

from pf import paths


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

    # First pass: prefer pennyfarthing-dist/ (legacy framework-repo layout) or
    # .claude-plugin/ (plugin repo root). Must be a real directory, not a
    # symlink (symlinks indicate consumer context).
    check = current
    while check != check.parent:
        candidate = check / "pennyfarthing-dist"
        if candidate.is_dir() and not candidate.is_symlink():
            return check
        if (check / ".claude-plugin").is_dir():
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
    """Resolve the plugin root, which holds the framework content directories.

    In the plugin model, content (agents/, commands/, skills/, gates/,
    guides/, workflows/, personas/, templates/, output-styles/, schemas/,
    scripts/, data/) lives at the plugin root — the directory that also
    contains ``.claude-plugin/`` and ``runtime/``.

    Resolution order:
      1. ``CLAUDE_PLUGIN_ROOT`` (set by Claude Code in plugin context), when
         it actually contains content (``agents/``).
      2. Relative to this file: ``runtime/src/pf/common/config.py`` → up 5
         levels to the plugin root. Covers the §5.2 user shim and any
         non-hook invocation where ``CLAUDE_PLUGIN_ROOT`` is unset.

    The ``project_root`` argument is retained for signature compatibility but
    is no longer used: framework content is bundled with the plugin, not the
    consumer's project.

    Returns the plugin root ``Path``, or ``None`` if content cannot be found.
    """
    env_root = os.environ.get("CLAUDE_PLUGIN_ROOT")
    if env_root:
        candidate = Path(env_root).resolve()
        if (candidate / "agents").is_dir():
            return candidate

    # config.py → common → pf → src → runtime → <plugin root>
    plugin_root = Path(__file__).resolve().parents[4]
    if (plugin_root / "agents").is_dir() and (plugin_root / "commands").is_dir():
        return plugin_root

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
    config_path = paths.config_path(root)
    return load_yaml_config(config_path) or {}


def save_pennyfarthing_config_key(key: str, value: Any, project_root: Path | None = None) -> None:
    """Set a top-level key in .pennyfarthing/config.local.yaml.

    Creates the file if it doesn't exist. Preserves existing keys.

    Args:
        key: Top-level key (e.g., "sprint")
        value: Value to set (dict, str, etc.)
        project_root: Project root path (defaults to auto-detect)
    """
    root = project_root or get_project_root()
    config_path = paths.config_path(root)

    config = load_yaml_config(config_path) or {}
    config[key] = value

    config_path.parent.mkdir(parents=True, exist_ok=True)
    with open(config_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)
