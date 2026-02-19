"""
Bidirectional sync between BMAD markdown and PF sprint YAML.

Modeled on pf/jira/bidirectional.py — same
SyncPlan/SyncChange/SyncResult pattern, adapted for BMAD's flat
markdown header format instead of a REST API.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from pf.bmad.parser import (
    discover_bmad_stories,
    map_bmad_to_pf,
    map_pf_to_bmad,
)
from pf.common.config import get_project_root, load_pennyfarthing_config
from pf.common.output import error, info, success, warn


# =============================================================================
# Data Classes
# =============================================================================


@dataclass
class BmadSyncChange:
    """A single sync change to apply."""

    bmad_key: str
    pf_id: str
    field: Literal["status"]
    action: Literal["update-pf", "update-bmad"]
    pf_value: Any
    bmad_value: Any
    target_value: Any


@dataclass
class BmadSyncPlan:
    """Result of comparing PF YAML and BMAD markdown."""

    changes: list[BmadSyncChange] = field(default_factory=list)
    pf_only: list[str] = field(default_factory=list)
    bmad_only: list[str] = field(default_factory=list)
    both: list[str] = field(default_factory=list)
    conflicts: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class BmadSyncResult:
    """Result of executing a sync plan."""

    dry_run: bool
    changes_planned: int
    changes_applied: int
    pf_modified: bool
    bmad_modified: bool
    new_stories_imported: int = 0
    errors: list[str] = field(default_factory=list)


# =============================================================================
# Sync Plan Generation
# =============================================================================


def _collect_pf_stories(sprint_path: Path) -> list[dict[str, Any]]:
    """Load all PF stories that have a bmad_key field."""
    from pf.sprint.yaml_io import read_sprint

    data = read_sprint(sprint_path)
    stories: list[dict[str, Any]] = []
    for epic in data.get("epics", []):
        for story in epic.get("stories", []):
            if story.get("bmad_key"):
                stories.append(dict(story))
    return stories


def generate_sync_plan(
    pf_stories: list[dict[str, Any]],
    bmad_stories: list[dict[str, Any]],
    *,
    direction: Literal["pull", "push", "both"] = "both",
    pf_wins: bool = True,
) -> BmadSyncPlan:
    """Compare PF and BMAD stories and build a sync plan.

    Args:
        pf_stories: Stories from PF YAML (must have bmad_key field)
        bmad_stories: Stories parsed from BMAD markdown
        direction: "pull" (BMAD→PF), "push" (PF→BMAD), or "both"
        pf_wins: If True, PF status wins on conflict (default for push)

    Returns:
        BmadSyncPlan with changes, conflicts, and set membership.
    """
    plan = BmadSyncPlan()

    # Build lookup maps keyed on bmad_key
    pf_by_key: dict[str, dict] = {}
    for story in pf_stories:
        key = story.get("bmad_key", "")
        if key:
            pf_by_key[key] = story

    bmad_by_key: dict[str, dict] = {}
    for story in bmad_stories:
        key = story.get("bmad_key", "")
        if key:
            bmad_by_key[key] = story

    pf_keys = set(pf_by_key.keys())
    bmad_keys = set(bmad_by_key.keys())

    plan.pf_only = sorted(pf_keys - bmad_keys)
    plan.bmad_only = sorted(bmad_keys - pf_keys)
    plan.both = sorted(pf_keys & bmad_keys)

    # Compare matched stories
    for key in plan.both:
        pf_story = pf_by_key[key]
        bmad_story = bmad_by_key[key]

        pf_status = pf_story.get("status", "planning")
        bmad_status_raw = bmad_story.get("bmad_status", "draft")
        bmad_status_as_pf = map_bmad_to_pf(bmad_status_raw)

        if pf_status == bmad_status_as_pf:
            continue  # In sync

        pf_id = pf_story.get("id", key)

        if direction == "pull":
            # BMAD → PF
            plan.changes.append(
                BmadSyncChange(
                    bmad_key=key,
                    pf_id=pf_id,
                    field="status",
                    action="update-pf",
                    pf_value=pf_status,
                    bmad_value=bmad_status_raw,
                    target_value=bmad_status_as_pf,
                )
            )
        elif direction == "push":
            # PF → BMAD
            target_bmad = map_pf_to_bmad(pf_status)
            plan.changes.append(
                BmadSyncChange(
                    bmad_key=key,
                    pf_id=pf_id,
                    field="status",
                    action="update-bmad",
                    pf_value=pf_status,
                    bmad_value=bmad_status_raw,
                    target_value=target_bmad,
                )
            )
        else:
            # Both directions — resolve by pf_wins flag
            if pf_wins:
                target_bmad = map_pf_to_bmad(pf_status)
                plan.changes.append(
                    BmadSyncChange(
                        bmad_key=key,
                        pf_id=pf_id,
                        field="status",
                        action="update-bmad",
                        pf_value=pf_status,
                        bmad_value=bmad_status_raw,
                        target_value=target_bmad,
                    )
                )
            else:
                plan.changes.append(
                    BmadSyncChange(
                        bmad_key=key,
                        pf_id=pf_id,
                        field="status",
                        action="update-pf",
                        pf_value=pf_status,
                        bmad_value=bmad_status_raw,
                        target_value=bmad_status_as_pf,
                    )
                )

    return plan


# =============================================================================
# Sync Plan Execution
# =============================================================================


def _update_bmad_file_status(bmad_path: str, new_status: str) -> bool:
    """Rewrite the Status: line in a BMAD markdown file.

    Args:
        bmad_path: Absolute path to the .md file
        new_status: New BMAD status string (e.g. "completed")

    Returns:
        True if the file was modified.
    """
    path = Path(bmad_path)
    if not path.exists():
        return False

    content = path.read_text()
    new_content, count = re.subn(
        r"^(Status:\s*)(.+)$",
        rf"\g<1>{new_status}",
        content,
        count=1,
        flags=re.MULTILINE,
    )
    if count == 0:
        return False

    path.write_text(new_content)
    return True


def execute_sync_plan(
    plan: BmadSyncPlan,
    *,
    dry_run: bool = False,
    sprint_path: Path | None = None,
    bmad_root: Path | None = None,
    import_new: bool = False,
    repos: str = "axiathon",
) -> BmadSyncResult:
    """Execute a sync plan.

    Args:
        plan: The sync plan to execute
        dry_run: If True, report without applying
        sprint_path: Path to PF sprint YAML
        bmad_root: Path to BMAD _bmad-output/ root
        import_new: If True, import bmad_only stories as new PF stories
        repos: Default repos for new story imports

    Returns:
        BmadSyncResult with counts and errors.
    """
    result = BmadSyncResult(
        dry_run=dry_run,
        changes_planned=len(plan.changes),
        changes_applied=0,
        pf_modified=False,
        bmad_modified=False,
    )

    if dry_run:
        return result

    # Apply PF updates (YAML)
    pf_updates = [c for c in plan.changes if c.action == "update-pf"]
    if pf_updates and sprint_path:
        from pf.sprint.story_update import update_story

        for change in pf_updates:
            update_result = update_story(
                sprint_path,
                change.pf_id,
                status=change.target_value,
            )
            if update_result.get("success"):
                result.changes_applied += 1
                result.pf_modified = True
            else:
                result.errors.append(
                    f"{change.pf_id}: PF update failed — {update_result.get('error', 'unknown')}"
                )

    # Apply BMAD updates (markdown files)
    bmad_updates = [c for c in plan.changes if c.action == "update-bmad"]
    if bmad_updates:
        # Need bmad story data to find file paths
        # Re-discover to get bmad_path for each key
        bmad_paths: dict[str, str] = {}
        if bmad_root:
            config = load_pennyfarthing_config()
            bmad_config = config.get("bmad", {})
            story_subdir = bmad_config.get("story_dir", "implementation-artifacts")
            from pf.bmad.parser import discover_bmad_stories as _discover

            all_bmad = _discover(bmad_root, story_dir=story_subdir)
            bmad_paths = {s["bmad_key"]: s["bmad_path"] for s in all_bmad}

        for change in bmad_updates:
            file_path = bmad_paths.get(change.bmad_key)
            if not file_path:
                result.errors.append(f"{change.bmad_key}: BMAD file not found")
                continue
            if _update_bmad_file_status(file_path, change.target_value):
                result.changes_applied += 1
                result.bmad_modified = True
            else:
                result.errors.append(f"{change.bmad_key}: Failed to update Status line")

    # Import new BMAD stories not yet in PF
    if import_new and plan.bmad_only and sprint_path and bmad_root:
        result.new_stories_imported = _import_new_stories(
            plan.bmad_only, bmad_root, sprint_path, repos, result
        )

    return result


def _import_new_stories(
    bmad_keys: list[str],
    bmad_root: Path,
    sprint_path: Path,
    repos: str,
    result: BmadSyncResult,
) -> int:
    """Import stories that exist in BMAD but not PF.

    Returns count of successfully imported stories.
    """
    from pf.bmad.parser import discover_bmad_stories as _discover
    from pf.sprint.yaml_io import read_sprint, write_sprint

    config = load_pennyfarthing_config()
    bmad_config = config.get("bmad", {})
    story_subdir = bmad_config.get("story_dir", "implementation-artifacts")

    all_bmad = _discover(bmad_root, story_dir=story_subdir)
    bmad_by_key = {s["bmad_key"]: s for s in all_bmad}

    data = read_sprint(sprint_path)
    imported = 0

    for key in bmad_keys:
        bmad_story = bmad_by_key.get(key)
        if not bmad_story:
            continue

        epic_num = int(bmad_story["epic_num"])

        # Find or create the epic in sprint data
        target_epic = None
        for epic in data.get("epics", []):
            epic_id = str(epic.get("id", "")).replace("epic-", "")
            if epic_id == str(epic_num):
                target_epic = epic
                break

        if target_epic is None:
            # Create new epic shard
            target_epic = {
                "id": str(epic_num),
                "title": f"Epic {epic_num}",
                "status": "planning",
                "priority": "P1",
                "marker": "bmad",
                "repos": repos,
                "stories": [],
            }
            data.setdefault("epics", []).append(target_epic)

        # Add story
        pf_story = {
            "id": bmad_story["id"],
            "title": bmad_story["title"],
            "points": bmad_story.get("points", 3),
            "priority": bmad_story.get("priority", "P1"),
            "status": bmad_story["status"],
            "repos": repos,
            "workflow": bmad_story.get("workflow", "tdd"),
            "bmad_key": key,
        }
        target_epic.setdefault("stories", []).append(pf_story)
        imported += 1

    if imported > 0:
        write_sprint(sprint_path, data)
        result.pf_modified = True

    return imported


# =============================================================================
# Formatting
# =============================================================================


def format_sync_plan(plan: BmadSyncPlan) -> str:
    """Format a sync plan for human-readable display.

    Args:
        plan: The plan to format

    Returns:
        Formatted string.
    """
    lines: list[str] = []

    lines.append(f"Matched: {len(plan.both)}  |  PF-only: {len(plan.pf_only)}  |  BMAD-only: {len(plan.bmad_only)}")
    lines.append("")

    if plan.changes:
        lines.append(f"Changes ({len(plan.changes)}):")
        for c in plan.changes:
            arrow = "BMAD→PF" if c.action == "update-pf" else "PF→BMAD"
            lines.append(
                f"  {c.pf_id} ({c.bmad_key}): {c.field} {arrow}  "
                f"{c.pf_value!r} / {c.bmad_value!r} → {c.target_value!r}"
            )
        lines.append("")

    if plan.bmad_only:
        lines.append(f"New in BMAD ({len(plan.bmad_only)}):")
        for key in plan.bmad_only:
            lines.append(f"  {key}")
        lines.append("")

    if plan.pf_only:
        lines.append(f"PF-only ({len(plan.pf_only)}):")
        for key in plan.pf_only:
            lines.append(f"  {key}")
        lines.append("")

    if not plan.changes and not plan.bmad_only and not plan.pf_only:
        lines.append("Everything is in sync.")

    return "\n".join(lines)


# =============================================================================
# Drift Report
# =============================================================================


def drift_report(
    sprint_path: Path,
    bmad_root: Path,
) -> str:
    """Generate a drift report showing what's out of sync.

    Args:
        sprint_path: Path to PF sprint YAML
        bmad_root: Path to BMAD _bmad-output/ root

    Returns:
        Formatted drift report string.
    """
    config = load_pennyfarthing_config()
    bmad_config = config.get("bmad", {})
    story_subdir = bmad_config.get("story_dir", "implementation-artifacts")

    pf_stories = _collect_pf_stories(sprint_path)
    bmad_stories = discover_bmad_stories(bmad_root, story_dir=story_subdir)

    plan = generate_sync_plan(pf_stories, bmad_stories, direction="both")
    return format_sync_plan(plan)
