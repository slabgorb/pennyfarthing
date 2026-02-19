"""
Sprint story archiving.

Provides functions for archiving completed stories.
"""

from typing import Any

from pf.common.config import get_project_root
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
    import re
    from datetime import date

    import yaml

    # Find the story
    story = get_story_by_id(story_id)
    if not story:
        return {
            "success": False,
            "error": f"Story '{story_id}' not found in sprint YAML",
        }

    # Check status
    status = story.get("status", "backlog")
    if status not in ("done", "completed", "review"):
        return {
            "success": False,
            "error": f"Story status is '{status}', expected 'done' or 'completed'",
        }

    root = get_project_root()
    sprint_file = root / "sprint" / "current-sprint.yaml"

    if not sprint_file.exists():
        return {"success": False, "error": f"Sprint file not found: {sprint_file}"}

    # Get sprint name for archive file
    with open(sprint_file) as f:
        sprint_data = yaml.safe_load(f.read())

    sprint_name = sprint_data.get("sprint", {}).get("jira_sprint_name", "")
    match = re.search(r"(\d{4})", sprint_name)
    sprint_num = match.group(1) if match else "unknown"
    archive_file = root / "sprint" / "archive" / f"sprint-{sprint_num}-completed.yaml"

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

    with open(archive_file, "a") as f:
        f.write("\n".join(entry_lines) + "\n")

    msg = f"Archived {story_id} to {archive_file.name}"

    # Remove from current sprint if --apply
    if apply:
        for epic in sprint_data.get("epics", []):
            if isinstance(epic, dict):
                epic["stories"] = [s for s in epic.get("stories", []) if s.get("id") != story_id]

        from pf.sprint.yaml_io import write_sprint
        write_sprint(sprint_file, sprint_data)
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
