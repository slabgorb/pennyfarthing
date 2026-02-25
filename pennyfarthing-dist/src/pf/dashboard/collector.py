"""Dashboard data collectors.

Story 132-11: Build pf status dashboard command.

Each collector gathers data from one subsystem and returns
a dict with 'display' (str) and 'data' (dict) keys.
Collectors must be non-fatal: missing subsystems return
graceful fallback values.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any


def collect_all(project_root: Path) -> dict[str, Any]:
    """Collect all dashboard fields from subsystems."""
    return {}


def collect_theme(project_root: Path) -> dict[str, Any]:
    """Collect theme name and tier."""
    return {}


def collect_workflow(project_root: Path) -> dict[str, Any]:
    """Collect active workflow status."""
    return {}


def collect_sprint(project_root: Path) -> dict[str, Any]:
    """Collect current sprint info."""
    return {}


def collect_story(project_root: Path) -> dict[str, Any]:
    """Collect active story info."""
    return {}


def collect_hooks(project_root: Path) -> dict[str, Any]:
    """Collect Claude Code hooks status."""
    return {}


def collect_tui(project_root: Path) -> dict[str, Any]:
    """Collect TUI/WheelHub running status."""
    return {}


def collect_repos(project_root: Path) -> dict[str, Any]:
    """Collect repo branch and clean/dirty status."""
    return {}


def collect_health(project_root: Path) -> dict[str, Any]:
    """Collect doctor health check summary."""
    return {}


def format_dashboard(data: dict[str, Any]) -> str:
    """Format collected data into aligned text output."""
    return ""
