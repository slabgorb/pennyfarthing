"""
Bidirectional sync between sprint YAML and Jira.

Story: MSSCI-12400 (Port from jira-bidirectional-sync.mjs)

Usage: python -m pennyfarthing_scripts.jira bidirectional [options]

Options:
    --dry-run       Show changes without applying
    --yaml-wins     Prefer YAML values on conflict (default: Jira wins)
    --status        Sync status field
    --points        Sync story points
    --all           Sync all fields (status + points)
    --sprint <id>   Target specific sprint (default: current)

Features over JS version:
    - Async parallel Jira API calls
    - Structured colored output
    - Better conflict detection
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from pennyfarthing_scripts.jira.client import JiraClient, map_jira_to_status, map_status_to_jira
from pennyfarthing_scripts.common.output import error, info, success, warn
from pennyfarthing_scripts.sprint.loader import get_all_stories, load_sprint


# =============================================================================
# Data Classes
# =============================================================================


@dataclass
class SyncChange:
    """Represents a single sync change to apply."""

    key: str
    field: Literal["status", "points", "assigned_to"]
    action: Literal["update-yaml", "update-jira"]
    yaml_value: Any
    jira_value: Any
    target_value: Any


@dataclass
class SyncPlan:
    """Result of comparing YAML and Jira stories."""

    changes: list[SyncChange] = field(default_factory=list)
    yaml_only: list[str] = field(default_factory=list)
    jira_only: list[str] = field(default_factory=list)
    both: list[str] = field(default_factory=list)
    conflicts: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class SyncResult:
    """Result of executing a sync plan."""

    dry_run: bool
    changes_planned: int
    changes_applied: int
    yaml_modified: bool
    jira_api_calls: int
    errors: list[str] = field(default_factory=list)


# =============================================================================
# CLI Argument Parsing
# =============================================================================


def parse_cli_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse command line arguments.

    Args:
        argv: Command line arguments (defaults to sys.argv[1:])

    Returns:
        Parsed arguments namespace
    """
    parser = argparse.ArgumentParser(
        description="Bidirectional sync between sprint YAML and Jira",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Preview status sync (dry run)
    python -m pennyfarthing_scripts.jira bidirectional --status --dry-run

    # Sync all fields, YAML wins conflicts
    python -m pennyfarthing_scripts.jira bidirectional --all --yaml-wins

    # Sync only points to Jira
    python -m pennyfarthing_scripts.jira bidirectional --points
        """,
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show changes without applying",
    )
    parser.add_argument(
        "--yaml-wins",
        action="store_true",
        help="Prefer YAML values on conflict (default: Jira wins)",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Sync status field",
    )
    parser.add_argument(
        "--points",
        action="store_true",
        help="Sync story points",
    )
    parser.add_argument(
        "--assignee",
        action="store_true",
        help="Sync assignee field (Jira -> YAML only)",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Sync all fields (status + points + assignee)",
    )
    parser.add_argument(
        "--sprint",
        type=str,
        default=None,
        help="Target specific sprint ID (default: current)",
    )

    args = parser.parse_args(argv)

    # --all implies --status, --points, and --assignee
    if args.all:
        args.status = True
        args.points = True
        args.assignee = True

    return args


# =============================================================================
# Sync Plan Generation
# =============================================================================


def generate_sync_plan(
    yaml_stories: list[dict[str, Any]],
    jira_stories: list[dict[str, Any]],
    *,
    sync_status: bool = False,
    sync_points: bool = False,
    sync_assignee: bool = False,
    yaml_wins: bool = False,
) -> SyncPlan:
    """Generate a sync plan comparing YAML and Jira stories.

    Args:
        yaml_stories: Stories from sprint YAML [{id, jira, status, points, ...}]
        jira_stories: Stories from Jira [{key, fields: {status: {name}, customfield_10031, ...}}]
        sync_status: Whether to sync status field
        sync_points: Whether to sync points field
        sync_assignee: Whether to sync assignee field (always Jira -> YAML)
        yaml_wins: If True, YAML wins conflicts (default: Jira wins)

    Returns:
        SyncPlan with changes, categorized stories, and conflicts
    """
    plan = SyncPlan()

    # Build lookup maps - use Jira key as the common identifier
    yaml_by_jira_key: dict[str, dict[str, Any]] = {}
    for story in yaml_stories:
        jira_key = story.get("jira")
        if jira_key:
            yaml_by_jira_key[jira_key] = story

    jira_by_key: dict[str, dict[str, Any]] = {}
    for story in jira_stories:
        key = story.get("key")
        if key:
            jira_by_key[key] = story

    # Categorize stories
    yaml_keys = set(yaml_by_jira_key.keys())
    jira_keys = set(jira_by_key.keys())

    plan.yaml_only = sorted(yaml_keys - jira_keys)
    plan.jira_only = sorted(jira_keys - yaml_keys)
    plan.both = sorted(yaml_keys & jira_keys)

    # Generate changes for stories in both systems
    for key in plan.both:
        yaml_story = yaml_by_jira_key[key]
        jira_story = jira_by_key[key]

        yaml_status = yaml_story.get("status")
        jira_status_raw = jira_story.get("fields", {}).get("status", {}).get("name")
        yaml_points = yaml_story.get("points")
        # customfield_10031 is Story Points for 1898andco Jira
        jira_points = jira_story.get("fields", {}).get("customfield_10031")

        # Normalize statuses for comparison
        normalized_yaml_status = map_status_to_jira(yaml_status)
        normalized_jira_status = jira_status_raw

        # Check status differences
        if sync_status and normalized_yaml_status != normalized_jira_status:
            if yaml_wins:
                action: Literal["update-yaml", "update-jira"] = "update-jira"
                target_status = normalized_yaml_status
            else:
                action = "update-yaml"
                target_status = map_jira_to_status(jira_status_raw)

            plan.changes.append(
                SyncChange(
                    key=key,
                    field="status",
                    action=action,
                    yaml_value=yaml_status,
                    jira_value=jira_status_raw,
                    target_value=target_status,
                )
            )

        # Check points differences
        if sync_points and yaml_points != jira_points:
            if yaml_wins:
                action = "update-jira"
                target_points = yaml_points
            else:
                action = "update-yaml"
                target_points = jira_points

            plan.changes.append(
                SyncChange(
                    key=key,
                    field="points",
                    action=action,
                    yaml_value=yaml_points,
                    jira_value=jira_points,
                    target_value=target_points,
                )
            )

        # Check assignee differences (always Jira -> YAML, ignores yaml_wins)
        if sync_assignee:
            yaml_assignee = yaml_story.get("assigned_to")
            jira_assignee_obj = jira_story.get("fields", {}).get("assignee")
            jira_assignee_email = (
                jira_assignee_obj.get("emailAddress") if jira_assignee_obj else None
            )

            if yaml_assignee != jira_assignee_email:
                plan.changes.append(
                    SyncChange(
                        key=key,
                        field="assigned_to",
                        action="update-yaml",
                        yaml_value=yaml_assignee,
                        jira_value=jira_assignee_email,
                        target_value=jira_assignee_email,
                    )
                )

    return plan


# =============================================================================
# Sync Plan Execution
# =============================================================================


async def execute_sync_plan(
    plan: SyncPlan,
    *,
    dry_run: bool = False,
    client: JiraClient | None = None,
    sprint_path: Path | None = None,
) -> SyncResult:
    """Execute a sync plan, applying changes to YAML and/or Jira.

    Args:
        plan: Sync plan from generate_sync_plan
        dry_run: If True, don't apply changes
        client: JiraClient instance (created if not provided)
        sprint_path: Path to sprint YAML (for YAML updates)

    Returns:
        SyncResult with execution details
    """
    result = SyncResult(
        dry_run=dry_run,
        changes_planned=len(plan.changes),
        changes_applied=0,
        yaml_modified=False,
        jira_api_calls=0,
    )

    if dry_run:
        return result

    if client is None:
        client = JiraClient()

    # Group changes by action type for parallel execution
    jira_updates: list[SyncChange] = []
    yaml_updates: list[SyncChange] = []

    for change in plan.changes:
        if change.action == "update-jira":
            jira_updates.append(change)
        else:
            yaml_updates.append(change)

    # Execute Jira updates in parallel
    if jira_updates:
        tasks = []
        for change in jira_updates:
            if change.field == "status":
                tasks.append(
                    client.transition_async(change.key, change.target_value)
                )
            elif change.field == "points":
                tasks.append(
                    client.sync_story_points_async(change.key, change.target_value)
                )

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for i, res in enumerate(results):
            result.jira_api_calls += 1
            if isinstance(res, Exception):
                result.errors.append(f"{jira_updates[i].key}: {res}")
            elif isinstance(res, dict) and res.get("success"):
                result.changes_applied += 1
            elif isinstance(res, dict):
                result.errors.append(
                    f"{jira_updates[i].key}: {res.get('reason', 'Unknown error')}"
                )

    # Execute YAML updates (sequential, file-based)
    if yaml_updates:
        from pennyfarthing_scripts.common.config import get_project_root
        from pennyfarthing_scripts.sprint.yaml_io import read_sprint, write_sprint

        root = get_project_root()
        sprint_file = sprint_path or (root / "sprint" / "current-sprint.yaml")

        if sprint_file.exists():
            sprint_data = read_sprint(sprint_file)

            # Apply YAML updates
            for change in yaml_updates:
                updated = _update_story_in_sprint(
                    sprint_data, change.key, change.field, change.target_value
                )
                if updated:
                    result.changes_applied += 1
                    result.yaml_modified = True

            # Write back if modified (handles shards automatically)
            if result.yaml_modified:
                write_sprint(sprint_file, sprint_data)

    return result


def _update_story_in_sprint(
    sprint_data: dict[str, Any],
    jira_key: str,
    field: str,
    value: Any,
) -> bool:
    """Update a story field in sprint data by Jira key.

    Args:
        sprint_data: Sprint YAML data
        jira_key: Jira issue key (e.g., MSSCI-12400)
        field: Field to update (status, points)
        value: New value

    Returns:
        True if story was found and updated
    """
    if not sprint_data or "epics" not in sprint_data:
        return False

    for epic in sprint_data.get("epics", []):
        for story in epic.get("stories", []):
            if story.get("jira") == jira_key:
                if value is None and field in story:
                    del story[field]
                elif value is not None:
                    story[field] = value
                return True

    return False


# =============================================================================
# Sync Plan Formatting
# =============================================================================


def format_sync_plan(plan: SyncPlan) -> str:
    """Format sync plan as human-readable string.

    Args:
        plan: Sync plan from generate_sync_plan

    Returns:
        Human-readable output string
    """
    lines = []

    lines.append("=" * 60)
    lines.append("Bidirectional Sync Plan")
    lines.append("=" * 60)
    lines.append("")

    # Summary
    lines.append(f"Stories in YAML only: {len(plan.yaml_only)}")
    lines.append(f"Stories in Jira only: {len(plan.jira_only)}")
    lines.append(f"Stories in both: {len(plan.both)}")
    lines.append(f"Changes to apply: {len(plan.changes)}")
    lines.append("")

    # YAML-only stories
    if plan.yaml_only:
        lines.append("--- YAML Only (not in Jira) ---")
        for key in plan.yaml_only:
            lines.append(f"  {key}")
        lines.append("")

    # Jira-only stories
    if plan.jira_only:
        lines.append("--- Jira Only (not in YAML) ---")
        for key in plan.jira_only:
            lines.append(f"  {key}")
        lines.append("")

    # Changes
    if plan.changes:
        lines.append("--- Changes ---")
        for change in plan.changes:
            direction = "Jira -> YAML" if change.action == "update-yaml" else "YAML -> Jira"
            lines.append(f"  {change.key}: {change.field} {direction}")
            lines.append(
                f"    YAML: {change.yaml_value} | Jira: {change.jira_value} -> {change.target_value}"
            )
        lines.append("")

    # Conflicts
    if plan.conflicts:
        lines.append("--- Conflicts (manual resolution needed) ---")
        for conflict in plan.conflicts:
            lines.append(f"  {conflict.get('key')}: {conflict.get('field')}")
        lines.append("")

    lines.append("=" * 60)

    return "\n".join(lines)


# =============================================================================
# Main Entry Point
# =============================================================================


async def async_main(args: argparse.Namespace) -> int:
    """Async main entry point.

    Args:
        args: Parsed command line arguments

    Returns:
        Exit code (0 for success, 1 for error)
    """
    # Validate at least one field is selected
    if not args.status and not args.points and not args.assignee:
        error("Must specify at least one field to sync: --status, --points, --assignee, or --all")
        return 1

    # Load sprint data
    sprint_data = load_sprint()
    if not sprint_data:
        error("Could not load sprint data")
        return 1

    yaml_stories = get_all_stories()
    if not yaml_stories:
        warn("No stories found in sprint YAML")

    # Filter to stories with Jira keys
    yaml_stories_with_jira = [s for s in yaml_stories if s.get("jira")]
    info(f"Found {len(yaml_stories_with_jira)} stories with Jira keys in YAML")

    # Fetch Jira stories
    client = JiraClient()
    jira_keys = [s["jira"] for s in yaml_stories_with_jira]

    info(f"Fetching {len(jira_keys)} issues from Jira...")
    jira_stories = []

    # Fetch in parallel
    tasks = [client.get_issue_async(key) for key in jira_keys]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for key, result in zip(jira_keys, results):
        if isinstance(result, Exception):
            warn(f"Failed to fetch {key}: {result}")
        elif result:
            jira_stories.append(result)
        else:
            warn(f"Issue not found: {key}")

    info(f"Fetched {len(jira_stories)} issues from Jira")

    # Generate sync plan
    plan = generate_sync_plan(
        yaml_stories_with_jira,
        jira_stories,
        sync_status=args.status,
        sync_points=args.points,
        sync_assignee=args.assignee,
        yaml_wins=args.yaml_wins,
    )

    # Display plan
    print(format_sync_plan(plan), file=sys.stderr)

    if args.dry_run:
        info("Dry run - no changes applied")
        return 0

    if not plan.changes:
        success("No changes needed - already in sync")
        return 0

    # Execute plan
    info(f"Applying {len(plan.changes)} changes...")
    result = await execute_sync_plan(plan, dry_run=False, client=client)

    # Report results
    if result.errors:
        for err in result.errors:
            error(err)

    if result.yaml_modified:
        success("Updated sprint YAML")

    if result.jira_api_calls > 0:
        success(f"Made {result.jira_api_calls} Jira API calls")

    success(f"Applied {result.changes_applied}/{result.changes_planned} changes")

    return 0 if not result.errors else 1


def main(args: list[str] | None = None) -> int:
    """Main entry point.

    Args:
        args: Command line arguments (defaults to sys.argv[1:])

    Returns:
        Exit code
    """
    parsed_args = parse_cli_args(args)
    return asyncio.run(async_main(parsed_args))


if __name__ == "__main__":
    sys.exit(main())
