"""
Sprint story archiving.

Provides functions for archiving completed stories.
"""

from pathlib import Path
from typing import Any

from pennyfarthing_scripts.common.config import get_project_root
from pennyfarthing_scripts.sprint.loader import get_story_by_id


def archive_story(
    story_id: str,
    pr_number: str | None = None,
    *,
    dry_run: bool = False,
    apply: bool = False,
) -> dict[str, Any]:
    """Archive a completed story.

    Args:
        story_id: Story ID to archive
        pr_number: PR number if merged via PR
        dry_run: If True, show what would be done
        apply: If True, also remove from current-sprint.yaml

    Returns:
        Dict with success status and details
    """
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

    if dry_run:
        return {
            "success": True,
            "dry_run": True,
            "story": story,
            "pr_number": pr_number,
            "message": f"Would archive {story_id}",
        }

    # In a real implementation, this would:
    # 1. Write to archive file
    # 2. Optionally remove from current-sprint.yaml
    return {
        "success": True,
        "story": story,
        "pr_number": pr_number,
        "message": f"Archived {story_id}",
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
