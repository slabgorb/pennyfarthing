"""
Phase-scoped Team Lifecycle for Story 86-10.

Manages the lifecycle of native Agent Teams within workflow phases.
When a workflow phase has a `team:` config block, the lead agent creates
a team at phase start, spawns teammates, and cleans up before handoff.

Python port of packages/core/dist/workflow/team-lifecycle.js.
"""

from __future__ import annotations

from datetime import UTC, datetime
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
    _active_teams.clear()
    _sidecar_locks.clear()


async def create_team(
    phase: dict[str, Any],
    story_id: str,
    adapter: Any | None = None,
    *,
    scope: str = "phase",
) -> dict[str, Any]:
    """Create a phase-scoped or step-scoped team.

    If phase/step has no team config, returns success with no handle (no-op).
    If it has team config, creates team and returns handle.

    Args:
        phase: Phase or step config dict with 'name' and optional 'team' keys.
        story_id: Story identifier.
        adapter: Optional team adapter for external calls.
        scope: 'phase' (default) or 'step' for step-scoped teams.
    """
    if not phase.get("team"):
        return {"success": True}

    team_name = f"{story_id}-{phase['name']}"

    # Clean up existing team for same story
    existing = _active_teams.get(story_id)
    if existing and adapter:
        try:
            await adapter.delete_team(existing["teamName"])
        except Exception:
            pass
        del _active_teams[story_id]

    handle: dict[str, Any] = {
        "teamName": team_name,
        "storyId": story_id,
        "phase": phase["name"],
        "scope": scope,
        "teammates": [],
        "createdAt": datetime.now(UTC).isoformat(),
    }

    if adapter:
        try:
            await adapter.create_team({"teamName": team_name})
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    _active_teams[story_id] = handle
    return {"success": True, "data": handle}


async def spawn_teammates(
    handle: dict[str, Any],
    config: dict[str, Any],
    story_id: str,
    phase: dict[str, Any],
    adapter: Any | None = None,
) -> dict[str, Any]:
    """Spawn all teammates for a team based on workflow YAML config."""
    teammates: list[dict[str, Any]] = []

    for member in config["teammates"]:
        teammate: dict[str, Any] = {
            "agent": member["agent"],
            "task": member["task"],
            "status": "spawned",
        }
        if adapter:
            try:
                await adapter.spawn_teammate({
                    "teamName": handle["teamName"],
                    "agent": member["agent"],
                    "prompt": f'pf agent start "{member["agent"]}"',
                    "model": config.get("model"),
                })
            except Exception:
                teammate["status"] = "crashed"
        teammates.append(teammate)

    handle["teammates"] = teammates

    # Update registry
    if handle.get("storyId") in _active_teams:
        _active_teams[handle["storyId"]] = handle

    return {"success": True, "data": teammates}


async def shutdown_all_teammates(
    handle: dict[str, Any],
    adapter: Any | None = None,
) -> dict[str, Any]:
    """Shut down all active teammates in a team."""
    shutdown_count = 0

    for teammate in handle["teammates"]:
        if teammate["status"] in ("shutdown", "crashed"):
            continue
        if adapter:
            try:
                await adapter.shutdown_teammate({
                    "teamName": handle["teamName"],
                    "agent": teammate["agent"],
                })
            except Exception:
                pass  # Graceful degradation — swallow adapter errors
        teammate["status"] = "shutdown"
        shutdown_count += 1

    return {"success": True, "data": {"shutdownCount": shutdown_count}}


async def cleanup_team(
    handle: dict[str, Any],
    adapter: Any | None = None,
) -> dict[str, Any]:
    """Clean up a team entirely (TeamDelete). Must run before pf handoff."""
    if adapter:
        try:
            await adapter.delete_team(handle["teamName"])
        except Exception:
            pass

    _active_teams.pop(handle.get("storyId", ""), None)
    return {"success": True, "data": {"cleaned": True}}


def check_gate_on_task_completed(
    handle: dict[str, Any],
    phase: dict[str, Any],
) -> dict[str, Any]:
    """Check gate condition when a TaskCompleted event fires."""
    if not phase.get("gate"):
        return {"passed": True, "gate": "none"}

    gate_type = phase["gate"].get("type", "unknown")
    has_active = any(t["status"] == "active" for t in handle["teammates"])

    if has_active:
        return {"passed": False, "gate": gate_type, "reason": "Teammates still active"}

    return {"passed": True, "gate": gate_type}


def check_gate_on_teammate_idle(
    handle: dict[str, Any],
    teammate: dict[str, Any],
    phase: dict[str, Any],
) -> dict[str, Any]:
    """Check gate condition when a TeammateIdle event fires."""
    if not phase.get("gate"):
        return {"passed": True, "gate": "none"}

    gate_type = phase["gate"].get("type", "unknown")

    if teammate["status"] == "crashed":
        return {"passed": False, "gate": gate_type, "reason": "Teammate crashed"}

    return {"passed": True, "gate": gate_type}


def generate_team_summary(handle: dict[str, Any]) -> dict[str, Any]:
    """Generate a team activity summary for the session file audit trail."""
    return {
        "teamName": handle["teamName"],
        "storyId": handle["storyId"],
        "phase": handle["phase"],
        "scope": handle.get("scope", "phase"),
        "members": [
            {"agent": t["agent"], "status": t["status"], "task": t["task"]}
            for t in handle["teammates"]
        ],
        "cleanShutdown": all(t["status"] == "shutdown" for t in handle["teammates"]),
    }


def acquire_sidecar_lock(
    file_path: str,
    story_id: str,
    timeout: int = 5000,
) -> dict[str, Any]:
    """Acquire an exclusive lock for sidecar file writing."""
    existing = _sidecar_locks.get(file_path)
    if existing:
        if existing["storyId"] == story_id:
            return {"success": True, "data": existing}
        return {"success": False, "error": f"Lock held by story {existing['storyId']}"}

    lock: dict[str, Any] = {
        "lockPath": f"{file_path}.lock",
        "storyId": story_id,
        "acquiredAt": datetime.now(UTC).isoformat(),
    }
    _sidecar_locks[file_path] = lock
    return {"success": True, "data": lock}


def release_sidecar_lock(lock: dict[str, Any]) -> dict[str, Any]:
    """Release a sidecar file lock."""
    for path, held in list(_sidecar_locks.items()):
        if held["lockPath"] == lock["lockPath"]:
            del _sidecar_locks[path]
            break
    return {"success": True}


def get_active_team(story_id: str) -> dict[str, Any] | None:
    """Get the active team for a story, if any."""
    return _active_teams.get(story_id)


def update_session_with_summary(
    session_path: str | Path,
    summary: dict[str, Any],
) -> dict[str, Any]:
    """Write team activity summary to session file for audit trail."""
    path = Path(session_path)
    content = path.read_text() if path.exists() else ""

    lines = [
        "\n## Team Activity Summary\n",
        f"**Team:** {summary['teamName']}",
        f"**Phase:** {summary['phase']}",
        f"**Clean Shutdown:** {'Yes' if summary.get('cleanShutdown') else 'No'}\n",
        "| Agent | Status | Task |",
        "|-------|--------|------|",
    ]
    for member in summary.get("members", []):
        lines.append(f"| {member['agent']} | {member['status']} | {member['task']} |")

    content += "\n".join(lines) + "\n"
    path.write_text(content)
    return {"success": True}
