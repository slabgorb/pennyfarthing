"""
Sprint epic archiving.

Provides functions for archiving completed epics to sprint archive files.
Handles archive file creation, epic completion detection, and YAML updates.
"""

from datetime import date
from pathlib import Path
from typing import Any

from pennyfarthing_scripts.common.config import get_project_root, load_yaml_config
from pennyfarthing_scripts.sprint.loader import load_sprint
from pennyfarthing_scripts.sprint.yaml_io import write_sprint


def get_archive_path(project_root: Path | None = None) -> Path:
    """Get the archive file path for the current sprint.

    Creates the archive file with a template if it doesn't exist.

    Args:
        project_root: Project root path (defaults to auto-detect)

    Returns:
        Path to the sprint archive file
    """
    root = project_root or get_project_root()
    sprint_data = load_sprint(root)

    if not sprint_data or "sprint" not in sprint_data:
        raise ValueError("Could not load sprint data")

    sprint_info = sprint_data["sprint"]

    # Extract sprint identifier (YYWW format from jira_sprint_name)
    sprint_name = sprint_info.get("jira_sprint_name", "")
    # Extract "2604" from "TO Sprint 2604"
    sprint_id = sprint_name.split()[-1] if sprint_name else str(sprint_info.get("number", "unknown"))

    archive_path = root / "sprint" / "archive" / f"sprint-{sprint_id}-completed.yaml"
    return archive_path


def ensure_archive_file(project_root: Path | None = None) -> Path:
    """Ensure archive file exists, creating with template if needed.

    Args:
        project_root: Project root path (defaults to auto-detect)

    Returns:
        Path to the archive file
    """
    root = project_root or get_project_root()
    archive_path = get_archive_path(root)

    if archive_path.exists():
        return archive_path

    # Create archive file with template
    sprint_data = load_sprint(root)
    sprint_info = sprint_data.get("sprint", {})

    sprint_name = sprint_info.get("jira_sprint_name", "Unknown Sprint")
    sprint_id = sprint_info.get("jira_sprint_id", "")
    goal = sprint_info.get("goal", "")

    template = f"""# Sprint {sprint_name} - Completed Stories
# Jira Sprint ID: {sprint_id}
# Archived: {date.today().isoformat()}

sprint:
  name: "{sprint_name}"
  jira_sprint_id: {sprint_id}
  jira_sprint_name: "{sprint_name}"
  goal: {goal}

completed:
"""

    archive_path.parent.mkdir(parents=True, exist_ok=True)
    archive_path.write_text(template)

    return archive_path


def is_epic_complete(epic: dict[str, Any]) -> tuple[bool, list[str]]:
    """Check if an epic is complete by examining story statuses.

    An epic is complete if:
    - It has status 'done' or 'completed', OR
    - All of its stories have a terminal status ('done', 'completed', or 'cancelled')

    Args:
        epic: Epic dict from sprint YAML

    Returns:
        Tuple of (is_complete, list of incomplete story IDs)
    """
    # Check if epic itself is marked done
    epic_status = epic.get("status", "backlog")
    if epic_status in ("done", "completed"):
        return True, []

    # Check all stories
    stories = epic.get("stories", [])
    if not stories:
        return False, []

    incomplete = []
    for story in stories:
        story_status = story.get("status", "backlog")
        if story_status not in ("done", "completed", "cancelled"):
            incomplete.append(story.get("id", "unknown"))

    return len(incomplete) == 0, incomplete


def get_completed_epics(project_root: Path | None = None) -> list[dict[str, Any]]:
    """Get all epics that are complete (by status or story completion).

    Args:
        project_root: Project root path (defaults to auto-detect)

    Returns:
        List of completed epic dicts with completion info
    """
    root = project_root or get_project_root()
    sprint_data = load_sprint(root)

    if not sprint_data or "epics" not in sprint_data:
        return []

    completed = []
    for epic in sprint_data["epics"]:
        is_complete, incomplete_stories = is_epic_complete(epic)
        if is_complete:
            completed.append({
                "epic": epic,
                "incomplete_stories": incomplete_stories,
            })

    return completed


def archive_epic(
    epic_id: str,
    *,
    project_root: Path | None = None,
    dry_run: bool = False,
    update_jira: bool = False,
) -> dict[str, Any]:
    """Archive a completed epic.

    Args:
        epic_id: Epic ID to archive (e.g., "epic-64" or "MSSCI-12465")
        project_root: Project root path (defaults to auto-detect)
        dry_run: If True, show what would be done without making changes
        update_jira: If True, also transition epic to Done in Jira

    Returns:
        Dict with success status and details
    """
    root = project_root or get_project_root()
    sprint_data = load_sprint(root)

    if not sprint_data or "epics" not in sprint_data:
        return {"success": False, "error": "Could not load sprint data"}

    # Find the epic
    epic = None
    epic_index = None
    for i, e in enumerate(sprint_data["epics"]):
        if e.get("id") == epic_id or e.get("jira") == epic_id:
            epic = e
            epic_index = i
            break

    if not epic:
        return {"success": False, "error": f"Epic '{epic_id}' not found"}

    # Check completion
    is_complete, incomplete = is_epic_complete(epic)
    if not is_complete:
        return {
            "success": False,
            "error": f"Epic has {len(incomplete)} incomplete stories",
            "incomplete_stories": incomplete,
        }

    if dry_run:
        return {
            "success": True,
            "dry_run": True,
            "epic": epic,
            "message": f"Would archive {epic_id} ({len(epic.get('stories', []))} stories)",
        }

    # Ensure archive file exists
    archive_path = ensure_archive_file(root)

    # Build archive entries for all stories
    archive_entries = []
    epic_jira = epic.get("jira", epic_id)
    for story in epic.get("stories", []):
        entry = {
            "id": story.get("id") or story.get("jira"),
            "epic": epic_jira,
            "title": story.get("title", ""),
            "points": story.get("points", 0),
            "completed": story.get("completed", date.today().isoformat()),
        }
        if story.get("pr"):
            entry["pr"] = story["pr"]
        archive_entries.append(entry)

    # Append to archive file
    with open(archive_path, "a") as f:
        # Add epic header comment
        epic_title = epic.get("title", epic_id)
        f.write(f"\n  # {epic_id}: {epic_title} - COMPLETE\n")

        for entry in archive_entries:
            f.write(f"  - id: {entry['id']}\n")
            f.write(f"    epic: {entry['epic']}\n")
            # Escape quotes in title
            title = entry['title'].replace('"', '\\"')
            f.write(f'    title: "{title}"\n')
            f.write(f"    points: {entry['points']}\n")
            f.write(f"    completed: {entry['completed']}\n")
            if entry.get("pr"):
                f.write(f"    pr: {entry['pr']}\n")

    # Remove epic from current-sprint.yaml
    sprint_path = root / "sprint" / "current-sprint.yaml"
    del sprint_data["epics"][epic_index]

    # Note: We do NOT update completed_points here because stories were already
    # marked done - their points are already counted. Archiving just moves them
    # to the archive file without changing the accounting.

    # Write updated sprint file (shard-aware)
    write_sprint(sprint_path, sprint_data)

    # Clean up shard file if it exists
    epic_jira_key = epic.get("jira", "")
    epic_id_val = str(epic.get("id", ""))
    sprint_dir = root / "sprint"
    for ref in [epic_jira_key, epic_id_val]:
        if ref:
            shard_file = sprint_dir / f"epic-{ref}.yaml"
            if shard_file.exists():
                shard_file.unlink()
                break

    result = {
        "success": True,
        "epic_id": epic_id,
        "jira": epic_jira,
        "stories_archived": len(archive_entries),
        "archive_path": str(archive_path),
        "message": f"Archived {epic_id} with {len(archive_entries)} stories",
    }

    # Update Jira if requested
    if update_jira and epic_jira:
        result["jira_updated"] = _update_jira_epic(epic_jira)

    return result


def _update_jira_epic(jira_key: str) -> bool:
    """Transition a Jira epic to Done.

    Args:
        jira_key: Jira issue key (e.g., "MSSCI-12465")

    Returns:
        True if successful, False otherwise
    """
    import subprocess

    try:
        result = subprocess.run(
            ["jira", "issue", "move", jira_key, "Done"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.returncode == 0
    except Exception:
        return False


def archive_all_completed(
    *,
    project_root: Path | None = None,
    dry_run: bool = False,
    update_jira: bool = False,
) -> dict[str, Any]:
    """Archive all completed epics.

    Args:
        project_root: Project root path (defaults to auto-detect)
        dry_run: If True, show what would be done without making changes
        update_jira: If True, also transition epics to Done in Jira

    Returns:
        Dict with results for each epic
    """
    root = project_root or get_project_root()
    completed = get_completed_epics(root)

    if not completed:
        return {
            "success": True,
            "message": "No completed epics found",
            "archived": [],
        }

    results = []
    for item in completed:
        epic = item["epic"]
        epic_id = epic.get("id")
        result = archive_epic(
            epic_id,
            project_root=root,
            dry_run=dry_run,
            update_jira=update_jira,
        )
        results.append(result)

    return {
        "success": all(r.get("success") for r in results),
        "archived": results,
        "message": f"Processed {len(results)} epics",
    }


def main(args: list[str] | None = None) -> int:
    """CLI entry point for epic archiving.

    Args:
        args: Command line arguments

    Returns:
        Exit code
    """
    import argparse
    import sys

    parser = argparse.ArgumentParser(
        description="Archive completed epics from current sprint"
    )
    parser.add_argument(
        "epic_id",
        nargs="?",
        help="Epic ID to archive (omit to scan all)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes",
    )
    parser.add_argument(
        "--jira",
        action="store_true",
        help="Also update Jira epic status to Done",
    )

    parsed = parser.parse_args(args)

    if parsed.epic_id:
        result = archive_epic(
            parsed.epic_id,
            dry_run=parsed.dry_run,
            update_jira=parsed.jira,
        )
    else:
        result = archive_all_completed(
            dry_run=parsed.dry_run,
            update_jira=parsed.jira,
        )

    if result.get("success"):
        if parsed.dry_run:
            print("[DRY-RUN]", result.get("message"))
            if "archived" in result:
                for r in result["archived"]:
                    epic_id = r.get("epic", {}).get("id") if "epic" in r else r.get("epic_id")
                    stories = len(r.get("epic", {}).get("stories", [])) if "epic" in r else r.get("stories_archived", 0)
                    print(f"  Would archive: {epic_id} ({stories} stories)")
        else:
            print(result.get("message"))
            if "archived" in result:
                for r in result["archived"]:
                    print(f"  ✓ {r.get('epic_id')}: {r.get('stories_archived')} stories")
        return 0
    else:
        print(f"Failed: {result.get('error')}", file=sys.stderr)
        if result.get("incomplete_stories"):
            print(f"  Incomplete: {', '.join(result['incomplete_stories'])}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
