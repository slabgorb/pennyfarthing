"""
Create Jira epics from Pennyfarthing sprint YAML definitions.

Usage:
    python -m pf.jira create epic <epic_id> [options]

Options:
    --dry-run       Show what would be done without making changes

Examples:
    python -m pf.jira create epic epic-63 --dry-run
    python -m pf.jira create epic 63
"""

import argparse
import json
import sys
from typing import Any

from pf.jira.client import JIRA_PROJECT, JiraClient
from pf.sprint.loader import find_epic
from pf.sprint.loader import load_sprint as load_current_sprint


def parse_args(args: list[str] | None = None) -> argparse.Namespace:
    """Parse command line arguments.

    Args:
        args: Command line arguments (defaults to sys.argv[1:])

    Returns:
        Parsed arguments namespace
    """
    parser = argparse.ArgumentParser(description="Create Jira epic from Pennyfarthing sprint YAML")
    parser.add_argument("epic_id", help="Epic ID (e.g., epic-63 or 63)")
    parser.add_argument("--dry-run", action="store_true", help="Show changes without applying")

    return parser.parse_args(args)


def build_epic_payload(epic_data: dict[str, Any]) -> dict[str, Any]:
    """Build Jira API payload for creating an epic.

    Args:
        epic_data: Epic data from sprint YAML

    Returns:
        Jira API request payload
    """
    title = epic_data.get("title", "")
    description = epic_data.get("description", "")

    # Build ADF (Atlassian Document Format) for description
    description_adf = {
        "type": "doc",
        "version": 1,
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": description}] if description else [],
            }
        ],
    }

    return {
        "fields": {
            "project": {"key": JIRA_PROJECT},
            "summary": title,
            "description": description_adf,
            "issuetype": {"name": "Epic"},
        }
    }


def create_epic(
    title: str,
    description: str = "",
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Create a Jira epic.

    Args:
        title: Epic title/summary
        description: Epic description
        dry_run: If True, show changes without applying

    Returns:
        Result dict with success, key, error fields
    """
    epic_data = {"title": title, "description": description}
    payload = build_epic_payload(epic_data)

    if dry_run:
        return {
            "success": True,
            "dry_run": True,
            "payload": payload,
        }

    client = JiraClient()
    response = client.create_issue_sync(payload)

    if response and "key" in response:
        return {
            "success": True,
            "key": response["key"],
            "id": response.get("id"),
        }
    else:
        return {
            "success": False,
            "error": "Failed to create epic",
            "response": response,
        }


def create_epic_from_yaml(epic_id: str, *, dry_run: bool = False) -> dict[str, Any]:
    """Create a Jira epic from sprint YAML definition.

    Args:
        epic_id: Epic ID (e.g., "epic-63" or "63")
        dry_run: If True, show changes without applying

    Returns:
        Result dict with success, key, error fields
    """
    sprint_data = load_current_sprint()
    if not sprint_data:
        return {"success": False, "error": "Could not load sprint YAML"}

    epic = find_epic(sprint_data, epic_id)
    if not epic:
        return {"success": False, "error": f"Epic '{epic_id}' not found in sprint YAML"}

    # Check if epic already has a Jira key
    if epic.get("jira"):
        return {
            "success": False,
            "error": f"Epic already has Jira key: {epic['jira']}",
        }

    title = epic.get("title", f"Epic {epic_id}")
    description = epic.get("description", "")

    result = create_epic(title, description, dry_run=dry_run)

    # Write Jira key back to YAML on successful creation
    if result.get("success") and not result.get("dry_run") and result.get("key"):
        try:
            from pf.common.config import get_project_root
            from pf.sprint.yaml_io import read_sprint, write_sprint

            sprint_path = get_project_root() / "sprint" / "current-sprint.yaml"
            sprint_data = read_sprint(sprint_path)
            target = find_epic(sprint_data, epic_id)
            if target:
                target["jira"] = result["key"]
                write_sprint(sprint_path, sprint_data)
                result["jira_writeback"] = True
        except Exception:
            # Don't fail the creation if writeback fails
            result["jira_writeback"] = False

    return result


def main(args: list[str] | None = None) -> int:
    """CLI entry point.

    Args:
        args: Command line arguments (defaults to sys.argv[1:])

    Returns:
        Exit code (0 for success, 1 for failure)
    """
    parsed_args = parse_args(args)

    result = create_epic_from_yaml(parsed_args.epic_id, dry_run=parsed_args.dry_run)

    if result["success"]:
        if result.get("dry_run"):
            print(f"[DRY-RUN] Would create epic for {parsed_args.epic_id}")
            print(f"  Payload: {json.dumps(result.get('payload', {}), indent=2)}")
        else:
            print(f"Created epic: {result.get('key')}")
        return 0
    else:
        print(f"Failed: {result.get('error', 'Unknown error')}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
