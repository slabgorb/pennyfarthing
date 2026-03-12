"""
Story creation utilities.

Provides functions for creating new stories.
"""

from typing import Any

from pf.story.size import SIZING_GUIDELINES
from pf.story.template import format_template


def generate_story_yaml(
    epic_id: str,
    title: str,
    points: int,
    story_type: str = "feature",
    priority: str = "P2",
    workflow: str | None = None,
) -> str:
    """Generate YAML block for a new story.

    Args:
        epic_id: Parent epic ID
        title: Story title
        points: Story points
        story_type: Story type (feature, bug, refactor, chore)
        priority: Priority (P0, P1, P2, P3)
        workflow: Workflow override (defaults based on points)

    Returns:
        YAML block string
    """
    # Determine workflow based on points if not specified
    if workflow is None:
        sizing = SIZING_GUIDELINES.get(points, {})
        workflow = sizing.get("workflow", "tdd")

    # Generate story ID placeholder
    story_id = f"{epic_id}-NEW"

    return format_template(
        story_type,
        id=story_id,
        title=title,
        points=points,
        priority=priority,
        workflow=workflow,
    )


def validate_points(points: int) -> dict[str, Any]:
    """Validate story points.

    Args:
        points: Story points value

    Returns:
        Dict with valid status and message
    """
    valid_points = [1, 2, 3, 5, 8, 13]

    if points not in valid_points:
        return {
            "valid": False,
            "warning": f"Points {points} not in standard sequence: {valid_points}",
        }

    if points >= 13:
        return {
            "valid": True,
            "warning": "Consider splitting: 13+ point stories are typically too large",
        }

    return {"valid": True}


def create_story(
    epic_id: str,
    title: str,
    points: int,
    story_type: str = "feature",
    priority: str = "P2",
    workflow: str | None = None,
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Create a new story.

    Args:
        epic_id: Parent epic ID
        title: Story title
        points: Story points
        story_type: Story type
        priority: Priority
        workflow: Workflow override
        dry_run: If True, don't write to file

    Returns:
        Dict with success status and story YAML
    """
    # Validate points
    validation = validate_points(points)

    yaml_block = generate_story_yaml(
        epic_id=epic_id,
        title=title,
        points=points,
        story_type=story_type,
        priority=priority,
        workflow=workflow,
    )

    return {
        "success": True,
        "dry_run": dry_run,
        "yaml": yaml_block,
        "warning": validation.get("warning"),
    }


def main(args: list[str] | None = None) -> int:
    """CLI entry point for story create.

    Args:
        args: Command line arguments

    Returns:
        Exit code
    """
    import argparse

    parser = argparse.ArgumentParser(description="Create a new story")
    parser.add_argument("epic_id", help="Parent epic ID")
    parser.add_argument("title", help="Story title")
    parser.add_argument("points", type=int, help="Story points")
    parser.add_argument(
        "--type", choices=["feature", "bug", "refactor", "chore"], default="feature"
    )
    parser.add_argument("--priority", choices=["P0", "P1", "P2", "P3"], default="P2")
    parser.add_argument("--workflow", help="Override workflow")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be created")

    parsed = parser.parse_args(args)

    result = create_story(
        epic_id=parsed.epic_id,
        title=parsed.title,
        points=parsed.points,
        story_type=parsed.type,
        priority=parsed.priority,
        workflow=parsed.workflow,
        dry_run=parsed.dry_run,
    )

    if result.get("warning"):
        print(f"Warning: {result['warning']}")
        print("")

    print("Add this to sprint/current-sprint.yaml under the epic's stories:")
    print("")
    print(result["yaml"])

    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
