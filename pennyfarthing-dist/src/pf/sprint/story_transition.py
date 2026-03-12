"""Story lifecycle state machine with transition validation.

Story: MSSCI-15428 - Implement story lifecycle state machine

Provides:
- TRANSITIONS: valid state transitions map
- transition_story(project_root, story_id, target_status, ...) -> dict
"""

from datetime import date
from pathlib import Path
from typing import Any

from pf.jira.client import get_client
from pf.sprint.loader import find_epic, find_story
from pf.sprint.yaml_io import read_sprint, write_sprint

# Valid transitions: from_status -> set of allowed to_statuses
TRANSITIONS: dict[str, set[str]] = {
    "backlog": {"in_progress", "canceled"},
    "in_progress": {"in_review", "canceled"},
    "in_review": {"done", "canceled"},
    "done": {"canceled"},
    "canceled": set(),
}

_JIRA_STATUS: dict[str, str] = {
    "backlog": "To Do",
    "in_progress": "In Progress",
    "in_review": "In Review",
    "done": "Done",
    "canceled": "Canceled",
}


def transition_story(
    project_root: Path,
    story_id: str,
    target_status: str,
    *,
    reason: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Transition a story to a new status.

    Ordering: YAML first (most important), then Jira (external).
    If Jira fails, YAML change persists and result reports partial failure.
    """
    # Validate story_id format
    parts = story_id.split("-")
    if len(parts) < 2 or not parts[0].isdigit():
        return {
            "success": False,
            "story_id": story_id,
            "error": f"Invalid story ID format: {story_id}",
            "steps": [],
        }

    # Load sprint data and find story
    sprint_path = project_root / "sprint" / "current-sprint.yaml"
    data = read_sprint(sprint_path)
    epic = find_epic(data, parts[0])
    story = find_story(epic, story_id) if epic else None

    if not story:
        return {
            "success": False,
            "story_id": story_id,
            "error": f"Story {story_id} not found in sprint YAML",
            "steps": [],
        }

    from_status = story["status"]
    jira_key = story.get("jira")

    # Validate transition is legal
    valid_targets = TRANSITIONS.get(from_status, set())
    if target_status not in valid_targets:
        return {
            "success": False,
            "story_id": story_id,
            "jira_key": jira_key,
            "from_status": from_status,
            "to_status": target_status,
            "error": (
                f"Cannot transition from {from_status} to {target_status}. "
                f"Valid targets from {from_status}: {sorted(valid_targets)}"
            ),
            "steps": [],
        }

    # Dry run: validate only, no side effects
    if dry_run:
        return {
            "success": True,
            "story_id": story_id,
            "jira_key": jira_key,
            "from_status": from_status,
            "to_status": target_status,
            "steps": [],
        }

    steps: list[dict[str, Any]] = []

    # Step 1: Update YAML (always first — most important state)
    story["status"] = target_status
    if target_status == "in_progress" and "started" not in story:
        story["started"] = date.today().isoformat()
    if target_status == "done":
        story["completed"] = date.today().isoformat()
    write_sprint(sprint_path, data)
    steps.append(
        {
            "step": 1,
            "action": "yaml_update",
            "success": True,
            "status": f"{from_status}\u2192{target_status}",
        }
    )

    # Step 2: Jira transition
    if jira_key:
        jira_target = _JIRA_STATUS.get(target_status, target_status)
        try:
            client = get_client()
            jira_result = client.transition_sync(jira_key, jira_target)
            if jira_result.get("success"):
                steps.append(
                    {
                        "step": 2,
                        "action": "jira_transition",
                        "success": True,
                    }
                )
            else:
                steps.append(
                    {
                        "step": 2,
                        "action": "jira_transition",
                        "success": False,
                        "error": jira_result.get("error", "Jira transition failed"),
                    }
                )
        except Exception as exc:
            steps.append(
                {
                    "step": 2,
                    "action": "jira_transition",
                    "success": False,
                    "error": str(exc),
                }
            )
    else:
        steps.append(
            {
                "step": 2,
                "action": "jira_transition",
                "skipped": True,
            }
        )

    # Check for any step failures
    failed = [s for s in steps if s.get("success") is False]
    if failed:
        jira_failed = any(
            s.get("action") == "jira_transition" and s.get("success") is False for s in steps
        )
        result: dict[str, Any] = {
            "success": False,
            "story_id": story_id,
            "jira_key": jira_key,
            "from_status": from_status,
            "to_status": target_status,
            "error": f"Jira sync failed: YAML updated to {target_status} but Jira transition failed",
            "steps": steps,
        }
        if jira_failed:
            result["drift"] = True
            jira_target = _JIRA_STATUS.get(target_status, target_status)
            result["remediation"] = (
                f'Run `pf jira move {jira_key} "{jira_target}"` to manually sync Jira'
            )
        return result

    return {
        "success": True,
        "story_id": story_id,
        "jira_key": jira_key,
        "from_status": from_status,
        "to_status": target_status,
        "steps": steps,
    }
