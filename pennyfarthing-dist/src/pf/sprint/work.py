"""
Sprint work session management.

Provides functions for starting and managing work on stories.
"""

from typing import Any

from pf.sprint.loader import (
    get_stories_by_status,
    get_story_by_id,
)


def check_story(story_id: str) -> dict[str, Any]:
    """Check if a story is available for work.

    Args:
        story_id: Story ID or Jira key

    Returns:
        Dict with availability status and story details
    """
    story = get_story_by_id(story_id)

    if not story:
        return {
            "available": False,
            "error": f"Story '{story_id}' not found",
        }

    status = story.get("status", "backlog")
    assigned = story.get("assigned_to")

    # Check if assigned to someone else.
    # `get_current_user_email` resolves via JIRA_USER env then `git config
    # user.email` — neither path invokes jira-cli, so this comparison works
    # in both jira-enabled and local-only modes.
    if assigned:
        from pf.jira.client import get_current_user_email

        current_user = get_current_user_email()
        if assigned != current_user:
            return {
                "available": False,
                "type": "story",
                "story": story,
                "reason": f"Assigned to {assigned}",
                "assigned_to": assigned,
            }

    # Check if already in progress
    if status == "in_progress":
        return {
            "available": False,
            "type": "story",
            "story": story,
            "reason": "Already in progress",
            "assigned_to": assigned,
        }

    # Check if in review
    if status == "in_review":
        return {
            "available": False,
            "type": "story",
            "story": story,
            "reason": "Story is in review",
            "assigned_to": assigned,
        }

    # Check if done
    if status in ("done", "completed"):
        return {
            "available": False,
            "type": "story",
            "story": story,
            "reason": "Already completed",
        }

    # Check if canceled
    if status == "canceled":
        return {
            "available": False,
            "type": "story",
            "story": story,
            "reason": "Story is canceled",
        }

    # Available statuses: backlog, ready, planning
    return {
        "available": True,
        "type": "story",
        "story": story,
        "title": story.get("title"),
        "points": story.get("points"),
        "workflow": story.get("workflow", "tdd"),
    }


def get_next_story() -> dict[str, Any]:
    """Get the highest priority available story.

    Considers stories with backlog, ready, or planning status.
    Excludes stories assigned to other users (resolved via local git config —
    no jira-cli invocation).

    Returns:
        Dict with next story details or error
    """
    from pf.jira.client import get_current_user_email
    from pf.sprint.loader import get_all_stories

    current_user = get_current_user_email()
    all_stories = get_all_stories()
    available_statuses = {"backlog", "ready", "planning"}
    backlog = [
        s
        for s in all_stories
        if s.get("status") in available_statuses
        and (not s.get("assigned_to") or s.get("assigned_to") == current_user)
    ]

    if not backlog:
        return {
            "available": False,
            "error": "No stories in backlog",
        }

    # Sort by priority (P0 > P1 > P2 > P3), preferring own assignments
    priority_order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
    sorted_stories = sorted(
        backlog,
        key=lambda s: (
            0 if s.get("assigned_to") == current_user else 1,
            priority_order.get((s.get("priority") or "P2").strip().upper(), 2),
        ),
    )

    next_story = sorted_stories[0]
    return {
        "available": True,
        "type": "next",
        "story": next_story,
        "title": next_story.get("title"),
        "points": next_story.get("points"),
        "priority": next_story.get("priority", "P2"),
    }


def start_work(story_id: str, *, dry_run: bool = False) -> dict[str, Any]:
    """Start work on a story.

    Args:
        story_id: Story ID to start
        dry_run: If True, don't make changes

    Returns:
        Dict with success status and details
    """
    # Check availability
    check = check_story(story_id)
    if not check.get("available"):
        return {
            "success": False,
            "error": check.get("reason") or check.get("error"),
        }

    story = check.get("story")

    if dry_run:
        return {
            "success": True,
            "dry_run": True,
            "story": story,
            "message": f"Would start work on {story_id}",
        }

    # In a real implementation, this would:
    # 1. Create/update session file
    # 2. Claim in Jira
    # 3. Create branch
    # For now, return success with story info
    return {
        "success": True,
        "story": story,
        "message": f"Ready to start work on {story_id}",
    }


def main(args: list[str] | None = None) -> int:
    """CLI entry point for sprint work.

    Args:
        args: Command line arguments

    Returns:
        Exit code
    """
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="Start work on a story")
    parser.add_argument(
        "story_id",
        nargs="?",
        help="Story ID (or 'next' for highest priority)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done",
    )

    parsed = parser.parse_args(args)

    if not parsed.story_id:
        # Show backlog
        backlog = get_stories_by_status("backlog")
        print(f"Available stories: {len(backlog)}")
        for story in backlog[:10]:
            print(f"  {story.get('id')}: {story.get('title')} [{story.get('points', '?')}pts]")
        return 0

    if parsed.story_id == "next":
        result = get_next_story()
    else:
        result = check_story(parsed.story_id)

    if result.get("available"):
        story = result.get("story", {})
        print(f"Story: {story.get('id')}")
        print(f"Title: {story.get('title')}")
        print(f"Points: {story.get('points')}")
        print("Status: Available")
        return 0
    else:
        print(f"Not available: {result.get('error') or result.get('reason')}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    import sys

    sys.exit(main())
