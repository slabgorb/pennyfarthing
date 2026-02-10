"""
Jira sync for Pennyfarthing epics.

Syncs epic stories to Jira with async parallel API calls.
Ported from jira-sync.mjs for Python parallelism.

Usage:
    python -m pennyfarthing_scripts.jira sync <epic_number> [--dry-run] [--transition] [--points]
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass, field
from typing import Any

from pennyfarthing_scripts.common.config import get_project_root
from pennyfarthing_scripts.common.output import error, info, success, warn
from pennyfarthing_scripts.jira.client import (
    JiraClient,
    extract_jira_key,
    get_jira_field,
    map_status_to_jira,
)
from pennyfarthing_scripts.sprint.loader import find_epic, load_sprint


@dataclass
class SyncResult:
    """Result of syncing a single story."""

    story_id: str
    success: bool
    skipped: bool
    error: str | None
    actions: list[str] = field(default_factory=list)
    dry_run: bool = False


# Module-level client for async operations
_client: JiraClient | None = None


def _get_client() -> JiraClient:
    """Get or create the module's JiraClient instance."""
    global _client
    if _client is None:
        _client = JiraClient()
    return _client


def format_story_line(story: dict[str, Any]) -> str:
    """Format a story for display.

    Args:
        story: Story dict from sprint YAML

    Returns:
        Formatted string for display
    """
    story_id = story.get("id", "?")
    title = story.get("title", "Untitled")
    status = story.get("status", "backlog")
    return f"Story {story_id}: {title} [{status}]"


def format_summary(synced: int, skipped: int, errors: int) -> str:
    """Format sync summary.

    Args:
        synced: Number of stories synced
        skipped: Number of stories skipped
        errors: Number of errors

    Returns:
        Formatted summary string
    """
    return f"Summary: {synced} synced, {skipped} skipped, {errors} errors"


async def sync_story(
    story: dict[str, Any],
    dry_run: bool = False,
    do_transition: bool = False,
    sync_points: bool = False,
) -> SyncResult:
    """Sync a single story to Jira.

    Args:
        story: Story dict from sprint YAML
        dry_run: If True, don't make changes
        do_transition: If True, transition status
        sync_points: If True, sync story points

    Returns:
        SyncResult with outcome
    """
    story_id = story.get("id", "?")
    jira_key = story.get("jira")

    # Skip if no Jira key
    if not jira_key or jira_key == "null":
        return SyncResult(
            story_id=story_id,
            success=False,
            skipped=True,
            error=None,
            actions=[],
            dry_run=dry_run,
        )

    jira_key = extract_jira_key(jira_key)
    actions: list[str] = []

    # Dry run mode
    if dry_run:
        if do_transition:
            actions.append("transition")
        if sync_points:
            actions.append("sync_points")
        return SyncResult(
            story_id=story_id,
            success=True,
            skipped=False,
            error=None,
            actions=actions,
            dry_run=True,
        )

    # Get client and fetch current Jira state
    client = _get_client()
    issue_json = await client.get_issue_async(jira_key)
    if not issue_json:
        return SyncResult(
            story_id=story_id,
            success=False,
            skipped=False,
            error=f"Could not fetch {jira_key}",
            actions=[],
        )

    current_status = get_jira_field(issue_json, "fields.status.name", "Unknown")
    target_status = map_status_to_jira(story.get("status"))

    # Transition if requested and needed
    if do_transition and current_status != target_status:
        result = await client.transition_async(jira_key, target_status)
        if result.get("success"):
            actions.append(f"transitioned: {current_status} -> {target_status}")
        else:
            actions.append(f"transition failed: {result.get('reason')}")

    # Sync points if requested
    story_points = story.get("points")
    if sync_points and story_points:
        current_points = get_jira_field(issue_json, "fields.customfield_10031")
        current_points_int = int(current_points) if current_points else None

        result = await client.sync_story_points_async(
            jira_key, int(story_points), current_points_int
        )
        if result.get("success"):
            if result.get("already_synced"):
                actions.append(f"points already synced: {story_points}")
            else:
                actions.append(f"synced points: {story_points}")
        else:
            actions.append(f"points sync failed: {result.get('reason')}")

    return SyncResult(
        story_id=story_id,
        success=True,
        skipped=False,
        error=None,
        actions=actions,
    )


async def sync_epic(
    epic: dict[str, Any],
    dry_run: bool = False,
    do_transition: bool = False,
    sync_points: bool = False,
) -> dict[str, Any]:
    """Sync all stories in an epic to Jira.

    Args:
        epic: Epic dict from sprint YAML
        dry_run: If True, don't make changes
        do_transition: If True, transition status
        sync_points: If True, sync story points

    Returns:
        Summary dict with counts
    """
    stories = epic.get("stories", [])

    # Process all stories in parallel
    tasks = [
        sync_story(story, dry_run=dry_run, do_transition=do_transition, sync_points=sync_points)
        for story in stories
    ]
    results = await asyncio.gather(*tasks)

    # Count results
    synced = sum(1 for r in results if r.success and not r.skipped)
    skipped = sum(1 for r in results if r.skipped)
    errors = sum(1 for r in results if not r.success and not r.skipped)

    return {
        "total": len(stories),
        "synced": synced,
        "skipped": skipped,
        "errors": errors,
        "results": results,
    }


def parse_args(args: list[str] | None = None) -> argparse.Namespace:
    """Parse command line arguments.

    Args:
        args: Arguments to parse (defaults to sys.argv[1:])

    Returns:
        Parsed arguments namespace
    """
    parser = argparse.ArgumentParser(
        description="Sync Pennyfarthing epic to Jira",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  jira sync 35                        Show sync status for epic 35
  jira sync 35 --dry-run              Show what would be done
  jira sync 35 --transition           Sync status to Jira
  jira sync 35 --transition --points  Sync status and story points
""",
    )
    parser.add_argument("epic", help="Epic number (e.g., '35' or 'epic-35')")
    parser.add_argument(
        "--dry-run", action="store_true", help="Show what would be done without making changes"
    )
    parser.add_argument(
        "--transition", action="store_true", help="Transition Jira issues to match status"
    )
    parser.add_argument(
        "--points", action="store_true", help="Sync story points from Pennyfarthing to Jira"
    )

    return parser.parse_args(args)


async def async_main(args: argparse.Namespace) -> int:
    """Async main entry point.

    Args:
        args: Parsed arguments

    Returns:
        Exit code
    """
    # Find project root and load sprint
    try:
        project_root = get_project_root()
    except FileNotFoundError as e:
        error(str(e))
        return 1

    sprint_data = load_sprint(project_root)
    if not sprint_data:
        error("Could not load sprint data")
        return 1

    # Find epic
    epic = find_epic(sprint_data, args.epic)
    if not epic:
        error(f"Epic {args.epic} not found in sprint file")
        return 1

    # Display header
    print("", file=sys.stderr)
    info("==========================================")
    info(f"Epic {args.epic}: {epic.get('title', 'Untitled')}")
    if epic.get("jira"):
        info(f"Jira: {epic.get('jira')}")
    info("==========================================")
    print("", file=sys.stderr)

    if args.dry_run:
        warn("[DRY-RUN MODE] No changes will be made")
        print("", file=sys.stderr)

    stories = epic.get("stories", [])
    if not stories:
        warn(f"No stories found in epic {args.epic}")
        return 0

    info(f"Found {len(stories)} stories to process")
    print("", file=sys.stderr)

    # Sync epic
    result = await sync_epic(
        epic,
        dry_run=args.dry_run,
        do_transition=args.transition,
        sync_points=args.points,
    )

    # Display results
    for sync_result in result["results"]:
        story = next((s for s in stories if s.get("id") == sync_result.story_id), {})
        print("---", file=sys.stderr)
        info(format_story_line(story))
        if sync_result.skipped:
            warn("  Not synced to Jira - skipping")
        elif sync_result.error:
            error(f"  {sync_result.error}")
        elif sync_result.dry_run:
            actions_str = ", ".join(sync_result.actions) if sync_result.actions else "view only"
            warn(f"  [DRY-RUN] Would sync: {actions_str}")
        else:
            for action in sync_result.actions:
                success(f"  {action}")

    # Summary
    print("", file=sys.stderr)
    print("==========================================", file=sys.stderr)
    success(format_summary(result["synced"], result["skipped"], result["errors"]))
    print("==========================================", file=sys.stderr)

    return 1 if result["errors"] > 0 else 0


def main(args: list[str] | None = None) -> int:
    """Main entry point.

    Args:
        args: Command line arguments (defaults to sys.argv[1:])

    Returns:
        Exit code
    """
    parsed_args = parse_args(args)
    return asyncio.run(async_main(parsed_args))


if __name__ == "__main__":
    sys.exit(main())
