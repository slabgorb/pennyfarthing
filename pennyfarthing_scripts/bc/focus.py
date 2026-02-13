"""Panel focus management — read/write focus key in config.local.yaml.

Story 104-1: pf bc CLI command + /bc user skill
Epic: 104 — /bc CLI Panel Focus
"""

from __future__ import annotations

from pathlib import Path

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
    raise NotImplementedError("set_panel_focus not implemented")


def clear_panel_focus(project_dir: Path | None = None) -> dict:
    """Clear focus setting from config.local.yaml.

    Args:
        project_dir: Override project root (for testing)

    Returns:
        {success: bool, message?: str, error?: str}
    """
    raise NotImplementedError("clear_panel_focus not implemented")


def get_panel_focus(project_dir: Path | None = None) -> dict:
    """Read current focus setting from config.local.yaml.

    Args:
        project_dir: Override project root (for testing)

    Returns:
        {success: bool, focus?: str|None, error?: str}
    """
    raise NotImplementedError("get_panel_focus not implemented")
