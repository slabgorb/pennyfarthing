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
    get_issue,
    get_jira_field,
    is_jira_cli_available,
    update_issue_status,
)


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
    if not is_jira_cli_available():
        return {
            "available": False,
            "error": "Jira CLI not installed",
            "exit_code": 3,
        }

    issue = get_issue(issue_key)
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
    import subprocess

    if not is_jira_cli_available():
        return {
            "success": False,
            "error": "Jira CLI not installed",
            "exit_code": 3,
        }

    # Check availability first
    availability = check_availability(issue_key)
    if not availability["available"]:
        return {
            "success": False,
            "error": f"Story not available: assigned to {availability.get('assigned_to', 'unknown')}",
            "exit_code": 1,
        }

    actions = []
    errors = []

    # Get current user
    result = subprocess.run(
        ["jira", "me"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return {
            "success": False,
            "error": "Could not get current Jira user",
            "exit_code": 3,
        }
    current_user = result.stdout.strip()

    # Assign to self
    result = subprocess.run(
        ["jira", "issue", "assign", issue_key, current_user, "--project", "MSSCI"],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        actions.append(f"Assigned to {current_user}")
    else:
        errors.append(f"Failed to assign: {result.stderr}")

    # Move to In Progress
    if update_issue_status(issue_key, "In Progress"):
        actions.append("Moved to In Progress")
    else:
        errors.append("Failed to move to In Progress")

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
