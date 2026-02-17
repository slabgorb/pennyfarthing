"""
Phase-scoped Team Lifecycle for Story 86-10.

Manages the lifecycle of native Agent Teams within workflow phases.
When a workflow phase has a `team:` config block, the lead agent creates
a team at phase start, spawns teammates, and cleans up before handoff.

Python port of packages/core/dist/workflow/team-lifecycle.js.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any


# =============================================================================
# In-memory registries
# =============================================================================

_active_teams: dict[str, dict[str, Any]] = {}
"""Active teams keyed by story_id."""

_sidecar_locks: dict[str, dict[str, Any]] = {}
"""Sidecar locks keyed by file path."""


def _reset_for_testing() -> None:
    """Reset all in-memory state. For testing only."""
    # TODO: implement
    pass


async def create_team(
    phase: dict[str, Any],
    story_id: str,
    adapter: Any | None = None,
) -> dict[str, Any]:
    """Create a phase-scoped team.

    If phase has no team config, returns success with no handle (no-op).
    If phase has team config, creates team and returns handle.
    """
    # TODO: implement
    return {}


async def spawn_teammates(
    handle: dict[str, Any],
    config: dict[str, Any],
    story_id: str,
    phase: dict[str, Any],
    adapter: Any | None = None,
) -> dict[str, Any]:
    """Spawn all teammates for a team based on workflow YAML config."""
    # TODO: implement
    return {}


async def shutdown_all_teammates(
    handle: dict[str, Any],
    adapter: Any | None = None,
) -> dict[str, Any]:
    """Shut down all active teammates in a team."""
    # TODO: implement
    return {}


async def cleanup_team(
    handle: dict[str, Any],
    adapter: Any | None = None,
) -> dict[str, Any]:
    """Clean up a team entirely (TeamDelete). Must run before pf handoff."""
    # TODO: implement
    return {}


def check_gate_on_task_completed(
    handle: dict[str, Any],
    phase: dict[str, Any],
) -> dict[str, Any]:
    """Check gate condition when a TaskCompleted event fires."""
    # TODO: implement
    return {}


def check_gate_on_teammate_idle(
    handle: dict[str, Any],
    teammate: dict[str, Any],
    phase: dict[str, Any],
) -> dict[str, Any]:
    """Check gate condition when a TeammateIdle event fires."""
    # TODO: implement
    return {}


def generate_team_summary(handle: dict[str, Any]) -> dict[str, Any]:
    """Generate a team activity summary for the session file audit trail."""
    # TODO: implement
    return {}


def acquire_sidecar_lock(
    file_path: str,
    story_id: str,
    timeout: int = 5000,
) -> dict[str, Any]:
    """Acquire an exclusive lock for sidecar file writing."""
    # TODO: implement
    return {}


def release_sidecar_lock(lock: dict[str, Any]) -> dict[str, Any]:
    """Release a sidecar file lock."""
    # TODO: implement
    return {}


def get_active_team(story_id: str) -> dict[str, Any] | None:
    """Get the active team for a story, if any."""
    # TODO: implement
    return None


def update_session_with_summary(
    session_path: str | Path,
    summary: dict[str, Any],
) -> dict[str, Any]:
    """Write team activity summary to session file for audit trail."""
    # TODO: implement
    return {}
