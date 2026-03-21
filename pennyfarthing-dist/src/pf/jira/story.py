"""
Sync a single story between Pennyfarthing sprint YAML and Jira.

Usage:
    python -m pf.jira story <story_key> [options]

Options:
    --transition    Sync status (transition Jira issue)
    --points        Sync story points
    --comment MSG   Add comment to issue
    --dry-run       Show what would be done without making changes

Examples:
    python -m pf.jira story 63-7 --transition
    python -m pf.jira story MSSCI-12401 --points --dry-run
"""

import argparse
import re
import sys
from typing import Any

from pf.jira import client as jira_client
from pf.sprint.loader import (
    find_epic,
    find_story,
    get_story_by_id,
)
from pf.sprint.loader import (
    load_sprint as load_current_sprint,
)


def parse_args(args: list[str] | None = None) -> argparse.Namespace:
    """Parse command line arguments.

    Args:
        args: Command line arguments (defaults to sys.argv[1:])

    Returns:
        Parsed arguments namespace
    """
    parser = argparse.ArgumentParser(
        description="Sync a single story between Pennyfarthing and Jira"
    )
    parser.add_argument("story_key", help="Story ID (e.g., 63-7) or Jira key (MSSCI-12401)")
    parser.add_argument("--transition", action="store_true", help="Sync status")
    parser.add_argument("--points", action="store_true", help="Sync story points")
    parser.add_argument("--comment", type=str, help="Add comment to issue")
    parser.add_argument("--dry-run", action="store_true", help="Show changes without applying")

    return parser.parse_args(args)


def get_story_from_sprint(story_key: str) -> dict[str, Any] | None:
    """Find a story in the sprint YAML.

    Args:
        story_key: Story ID or Jira key

    Returns:
        Story dict if found, None otherwise
    """
    # Try direct lookup first
    story = get_story_by_id(story_key)
    if story:
        return story

    # If it looks like a local ID (e.g., "63-7"), try finding via epic
    if "-" in story_key and not re.match(r"^[A-Z][A-Z0-9]+-\d+$", story_key):
        sprint_data = load_current_sprint()
        if sprint_data:
            parts = story_key.split("-")
            if len(parts) >= 2:
                epic_num = parts[0]
                epic = find_epic(sprint_data, epic_num)
                if epic:
                    return find_story(epic, story_key)

    return None


def fetch_jira_issue(jira_key: str) -> dict[str, Any] | None:
    """Fetch issue from Jira.

    Args:
        jira_key: Jira issue key

    Returns:
        Issue JSON if found, None otherwise
    """
    return jira_client.get_client().get_issue_sync(jira_key)


def sync_story(
    story_key: str,
    *,
    do_transition: bool = False,
    sync_points: bool = False,
    comment: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Sync a story between Pennyfarthing and Jira.

    Args:
        story_key: Story ID or Jira key
        do_transition: Whether to sync status
        sync_points: Whether to sync story points
        comment: Comment to add (optional)
        dry_run: If True, show changes without applying

    Returns:
        Result dict with success, actions, error fields
    """
    # Find story in sprint YAML
    story = get_story_from_sprint(story_key)
    if not story:
        return {
            "success": False,
            "error": f"Story '{story_key}' not found in sprint YAML",
        }

    jira_key = story.get("jira")
    if not jira_key:
        return {
            "success": False,
            "error": f"Story '{story_key}' has no Jira key",
        }

    # Fetch current Jira state
    issue = fetch_jira_issue(jira_key)
    if not issue:
        return {
            "success": False,
            "error": f"Could not fetch Jira issue {jira_key}",
        }

    actions = []
    errors = []

    # Sync status if requested
    if do_transition:
        current_jira_status = jira_client.get_jira_field(issue, "fields.status.name")
        target_status = jira_client.map_status_to_jira(story.get("status"))

        if current_jira_status != target_status:
            action = f"transition {jira_key}: {current_jira_status} -> {target_status}"
            if dry_run:
                actions.append(f"[DRY-RUN] {action}")
            else:
                result = jira_client.get_client().transition_sync(jira_key, target_status)
                if result.get("success"):
                    actions.append(action)
                else:
                    errors.append(
                        f"Failed to transition {jira_key}: {result.get('error', 'unknown')}"
                    )
        else:
            actions.append(f"status already {current_jira_status}")

    # Sync points if requested
    if sync_points:
        story_points = story.get("points")
        if story_points is not None:
            current_points = jira_client.get_story_points(jira_key, issue)
            if current_points != story_points:
                action = f"sync points {jira_key}: {current_points} -> {story_points}"
                if dry_run:
                    actions.append(f"[DRY-RUN] {action}")
                else:
                    # Note: point sync requires REST API, not CLI
                    actions.append(f"[SKIP] {action} (requires REST API)")

    # Add comment if provided
    if comment:
        action = f"add comment to {jira_key}"
        if dry_run:
            actions.append(f"[DRY-RUN] {action}")
        else:
            result = jira_client.get_client().add_comment_sync(jira_key, comment)
            if result.get("success"):
                actions.append(action)
            else:
                errors.append(f"Failed to add comment to {jira_key}")

    return {
        "success": len(errors) == 0,
        "story_id": story.get("id"),
        "jira_key": jira_key,
        "actions": actions,
        "errors": errors if errors else None,
        "dry_run": dry_run,
    }


def main(args: list[str] | None = None) -> int:
    """CLI entry point.

    Args:
        args: Command line arguments (defaults to sys.argv[1:])

    Returns:
        Exit code (0 for success, 1 for failure)
    """
    parsed_args = parse_args(args)

    result = sync_story(
        parsed_args.story_key,
        do_transition=parsed_args.transition,
        sync_points=parsed_args.points,
        comment=parsed_args.comment,
        dry_run=parsed_args.dry_run,
    )

    if result["success"]:
        print(f"Synced {result.get('story_id', parsed_args.story_key)}")
        for action in result.get("actions", []):
            print(f"  {action}")
        return 0
    else:
        print(f"Failed: {result.get('error', 'Unknown error')}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
