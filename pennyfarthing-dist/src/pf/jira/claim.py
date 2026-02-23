"""
Claim Jira stories for work.

Usage:
    python -m pf.jira claim <issue-key> [--claim]

Options:
    --claim     Actually claim (assign + move to In Progress)

Exit codes:
    0 - Available or successfully claimed
    1 - Assigned to someone else
    2 - Not found or not synced
    3 - Error (CLI not installed, etc.)
"""

import argparse
import sys
from typing import Any

from pf.jira.client import (
    get_client,
    get_jira_field,
)


def __getattr__(name: str) -> object:
    """Lazy module attribute for transition_story (avoids circular import)."""
    if name == "transition_story":
        from pf.sprint.story_transition import transition_story

        globals()["transition_story"] = transition_story
        return transition_story
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def parse_args(args: list[str] | None = None) -> argparse.Namespace:
    """Parse command line arguments.

    Args:
        args: Command line arguments (defaults to sys.argv[1:])

    Returns:
        Parsed arguments namespace
    """
    parser = argparse.ArgumentParser(
        description="Check availability and claim a Jira story"
    )
    parser.add_argument("issue_key", help="Jira issue key (e.g., MSSCI-12345)")
    parser.add_argument(
        "--claim",
        action="store_true",
        help="Actually claim (assign to self + move to In Progress)",
    )

    return parser.parse_args(args)


def check_availability(issue_key: str) -> dict[str, Any]:
    """Check if a story is available for claiming.

    Args:
        issue_key: Jira issue key

    Returns:
        Dict with available status and details
    """
    issue = get_client().get_issue_sync(issue_key)
    if not issue:
        return {
            "available": False,
            "error": f"Issue {issue_key} not found",
            "exit_code": 2,
        }

    assignee = get_jira_field(issue, "fields.assignee.displayName")
    status = get_jira_field(issue, "fields.status.name", "Unknown")
    summary = get_jira_field(issue, "fields.summary", "")

    if assignee:
        return {
            "available": False,
            "assigned_to": assignee,
            "status": status,
            "summary": summary,
            "exit_code": 1,
        }

    return {
        "available": True,
        "status": status,
        "summary": summary,
        "exit_code": 0,
    }


def claim_story(issue_key: str) -> dict[str, Any]:
    """Claim a story by assigning to self and moving to In Progress.

    Args:
        issue_key: Jira issue key

    Returns:
        Dict with success status and details
    """
    # Check availability first
    availability = check_availability(issue_key)
    if not availability["available"]:
        return {
            "success": False,
            "error": f"Story not available: assigned to {availability.get('assigned_to', 'unknown')}",
            "exit_code": 1,
        }

    from pf.jira.client import get_current_user_email

    actions = []
    errors = []

    current_user = get_current_user_email()
    client = get_client()

    # Assign to self via REST API
    assign_result = client.assign_issue_sync(issue_key, current_user)
    if assign_result.get("success"):
        actions.append(f"Assigned to {current_user}")
    else:
        errors.append(f"Failed to assign: {assign_result.get('error', 'unknown')}")

    # Move to In Progress via state machine
    try:
        from pf.common.config import get_project_root
        from pf.sprint.story_transition import transition_story
        from pf.sprint.yaml_io import read_sprint

        root = get_project_root()
        sprint_path = root / "sprint" / "current-sprint.yaml"
        if sprint_path.exists():
            data = read_sprint(sprint_path)
            story_id = None
            for epic in data.get("epics", []):
                if not isinstance(epic, dict):
                    continue
                for story in epic.get("stories", []):
                    if story.get("jira") == issue_key:
                        story_id = story.get("id")
                        break
                if story_id:
                    break
            if story_id:
                t_result = transition_story(root, story_id, "in_progress")
                if t_result.get("success"):
                    actions.append("Moved to In Progress")
    except Exception:
        pass  # Best-effort — Jira claim already succeeded

    if errors:
        return {
            "success": False,
            "actions": actions,
            "errors": errors,
            "exit_code": 3,
        }

    # Update sprint YAML assigned_to field
    try:
        from pf.common.config import get_project_root
        from pf.sprint.yaml_io import read_sprint, write_sprint

        root = get_project_root()
        sprint_path = root / "sprint" / "current-sprint.yaml"
        if sprint_path.exists():
            data = read_sprint(sprint_path)
            for epic in data.get("epics", []):
                if not isinstance(epic, dict):
                    continue
                for story in epic.get("stories", []):
                    if story.get("jira") == issue_key:
                        story["assigned_to"] = current_user
                        write_sprint(sprint_path, data)
                        actions.append("Sprint YAML assigned_to set")
                        break
    except Exception:
        pass  # Best-effort — Jira claim already succeeded

    return {
        "success": True,
        "actions": actions,
        "exit_code": 0,
    }


def main(args: list[str] | None = None) -> int:
    """CLI entry point.

    Args:
        args: Command line arguments (defaults to sys.argv[1:])

    Returns:
        Exit code
    """
    parsed_args = parse_args(args)

    if parsed_args.claim:
        result = claim_story(parsed_args.issue_key)
        if result["success"]:
            print(f"Claimed {parsed_args.issue_key}")
            for action in result.get("actions", []):
                print(f"  {action}")
            return 0
        else:
            print(f"Failed to claim: {result.get('error', 'Unknown error')}", file=sys.stderr)
            for err in result.get("errors", []):
                print(f"  {err}", file=sys.stderr)
            return result.get("exit_code", 1)
    else:
        result = check_availability(parsed_args.issue_key)
        if result["available"]:
            print(f"{parsed_args.issue_key}: Available")
            print(f"  Status: {result.get('status')}")
            print(f"  Summary: {result.get('summary')}")
            return 0
        else:
            if result.get("assigned_to"):
                print(f"{parsed_args.issue_key}: Assigned to {result['assigned_to']}")
            else:
                print(f"{parsed_args.issue_key}: {result.get('error', 'Not available')}")
            return result.get("exit_code", 1)


if __name__ == "__main__":
    sys.exit(main())
