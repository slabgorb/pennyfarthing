"""
Sprint status operations.

Provides functions for getting and displaying sprint status.
"""

from typing import Any

from pf.sprint.loader import get_all_stories, get_sprint_info


def get_sprint_status(filter_status: str | None = None) -> dict[str, Any]:
    """Get sprint status with story counts.

    Args:
        filter_status: Optional status to filter by

    Returns:
        Dict with sprint status information
    """
    sprint_info = get_sprint_info()
    stories = get_all_stories()

    if not stories:
        return {}

    # Count by status
    status_counts: dict[str, int] = {}
    total_points = 0
    completed_points = 0

    for story in stories:
        status = story.get("status", "backlog")
        points = story.get("points", 0) or 0

        status_counts[status] = status_counts.get(status, 0) + 1
        total_points += points

        if status in ("done", "completed"):
            completed_points += points

    return {
        "sprint": sprint_info,
        "total_stories": len(stories),
        "by_status": status_counts,
        "backlog": status_counts.get("backlog", 0),
        "in_progress": status_counts.get("in_progress", 0),
        "in_review": status_counts.get("in_review", 0),
        "completed": status_counts.get("done", 0) + status_counts.get("completed", 0),
        "total_points": total_points,
        "completed_points": completed_points,
    }


def format_status(status: dict[str, Any]) -> str:
    """Format sprint status as human-readable string.

    Args:
        status: Status dict from get_sprint_status

    Returns:
        Formatted status string
    """
    if not status:
        return "No sprint data available"

    lines = []

    # Sprint header
    sprint = status.get("sprint", {})
    if sprint:
        lines.append(f"Sprint: {sprint.get('name', 'Unknown')}")
        lines.append(f"Status: {sprint.get('status', 'unknown')}")
        if sprint.get("goal"):
            lines.append(f"Goal: {sprint['goal']}")
        lines.append("")

    # Story counts
    lines.append(f"Total Stories: {status.get('total_stories', 0)}")
    lines.append(f"  Backlog: {status.get('backlog', 0)}")
    lines.append(f"  In Progress: {status.get('in_progress', 0)}")
    lines.append(f"  In Review: {status.get('in_review', 0)}")
    lines.append(f"  Completed: {status.get('completed', 0)}")
    lines.append("")

    # Points
    lines.append(f"Points: {status.get('completed_points', 0)}/{status.get('total_points', 0)}")

    return "\n".join(lines)


def main(args: list[str] | None = None) -> int:
    """CLI entry point for sprint status.

    Args:
        args: Command line arguments

    Returns:
        Exit code
    """
    import argparse

    parser = argparse.ArgumentParser(description="Show sprint status")
    parser.add_argument(
        "filter",
        nargs="?",
        choices=["backlog", "todo", "in-progress", "in-review", "done"],
        help="Filter by status",
    )

    parsed = parser.parse_args(args)

    status = get_sprint_status(parsed.filter)
    print(format_status(status))

    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
