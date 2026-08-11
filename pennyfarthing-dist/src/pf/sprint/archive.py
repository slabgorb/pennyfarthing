"""
Sprint story archiving.

Provides functions for archiving completed stories.
"""

from collections.abc import Mapping
from typing import Any

from pf.common.config import get_project_root
from pf.sprint.archive_epic import get_archive_path
from pf.sprint.loader import get_story_by_id


def archive_story(
    story_id: str,
    pr_number: str | None = None,
    *,
    dry_run: bool = False,
    apply: bool = False,
) -> dict[str, Any]:
    """Archive a completed story to the sprint archive file.

    Args:
        story_id: Story ID to archive
        pr_number: PR number if merged via PR
        dry_run: If True, show what would be done
        apply: If True, also remove from current-sprint.yaml

    Returns:
        Dict with success status and details
    """
    from datetime import date

    # Find the story
    story = get_story_by_id(story_id)
    if not story:
        return {
            "success": False,
            "error": f"Story '{story_id}' not found in sprint YAML",
        }

    # Check status
    status = story.get("status", "backlog")
    if status not in ("done", "completed", "in_review"):
        return {
            "success": False,
            "error": f"Story status is '{status}', expected 'done' or 'completed'",
        }

    root = get_project_root()
    sprint_file = root / "sprint" / "current-sprint.yaml"

    if not sprint_file.exists():
        return {"success": False, "error": f"Sprint file not found: {sprint_file}"}

    # Load sprint data (used below for epic lookup and --apply removal).
    # Read through the shard-merging reader (story 162-17): a raw yaml.safe_load
    # leaves a sharded index's epics as ID strings, which made the --apply
    # removal below a silent no-op.
    from pf.sprint.yaml_io import read_sprint

    try:
        sprint_data = read_sprint(sprint_file)
    except (OSError, ValueError) as e:
        return {"success": False, "error": f"Failed to read {sprint_file}: {e}"}

    # Resolve the archive filename via the shared resolver (story 151-1):
    # prefer name/jira_sprint_name, fall back to sprint.number, and fail loud
    # if neither is set — never silently write sprint-unknown-completed.yaml (gh #28).
    try:
        archive_file = get_archive_path(project_root=root)
    except ValueError as e:
        return {"success": False, "error": str(e)}

    # Find parent epic
    epic_id = ""
    for epic in sprint_data.get("epics", []):
        if isinstance(epic, dict):
            for s in epic.get("stories", []):
                if s.get("id") == story_id:
                    epic_id = str(epic.get("id", ""))
                    break

    completed_date = str(date.today())

    if dry_run:
        return {
            "success": True,
            "dry_run": True,
            "story": story,
            "pr_number": pr_number,
            "message": f"Would archive {story_id} to {archive_file}",
        }

    # Append to archive file
    if not archive_file.exists():
        return {"success": False, "error": f"Archive file not found: {archive_file}"}

    entry_lines = [
        f"  - id: {story_id}",
        f"    epic: {epic_id}",
        f'    title: "{story.get("title", "Unknown")}"',
        f"    points: {story.get('points', 0)}",
        f"    completed: {completed_date}",
    ]
    if pr_number:
        entry_lines.append(f"    pr: {pr_number}")

    with open(archive_file, "a", encoding="utf-8") as f:
        f.write("\n".join(entry_lines) + "\n")

    msg = f"Archived {story_id} to {archive_file.name}"

    # Remove from current sprint if --apply.
    # Story 162-17: cover every representation the loader reads — inline epic
    # stories, sharded epic stories (merged in above), and the top-level
    # standalone_stories/stories lists — and only claim removal if one happened.
    if apply:
        removed = False

        def _without_story(stories: Any) -> list[Any]:
            nonlocal removed
            original = list(stories or [])
            kept = [s for s in original if not (isinstance(s, Mapping) and s.get("id") == story_id)]
            if len(kept) != len(original):
                removed = True
            return kept

        for epic in sprint_data.get("epics", []):
            if isinstance(epic, Mapping):
                epic["stories"] = _without_story(epic.get("stories", []))

        for key in ("standalone_stories", "stories"):
            if key in sprint_data:
                sprint_data[key] = _without_story(sprint_data.get(key, []))

        from pf.sprint.yaml_io import write_sprint

        write_sprint(sprint_file, sprint_data)
        if removed:
            msg += f" and removed from {sprint_file.name}"

    return {
        "success": True,
        "story": story,
        "pr_number": pr_number,
        "message": msg,
    }


def main(args: list[str] | None = None) -> int:
    """CLI entry point for sprint archive.

    Args:
        args: Command line arguments

    Returns:
        Exit code
    """
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="Archive a completed story")
    parser.add_argument("story_id", help="Story ID to archive")
    parser.add_argument("pr_number", nargs="?", help="PR number if merged via PR")
    parser.add_argument("--apply", action="store_true", help="Also remove from current-sprint.yaml")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done")

    parsed = parser.parse_args(args)

    result = archive_story(
        parsed.story_id,
        pr_number=parsed.pr_number,
        dry_run=parsed.dry_run,
        apply=parsed.apply,
    )

    if result.get("success"):
        if result.get("dry_run"):
            print(f"[DRY-RUN] {result.get('message')}")
        else:
            print(result.get("message"))
        return 0
    else:
        print(f"Failed: {result.get('error')}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    import sys

    sys.exit(main())
