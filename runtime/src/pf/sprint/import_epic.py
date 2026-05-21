"""
Import BMAD epics-and-stories output to future.yaml.

Transforms the markdown output from the epics-and-stories workflow into
the YAML format used by sprint/future.yaml.
"""

import re
from datetime import date
from pathlib import Path
from typing import Any

from pf.common.config import get_project_root


def parse_epics_markdown(content: str) -> dict[str, Any]:
    """Parse epics markdown file from BMAD epics-and-stories workflow.

    Args:
        content: Markdown content to parse

    Returns:
        Dict with parsed initiative data
    """
    result: dict[str, Any] = {
        "title": "",
        "description": "",
        "total_points": 0,
        "epics": [],
    }

    # Extract title from first # heading
    title_match = re.search(r"^# (.+?)( - Epic Breakdown)?$", content, re.MULTILINE)
    if title_match:
        result["title"] = title_match.group(1).replace(" - Epics and Stories", "")

    # Extract description from Overview section
    overview_match = re.search(r"## Overview\s*\n\s*\n(.+?)(?=\n\n##|\n##)", content, re.DOTALL)
    if overview_match:
        result["description"] = overview_match.group(1).strip()

    # Extract total points
    points_match = re.search(r"\*\*Points:\*\*\s*(\d+)", content)
    if points_match:
        result["total_points"] = int(points_match.group(1))
    else:
        effort_match = re.search(r"Total Effort.*?(\d+)\s*story points", content, re.IGNORECASE)
        if effort_match:
            result["total_points"] = int(effort_match.group(1))

    # Parse all epics
    epic_pattern = re.compile(r"^## Epic (\d+):\s*(.+)$", re.MULTILINE)
    epic_positions = []
    for match in epic_pattern.finditer(content):
        epic_positions.append(
            {
                "num": int(match.group(1)),
                "title": match.group(2),
                "index": match.start(),
            }
        )

    # Process each epic
    for i, epic_pos in enumerate(epic_positions):
        start_index = epic_pos["index"]
        end_index = epic_positions[i + 1]["index"] if i < len(epic_positions) - 1 else len(content)
        epic_content = content[start_index:end_index]

        epic: dict[str, Any] = {
            "num": epic_pos["num"],
            "title": epic_pos["title"],
            "description": "",
            "points": 0,
            "stories": [],
        }

        # Extract epic description (User Outcome)
        user_outcome_match = re.search(r"\*\*User Outcome:\*\*\s*(.+)", epic_content)
        if user_outcome_match:
            epic["description"] = user_outcome_match.group(1)

        # Extract epic points
        epic_points_match = re.search(r"\*\*Points:\*\*\s*(\d+)", epic_content)
        if epic_points_match:
            epic["points"] = int(epic_points_match.group(1))

        # Parse stories within this epic
        story_pattern = re.compile(rf"^### Story {epic_pos['num']}\.(\d+):\s*(.+)$", re.MULTILINE)
        story_positions = []
        for match in story_pattern.finditer(epic_content):
            story_positions.append(
                {
                    "num": int(match.group(1)),
                    "title": match.group(2),
                    "index": match.start(),
                }
            )

        for j, story_pos in enumerate(story_positions):
            story_start = story_pos["index"]
            story_end = (
                story_positions[j + 1]["index"]
                if j < len(story_positions) - 1
                else len(epic_content)
            )
            story_content = epic_content[story_start:story_end]

            # Extract story description
            i_want_match = re.search(r"^I want \*\*(.+?)\*\*,", story_content, re.MULTILINE)
            description = i_want_match.group(1) if i_want_match else ""

            # Extract story points
            story_points_match = re.search(r"\*\*Points:\*\*\s*(\d+)", story_content)
            points = int(story_points_match.group(1)) if story_points_match else 1

            epic["stories"].append(
                {
                    "num": story_pos["num"],
                    "title": story_pos["title"],
                    "description": description,
                    "points": points,
                }
            )

        result["epics"].append(epic)

    # Calculate total if not found
    if result["total_points"] == 0:
        result["total_points"] = sum(e.get("points", 0) for e in result["epics"])

    return result


def get_next_epic_number(project_root: Path | None = None) -> int:
    """Get next available epic number from future.yaml.

    Args:
        project_root: Project root path (defaults to auto-detect)

    Returns:
        Next available epic number
    """
    root = project_root or get_project_root()
    future_path = root / "sprint" / "future.yaml"

    if not future_path.exists():
        return 74  # Default starting point

    content = future_path.read_text()

    # Look for "Next Available Epic Number: XX"
    next_match = re.search(r"Next Available Epic Number:\s*(\d+)", content, re.IGNORECASE)
    if next_match:
        return int(next_match.group(1))

    # Fallback: find highest epic-XX number
    max_num = 73
    for match in re.finditer(r"epic-(\d+)", content):
        num = int(match.group(1))
        if num > max_num:
            max_num = num

    return max_num + 1


def generate_initiative_yaml(
    parsed: dict[str, Any],
    start_epic_num: int,
    initiative_name: str,
    source_file: str,
    marker: str = "imported",
) -> tuple[str, int]:
    """Generate YAML for an initiative.

    Args:
        parsed: Parsed markdown data
        start_epic_num: Starting epic number
        initiative_name: Name for the initiative
        source_file: Path to source markdown file
        marker: Marker tag for stories

    Returns:
        Tuple of (YAML string, next epic number)
    """
    today = date.today().isoformat()

    lines = [
        "    # ==========================================================================",
        f"    # {initiative_name.upper()}",
        f"    # Imported from: {source_file}",
        f"    # Date: {today}",
        "    # ==========================================================================",
        f'    - name: "{initiative_name}"',
        "      description: |",
    ]

    # Add description lines with proper indentation
    for line in parsed.get("description", initiative_name).split("\n"):
        lines.append(f"        {line}")

    lines.extend(
        [
            "      status: ready",
            "      blocked_by: null",
            f"      total_points: {parsed['total_points']}",
            "      epics:",
        ]
    )

    current_epic_num = start_epic_num

    for epic in parsed.get("epics", []):
        epic_points = epic.get("points", 0)
        if epic_points == 0:
            epic_points = sum(s.get("points", 1) for s in epic.get("stories", []))

        lines.extend(
            [
                f"        - id: epic-{current_epic_num}",
                f'          title: "{epic["title"]}"',
                "          description: |",
                f"            {epic.get('description', epic['title'])}",
                f"          points: {epic_points}",
                "          priority: P1",
                f'          marker: "{marker}"',
                "          repos: pennyfarthing",
                "          status: planning",
                "          stories:",
            ]
        )

        for story in epic.get("stories", []):
            story_id = f"{current_epic_num}-{story['num']}"
            # Escape quotes in title
            title = story["title"].replace('"', '\\"')
            lines.extend(
                [
                    f'            - id: "{story_id}"',
                    f'              title: "{title}"',
                    "              description: |",
                    f"                {story.get('description', title)}",
                    f"              points: {story.get('points', 1)}",
                    "              priority: P0",
                    "              status: planning",
                    "              repos: pennyfarthing",
                ]
            )

        current_epic_num += 1

    return "\n".join(lines), current_epic_num


def import_epic(
    epics_file: str | Path,
    initiative_name: str | None = None,
    marker: str = "imported",
    *,
    project_root: Path | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Import BMAD epics-and-stories markdown to future.yaml.

    Args:
        epics_file: Path to the markdown file from epics-and-stories workflow
        initiative_name: Name for the initiative (extracted from file if not provided)
        marker: Marker tag for stories
        project_root: Project root path (defaults to auto-detect)
        dry_run: If True, show what would be done without making changes

    Returns:
        Dict with success status and details
    """
    root = project_root or get_project_root()

    # Resolve epics file path
    epics_path = Path(epics_file)
    if not epics_path.is_absolute():
        epics_path = root / epics_path

    if not epics_path.exists():
        return {"success": False, "error": f"File not found: {epics_path}"}

    # Read and parse
    content = epics_path.read_text()
    parsed = parse_epics_markdown(content)

    if not parsed.get("epics"):
        return {"success": False, "error": "No epics found in markdown file"}

    # Use provided name or extract from file
    name = initiative_name or parsed.get("title") or "Imported Initiative"

    # Get next epic number
    start_epic_num = get_next_epic_number(root)

    # Validate each parsed epic before writing (ADR-0022)
    from pf.sprint.validator import validate_epic_shard

    epic_num = start_epic_num
    for epic in parsed["epics"]:
        # Build a shard-like dict for validation
        shard_dict = {
            "id": str(epic_num),
            "title": epic.get("title", ""),
            "status": "planning",
            "stories": [
                {
                    "id": f"{epic_num}-{s['num']}",
                    "title": s.get("title", ""),
                    "points": s.get("points", 1),
                    "status": "planning",
                }
                for s in epic.get("stories", [])
            ],
        }
        validation = validate_epic_shard(shard_dict)
        if not validation.valid:
            error_msgs = "; ".join(e.message for e in validation.errors)
            return {"success": False, "error": f"Epic {epic_num} validation failed: {error_msgs}"}
        epic_num += 1

    # Generate YAML
    relative_path = (
        str(epics_path.relative_to(root)) if epics_path.is_relative_to(root) else str(epics_path)
    )
    new_yaml, next_epic_num = generate_initiative_yaml(
        parsed, start_epic_num, name, relative_path, marker
    )

    if dry_run:
        return {
            "success": True,
            "dry_run": True,
            "initiative_name": name,
            "epics_count": len(parsed["epics"]),
            "stories_count": sum(len(e.get("stories", [])) for e in parsed["epics"]),
            "total_points": parsed["total_points"],
            "start_epic_num": start_epic_num,
            "next_epic_num": next_epic_num,
            "yaml_preview": new_yaml,
            "message": f"Would import '{name}' with {len(parsed['epics'])} epics",
        }

    # Update future.yaml
    future_path = root / "sprint" / "future.yaml"
    future_content = future_path.read_text()

    # Update next epic number comment
    future_content = re.sub(
        r"Next Available Epic Number:\s*\d+",
        f"Next Available Epic Number: {next_epic_num}",
        future_content,
        flags=re.IGNORECASE,
    )

    # Find insertion point (before SUMMARY section)
    summary_marker = (
        "# =============================================================================\n# SUMMARY"
    )
    summary_index = future_content.find(summary_marker)

    if summary_index == -1:
        future_content += "\n" + new_yaml
    else:
        future_content = (
            future_content[:summary_index] + new_yaml + "\n" + future_content[summary_index:]
        )

    future_path.write_text(future_content)

    return {
        "success": True,
        "initiative_name": name,
        "epics_count": len(parsed["epics"]),
        "stories_count": sum(len(e.get("stories", [])) for e in parsed["epics"]),
        "total_points": parsed["total_points"],
        "start_epic_num": start_epic_num,
        "next_epic_num": next_epic_num,
        "message": f"Imported '{name}' with {len(parsed['epics'])} epics (epic-{start_epic_num} to epic-{next_epic_num - 1})",
    }


def main(args: list[str] | None = None) -> int:
    """CLI entry point for epic import.

    Args:
        args: Command line arguments

    Returns:
        Exit code
    """
    import argparse
    import sys

    parser = argparse.ArgumentParser(
        description="Import BMAD epics-and-stories workflow output to future.yaml"
    )
    parser.add_argument(
        "epics_file",
        help="Path to the markdown file from epics-and-stories workflow",
    )
    parser.add_argument(
        "initiative_name",
        nargs="?",
        help="Name for the initiative (optional, extracted from file if not provided)",
    )
    parser.add_argument(
        "--marker",
        default="imported",
        help="Marker tag for stories (default: imported)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes",
    )

    parsed = parser.parse_args(args)

    result = import_epic(
        parsed.epics_file,
        initiative_name=parsed.initiative_name,
        marker=parsed.marker,
        dry_run=parsed.dry_run,
    )

    if result.get("success"):
        if result.get("dry_run"):
            print(f"[DRY-RUN] {result.get('message')}")
            print(f"  Epics: {result.get('epics_count')}")
            print(f"  Stories: {result.get('stories_count')}")
            print(f"  Points: {result.get('total_points')}")
            print(
                f"  Epic numbers: epic-{result.get('start_epic_num')} to epic-{result.get('next_epic_num') - 1}"
            )
            print("\nYAML Preview:")
            print("-" * 60)
            print(result.get("yaml_preview"))
            print("-" * 60)
        else:
            print(f"✓ {result.get('message')}")
            print(f"  Next available epic number: {result.get('next_epic_num')}")
        return 0
    else:
        print(f"Failed: {result.get('error')}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    import sys

    sys.exit(main())
