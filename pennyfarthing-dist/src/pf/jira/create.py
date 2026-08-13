"""
Create Jira stories and epics from sprint YAML definitions.

Replaces:
- create-jira-epic.sh (96 lines)
- create-jira-story.sh (92 lines)

All operations use REST API via JiraClient — no interactive prompt issues.

Usage:
    pf jira create epic <epic-id> [--dry-run]
    pf jira create story <epic-jira-key> <story-id> [--dry-run]
"""

import sys
from pathlib import Path
from typing import Any

from pf.jira.client import (
    JIRA_PROJECT,
    JiraConfigError,
    get_client,
    require_jira_project,
)
from pf.sprint.loader import find_epic, find_story, load_sprint
from pf.sprint.yaml_io import read_sprint, write_sprint

# Priority mapping: Pennyfarthing -> Jira
PRIORITY_MAP = {
    "P0": "Highest",
    "P1": "High",
    "P2": "Medium",
    "P3": "Low",
}

PROJECT_LABEL = "product-pennyfarthing"


def _get_sprint_path() -> Path:
    """Get path to current-sprint.yaml."""
    from pf.common.config import get_project_root

    return get_project_root() / "sprint" / "current-sprint.yaml"


def _build_adf_description(text: str) -> dict[str, Any]:
    """Build Atlassian Document Format description from plain text."""
    return {
        "type": "doc",
        "version": 1,
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": text}] if text else [],
            }
        ],
    }


def create_story_in_jira(
    epic_jira_key: str,
    story_id: str,
    *,
    sprint_path: Path | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Create a single Jira story from sprint YAML.

    Args:
        epic_jira_key: Parent epic Jira key (e.g., "PROJ-12077")
        story_id: Story ID from sprint YAML (e.g., "63-7")
        sprint_path: Path to sprint YAML (defaults to auto-detect)
        dry_run: If True, preview without creating

    Returns:
        {success, jira_key?, error?}
    """
    path = sprint_path or _get_sprint_path()
    data = read_sprint(path)

    # Find the story under the epic
    epic = None
    story = None
    for e in data.get("epics", []):
        if e.get("jira") == epic_jira_key or e.get("id") == epic_jira_key:
            epic = e
            story = find_story(e, story_id)
            break

    if not epic:
        return {"success": False, "error": f"Epic {epic_jira_key} not found"}
    if not story:
        return {"success": False, "error": f"Story {story_id} not found under epic {epic_jira_key}"}

    # Check if already has Jira key
    existing_key = story.get("jira")
    if existing_key:
        return {"success": False, "error": f"Story already has Jira key: {existing_key}"}

    title = story.get("title", "Untitled")
    description = story.get("description", "")
    points = story.get("points", 0)
    priority = PRIORITY_MAP.get(story.get("priority", "P2"), "Medium")

    if dry_run:
        # The sprint YAML says which epic is the parent; only Jira knows whether
        # that key still exists. Without this the real create fails on `parent`
        # after the dry run previewed success.
        parent_key = epic.get("jira") or epic_jira_key
        if not get_client().get_issue_sync(parent_key):
            return {
                "success": False,
                "error": f"Parent epic not found in Jira: {parent_key}",
            }
        print(f"[DRY RUN] Would create: {story_id} - {title}")
        print(f"  Parent: {parent_key}, Priority: {priority}, Points: {points}")
        return {"success": True, "dry_run": True, "story_id": story_id}

    try:
        project_key = require_jira_project(JIRA_PROJECT)
    except JiraConfigError as e:
        return {"success": False, "error": str(e)}

    client = get_client()

    # Build payload
    payload = {
        "fields": {
            "project": {"key": project_key},
            "summary": title,
            "description": _build_adf_description(description),
            "issuetype": {"name": "Story"},
            "parent": {"key": epic_jira_key},
            "priority": {"name": priority},
            "labels": [PROJECT_LABEL],
        }
    }

    response = client.create_issue_sync(payload)
    if not response or "key" not in response:
        return {
            "success": False,
            "error": f"Failed to create story: {response}",
        }

    jira_key = response["key"]
    print(f"Created: {jira_key} ({title})")

    # Set story points
    if points and int(points) > 0:
        client.update_issue_sync(jira_key, {"customfield_10031": int(points)})

    # Add to sprint
    sprint_info = data.get("sprint", {})
    sprint_jira_id = sprint_info.get("jira_sprint_id")
    if sprint_jira_id:
        client.add_to_sprint_sync(sprint_jira_id, jira_key)

    # Update sprint YAML with new Jira key
    story["jira"] = jira_key
    write_sprint(path, data)
    print("Updated sprint YAML")

    return {"success": True, "jira_key": jira_key}


def create_epic_in_jira(
    epic_id: str,
    *,
    sprint_path: Path | None = None,
    dry_run: bool = False,
    force: bool = False,
) -> dict[str, Any]:
    """Create a Jira epic and its child stories from sprint YAML.

    Args:
        epic_id: Epic ID from sprint YAML (e.g., "epic-63" or "63")
        sprint_path: Path to sprint YAML (defaults to auto-detect)
        dry_run: If True, preview without creating
        force: If True, create even if duplicate title detected

    Returns:
        {success, epic_key?, stories: [{id, jira_key}], error?}
    """
    path = sprint_path or _get_sprint_path()
    data = read_sprint(path)

    sprint_data = load_sprint()
    if not sprint_data:
        return {"success": False, "error": "Could not load sprint YAML"}

    epic = find_epic(sprint_data, epic_id)
    if not epic:
        return {"success": False, "error": f"Epic '{epic_id}' not found in sprint YAML"}

    # Also find it in the ruamel data for mutation
    epic_ruamel = None
    for e in data.get("epics", []):
        eid = str(e.get("id", ""))
        epic_num = epic_id.replace("epic-", "")
        if (
            eid == epic_id
            or eid == f"epic-{epic_id}"
            or eid == epic_num
            or eid.replace("epic-", "") == epic_num
        ):
            epic_ruamel = e
            break

    if not epic_ruamel:
        return {"success": False, "error": f"Epic '{epic_id}' not found in ruamel data"}

    # Validate epic shard before any Jira operations (ADR-0022)
    from pf.sprint.validator import validate_epic_shard

    validation = validate_epic_shard(dict(epic_ruamel))
    if not validation.valid:
        error_msgs = "; ".join(e.message for e in validation.errors)
        return {"success": False, "error": f"Epic validation failed: {error_msgs}"}

    title = epic.get("title", f"Epic {epic_id}")
    description = epic.get("description", "")
    epic_jira_key = epic.get("jira")

    print(f"\nEpic: {title}")
    print(f"Dry run: {dry_run}\n")

    # Create epic if needed
    if epic_jira_key:
        print(f"Epic already exists: {epic_jira_key}")
    else:
        if dry_run:
            print(f"[DRY RUN] Would create epic: {title}")
            epic_jira_key = "PROJ-XXXXX"
        else:
            try:
                project_key = require_jira_project(JIRA_PROJECT)
            except JiraConfigError as e:
                return {"success": False, "error": str(e)}

            client = get_client()

            # Idempotency check: search for existing epic with same title (ADR-0022)
            try:
                existing = client.search_issues_sync(
                    f'project = {project_key} AND issuetype = Epic AND summary ~ "{title}"'
                )
                if existing and not force:
                    existing_key = existing[0]["key"]
                    print(f"Found existing epic with same title: {existing_key}")
                    epic_jira_key = existing_key

                    # Update YAML with existing key
                    epic_ruamel["jira"] = epic_jira_key
                    write_sprint(path, data)

                    return {
                        "success": True,
                        "epic_key": epic_jira_key,
                        "duplicate_detected": True,
                        "stories": [],
                    }
                elif existing and force:
                    import warnings

                    warnings.warn(
                        f"Duplicate epic title detected ({existing[0]['key']}), "
                        "proceeding with --force",
                        stacklevel=2,
                    )
            except Exception as exc:
                import warnings

                warnings.warn(
                    f"Jira search for duplicate titles failed: {exc}",
                    stacklevel=2,
                )

            payload = {
                "fields": {
                    "project": {"key": project_key},
                    "summary": title,
                    "description": _build_adf_description(description),
                    "issuetype": {"name": "Epic"},
                    "labels": [PROJECT_LABEL],
                }
            }
            response = client.create_issue_sync(payload)
            if not response or "key" not in response:
                return {"success": False, "error": f"Failed to create epic: {response}"}

            epic_jira_key = response["key"]
            print(f"Created epic: {epic_jira_key}")

            # Update YAML
            epic_ruamel["jira"] = epic_jira_key
            write_sprint(path, data)

    # Create stories
    print("\nCreating stories...\n")

    stories_created = []
    stories = epic_ruamel.get("stories", [])
    for story in stories:
        if story.get("jira"):
            continue  # Already has Jira key

        sid = story.get("id", "")
        story_title = story.get("title", "Untitled")

        if dry_run:
            print(f"[DRY RUN] Would create: {sid} - {story_title}")
            stories_created.append({"id": sid, "dry_run": True})
        else:
            # Re-read data to pick up previous writes
            data = read_sprint(path)
            # Find epic again in fresh data
            for e in data.get("epics", []):
                if e.get("jira") == epic_jira_key or e.get("id") == epic_ruamel.get("id"):
                    for s in e.get("stories", []):
                        if s.get("id") == sid and not s.get("jira"):
                            result = create_story_in_jira(epic_jira_key, sid, sprint_path=path)
                            if result.get("success"):
                                stories_created.append(
                                    {
                                        "id": sid,
                                        "jira_key": result.get("jira_key"),
                                    }
                                )
                            else:
                                print(
                                    f"  Error creating {sid}: {result.get('error')}",
                                    file=sys.stderr,
                                )
                    break

    print(f"\nDone. View epic: jira issue view {epic_jira_key}")

    return {
        "success": True,
        "epic_key": epic_jira_key,
        "stories": stories_created,
    }
