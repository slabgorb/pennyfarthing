"""
Sprint epic archiving.

Archives completed epics by moving their shard files to sprint/archive/.
The sprint completed file references archived epics by ID (not inlined).
"""

import shutil
from datetime import date
from pathlib import Path
from typing import Any

from pennyfarthing_scripts.common.config import get_project_root
from pennyfarthing_scripts.sprint.loader import load_sprint
from pennyfarthing_scripts.sprint.yaml_io import (
    _get_epic_ref,
    _make_yaml,
    _read_yaml_file,
    _write_yaml_file,
    read_sprint,
)


def get_archive_path(project_root: Path | None = None) -> Path:
    """Get the archive file path for the current sprint.

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

    sprint_name = sprint_info.get("jira_sprint_name", "")
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

    sprint_data = load_sprint(root)
    sprint_info = sprint_data.get("sprint", {})

    sprint_name = sprint_info.get("jira_sprint_name", "Unknown Sprint")
    sprint_id = sprint_info.get("jira_sprint_id", "")
    sprint_number = sprint_info.get("number", "")
    goal = sprint_info.get("goal", "")
    start_date = sprint_info.get("start_date", "")
    end_date = sprint_info.get("end_date", "")
    status = sprint_info.get("status", "active")

    template = f"""# Sprint {sprint_name} - Completed Work
# Jira Sprint ID: {sprint_id}
# Archived: {date.today().isoformat()}

sprint:
  name: "{sprint_name}"
  number: {sprint_number}
  jira_sprint_id: {sprint_id}
  jira_sprint_name: "{sprint_name}"
  goal: {goal}
  start_date: {start_date}
  end_date: {end_date}
  status: {status}

completed_epics:
  # Epic shard files live in sprint/archive/epic-{{ref}}.yaml

completed_stories:
  # Orphan stories not belonging to an epic
"""

    archive_path.parent.mkdir(parents=True, exist_ok=True)
    archive_path.write_text(template)

    return archive_path


def _load_archive_file(archive_path: Path) -> dict[str, Any]:
    """Load the sprint archive file, handling both old and new formats.

    Args:
        archive_path: Path to the archive YAML file

    Returns:
        Archive data dict with completed_epics and completed_stories
    """
    yml = _make_yaml()
    with open(archive_path) as f:
        data = yml.load(f)

    if data is None:
        data = {}

    # Ensure new-format keys exist
    if "completed_epics" not in data:
        data["completed_epics"] = []
    if "completed_stories" not in data:
        data["completed_stories"] = []

    # Normalize: ensure lists are not None
    if data["completed_epics"] is None:
        data["completed_epics"] = []
    if data["completed_stories"] is None:
        data["completed_stories"] = []

    return data


def _write_archive_file(archive_path: Path, data: dict[str, Any]) -> None:
    """Write the sprint archive file.

    Args:
        archive_path: Path to the archive YAML file
        data: Archive data dict
    """
    import io

    from ruamel.yaml.comments import CommentedMap, CommentedSeq

    yml = _make_yaml()

    # Build output preserving comments at the top
    cm = CommentedMap()
    if "sprint" in data:
        cm["sprint"] = data["sprint"]

    # completed_epics as string refs
    epic_refs = CommentedSeq()
    for ref in data.get("completed_epics", []):
        epic_refs.append(ref)
    cm["completed_epics"] = epic_refs

    # completed_stories for orphans
    stories = CommentedSeq()
    for story in data.get("completed_stories", []):
        stories.append(story)
    cm["completed_stories"] = stories

    stream = io.StringIO()
    yml.dump(cm, stream)
    output = stream.getvalue()

    # Clean trailing whitespace
    lines = output.split("\n")
    cleaned = [line.rstrip() for line in lines]
    result = "\n".join(cleaned).rstrip("\n") + "\n"

    archive_path.write_text(result)


def is_epic_complete(epic: dict[str, Any]) -> tuple[bool, list[str]]:
    """Check if an epic is complete by examining story statuses.

    Args:
        epic: Epic dict from sprint YAML

    Returns:
        Tuple of (is_complete, list of incomplete story IDs)
    """
    epic_status = epic.get("status", "backlog")
    if epic_status in ("done", "completed"):
        return True, []

    stories = epic.get("stories", [])
    if not stories:
        return False, []

    incomplete = []
    for story in stories:
        story_status = story.get("status", "backlog")
        if story_status not in ("done", "completed", "canceled", "cancelled"):
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

    Moves the epic shard file to sprint/archive/, adds the epic ref to the
    sprint completed file, and removes it from the current sprint index.
    Context files are also moved to archive.

    Args:
        epic_id: Epic ID to archive (e.g., "epic-64" or "MSSCI-12465")
        project_root: Project root path (defaults to auto-detect)
        dry_run: If True, show what would be done without making changes
        update_jira: If True, also transition epic to Done in Jira

    Returns:
        Dict with success status and details
    """
    root = project_root or get_project_root()
    sprint_dir = root / "sprint"
    archive_dir = sprint_dir / "archive"
    archive_dir.mkdir(parents=True, exist_ok=True)

    sprint_path = sprint_dir / "current-sprint.yaml"
    sprint_data = read_sprint(sprint_path)

    if not sprint_data or "epics" not in sprint_data:
        return {"success": False, "error": "Could not load sprint data"}

    # Find the epic in merged data
    epic = None
    for e in sprint_data["epics"]:
        eid = str(e.get("id", ""))
        ejira = str(e.get("jira", ""))
        if eid == epic_id or ejira == epic_id:
            epic = e
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

    # Determine the shard ref (filename stem)
    epic_ref = _get_epic_ref(epic)
    shard_file = sprint_dir / f"epic-{epic_ref}.yaml"
    archive_shard = archive_dir / f"epic-{epic_ref}.yaml"
    story_count = len(epic.get("stories", []))
    total_points = sum(s.get("points", 0) for s in epic.get("stories", []))

    if dry_run:
        msg_parts = [f"Would archive {epic_id} ({story_count} stories, {total_points} pts)"]
        if shard_file.exists():
            msg_parts.append(f"  Move: {shard_file.name} → archive/")
        # Check for context file
        for ctx_name in [f"context-epic-{epic_ref}.md", f"context-epic-{epic.get('id', '')}.md"]:
            ctx_file = sprint_dir / "context" / ctx_name
            if ctx_file.exists():
                msg_parts.append(f"  Move: context/{ctx_name} → archive/")
                break
        return {
            "success": True,
            "dry_run": True,
            "epic": epic,
            "stories_archived": story_count,
            "total_points": total_points,
            "message": "\n".join(msg_parts),
        }

    # 1. Update epic status in the shard before moving
    if shard_file.exists():
        shard_data = _read_yaml_file(shard_file)
        shard_data["status"] = "done"
        if "completed" not in shard_data:
            shard_data["completed"] = date.today().isoformat()
        _write_yaml_file(shard_file, shard_data)
        # Move shard to archive
        shutil.move(str(shard_file), str(archive_shard))
    else:
        # No shard file on disk — write epic data directly to archive
        epic["status"] = "done"
        if "completed" not in epic:
            epic["completed"] = date.today().isoformat()
        _write_yaml_file(archive_shard, epic)

    # 2. Move context file if it exists
    context_moved = None
    for ctx_name in [f"context-epic-{epic_ref}.md", f"context-epic-{epic.get('id', '')}.md"]:
        ctx_file = sprint_dir / "context" / ctx_name
        if ctx_file.exists():
            shutil.move(str(ctx_file), str(archive_dir / ctx_name))
            context_moved = ctx_name
            break

    # 3. Add epic ref to sprint completed file
    archive_path = ensure_archive_file(root)
    archive_data = _load_archive_file(archive_path)

    # Add ref if not already present
    if epic_ref not in archive_data["completed_epics"]:
        archive_data["completed_epics"].append(epic_ref)
    _write_archive_file(archive_path, archive_data)

    # 4. Remove epic from current-sprint.yaml index
    # Re-read the raw index (not merged) to update refs
    yml = _make_yaml()
    with open(sprint_path) as f:
        index_data = yml.load(f)

    epics_list = index_data.get("epics", [])
    # Remove the matching ref (string) or dict
    new_epics = []
    for item in epics_list:
        if isinstance(item, str):
            if item != epic_ref:
                new_epics.append(item)
        else:
            item_id = str(item.get("id", ""))
            item_jira = str(item.get("jira", ""))
            if item_id != epic_id and item_jira != epic_id:
                new_epics.append(item)

    from ruamel.yaml.comments import CommentedSeq
    index_data["epics"] = CommentedSeq(new_epics)
    _write_yaml_file(sprint_path, index_data)

    result = {
        "success": True,
        "epic_id": epic_id,
        "epic_ref": epic_ref,
        "stories_archived": story_count,
        "total_points": total_points,
        "archive_shard": str(archive_shard),
        "context_moved": context_moved,
        "message": f"Archived {epic_id} ({story_count} stories, {total_points} pts) → archive/epic-{epic_ref}.yaml",
    }

    # Update Jira if requested
    epic_jira = epic.get("jira", "")
    if update_jira and epic_jira:
        result["jira_updated"] = _update_jira_epic(str(epic_jira))

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
        epic_id = str(epic.get("id", ""))
        result = archive_epic(
            epic_id,
            project_root=root,
            dry_run=dry_run,
            update_jira=update_jira,
        )
        results.append(result)

    total_stories = sum(r.get("stories_archived", 0) for r in results if r.get("success"))
    total_points = sum(r.get("total_points", 0) for r in results if r.get("success"))

    return {
        "success": all(r.get("success") for r in results),
        "archived": results,
        "message": f"Archived {len(results)} epics ({total_stories} stories, {total_points} pts)",
    }


def main(args: list[str] | None = None) -> int:
    """CLI entry point for epic archiving."""
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
                    print(f"  {r.get('message')}")
        else:
            print(result.get("message"))
            if "archived" in result:
                for r in result["archived"]:
                    print(f"  \u2713 {r.get('message')}")
            elif result.get("archive_shard"):
                print(f"  Shard: {result.get('archive_shard')}")
                if result.get("context_moved"):
                    print(f"  Context: {result.get('context_moved')}")
        return 0
    else:
        print(f"Failed: {result.get('error')}", file=sys.stderr)
        if result.get("incomplete_stories"):
            print(f"  Incomplete: {', '.join(result['incomplete_stories'])}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
