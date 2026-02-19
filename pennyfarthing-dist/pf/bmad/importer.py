"""
BMAD project importer — initial import from BMAD markdown to PF sprint YAML.

Creates current-sprint.yaml + epic shard files from BMAD's
implementation-artifacts/ and planning-artifacts/epics/ directories.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

from pf.bmad.parser import (
    discover_bmad_epics,
    discover_bmad_stories,
    map_bmad_to_pf,
)
from pf.common.config import get_project_root, load_pennyfarthing_config


def _get_bmad_config(project_root: Path) -> dict[str, Any]:
    """Read bmad section from .pennyfarthing/config.local.yaml."""
    config = load_pennyfarthing_config(project_root)
    return config.get("bmad", {})


def _group_stories_by_epic(stories: list[dict]) -> dict[int, list[dict]]:
    """Group story dicts by their epic number."""
    groups: dict[int, list[dict]] = {}
    for story in stories:
        epic_num = int(story["epic_num"])
        groups.setdefault(epic_num, []).append(story)
    return groups


def _build_epic_shard(
    epic_num: int,
    epic_meta: dict[str, Any] | None,
    stories: list[dict],
    repos: str,
) -> dict[str, Any]:
    """Build a PF epic shard dict from BMAD data.

    Args:
        epic_num: Epic number
        epic_meta: Parsed BMAD epic metadata (or None if no epic file)
        stories: List of parsed BMAD story dicts for this epic
        repos: Default repos value

    Returns:
        PF epic shard dict ready for validation and writing.
    """
    title = epic_meta["title"] if epic_meta else f"Epic {epic_num}"
    phase = epic_meta.get("phase", "MVP") if epic_meta else "MVP"

    pf_stories: list[dict[str, Any]] = []
    for story in stories:
        pf_story: dict[str, Any] = {
            "id": story["id"],
            "title": story["title"],
            "points": story.get("points", 3),
            "priority": story.get("priority", "P1"),
            "status": story["status"],
            "repos": repos,
            "workflow": story.get("workflow", "tdd"),
            "bmad_key": story["bmad_key"],
        }
        if story.get("jira"):
            pf_story["jira"] = story["jira"]
        pf_stories.append(pf_story)

    total_points = sum(s.get("points", 3) for s in pf_stories)

    return {
        "id": str(epic_num),
        "title": title,
        "status": "planning",
        "description": f"Phase: {phase}",
        "priority": "P1",
        "points": total_points,
        "marker": "bmad",
        "repos": repos,
        "stories": pf_stories,
    }


def import_bmad_project(
    bmad_root: Path,
    sprint_dir: Path,
    *,
    repos: str = "axiathon",
    dry_run: bool = False,
    project_root: Path | None = None,
) -> dict[str, Any]:
    """Import a BMAD project into PF sprint YAML.

    Args:
        bmad_root: Path to BMAD _bmad-output/ directory
        sprint_dir: Path to PF sprint/ directory
        repos: Default repos value for stories
        dry_run: If True, preview without writing
        project_root: Project root (auto-detect if None)

    Returns:
        Result dict with success, counts, and details.
    """
    from pf.sprint.validator import validate_epic_shard
    from pf.sprint.yaml_io import write_sprint

    root = project_root or get_project_root()
    bmad_config = _get_bmad_config(root)

    # Resolve paths from config if available
    story_subdir = bmad_config.get("story_dir", "implementation-artifacts")
    epic_subdir = bmad_config.get("epic_dir", "planning-artifacts/epics")

    # Discover BMAD content
    stories = discover_bmad_stories(bmad_root, story_dir=story_subdir)
    epics_meta = discover_bmad_epics(bmad_root, epic_dir=epic_subdir)

    if not stories:
        return {"success": False, "error": f"No stories found in {bmad_root / story_subdir}"}

    # Build epic metadata lookup
    epic_lookup: dict[int, dict] = {e["epicNumber"]: e for e in epics_meta}

    # Group stories by epic
    grouped = _group_stories_by_epic(stories)

    # Build epic shards
    epic_shards: list[dict[str, Any]] = []
    validation_errors: list[str] = []

    for epic_num in sorted(grouped.keys()):
        epic_stories = grouped[epic_num]
        epic_meta = epic_lookup.get(epic_num)
        shard = _build_epic_shard(epic_num, epic_meta, epic_stories, repos)

        # Validate
        result = validate_epic_shard(shard)
        if not result.valid:
            msgs = "; ".join(e.message for e in result.errors)
            validation_errors.append(f"Epic {epic_num}: {msgs}")
        else:
            epic_shards.append(shard)

    if validation_errors:
        return {
            "success": False,
            "error": "Validation failed:\n  " + "\n  ".join(validation_errors),
        }

    total_stories = sum(len(e["stories"]) for e in epic_shards)
    total_points = sum(e.get("points", 0) for e in epic_shards)

    if dry_run:
        return {
            "success": True,
            "dry_run": True,
            "epics_count": len(epic_shards),
            "stories_count": total_stories,
            "total_points": total_points,
            "epic_ids": [e["id"] for e in epic_shards],
            "message": (
                f"Would import {len(epic_shards)} epics, "
                f"{total_stories} stories ({total_points} points)"
            ),
        }

    # Build sprint data structure
    today = date.today().isoformat()
    sprint_data: dict[str, Any] = {
        "sprint": {
            "name": "BMAD Import",
            "goal": f"Imported from BMAD on {today}",
            "start_date": today,
            "end_date": today,
            "status": "active",
        },
        "epics": epic_shards,
    }

    # Write using shard-aware writer
    sprint_path = sprint_dir / "current-sprint.yaml"
    sprint_dir.mkdir(parents=True, exist_ok=True)
    write_sprint(sprint_path, sprint_data)

    return {
        "success": True,
        "epics_count": len(epic_shards),
        "stories_count": total_stories,
        "total_points": total_points,
        "sprint_path": str(sprint_path),
        "message": (
            f"Imported {len(epic_shards)} epics, "
            f"{total_stories} stories ({total_points} points) "
            f"to {sprint_path}"
        ),
    }
