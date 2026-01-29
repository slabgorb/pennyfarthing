#!/usr/bin/env python3
"""
import_epic_to_future.py - Import epics-and-stories workflow output to future.yaml

Transforms the markdown output from the epics-and-stories workflow into
the YAML format used by sprint/future.yaml.

Usage: python import_epic_to_future.py [--dry-run] <epics-md-file> [initiative-name]

Example:
  python import_epic_to_future.py docs/planning/reflector-epics-and-stories.md "Reflector Consolidation"
"""

import argparse
import re
import sys
from datetime import date
from pathlib import Path


class Colors:
    RED = '\033[31m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    NC = '\033[0m'


def log_info(msg: str) -> None:
    print(f"{Colors.BLUE}INFO{Colors.NC}: {msg}")


def log_success(msg: str) -> None:
    print(f"{Colors.GREEN}SUCCESS{Colors.NC}: {msg}")


def log_error(msg: str) -> None:
    print(f"{Colors.RED}ERROR{Colors.NC}: {msg}", file=sys.stderr)


def find_project_root() -> Path:
    """Find project root by looking for .pennyfarthing directory."""
    current = Path.cwd()
    while current != current.parent:
        if (current / ".pennyfarthing").is_dir():
            return current
        current = current.parent
    return Path.cwd()


def parse_epics_markdown(content: str) -> dict:
    """Parse epics markdown file."""
    result = {
        'title': '',
        'description': '',
        'total_points': 0,
        'epic_title': '',
        'epic_description': '',
        'stories': [],
    }

    # Extract title from first # heading
    title_match = re.search(r'^# (.+?)( - Epic Breakdown)?$', content, re.MULTILINE)
    if title_match:
        result['title'] = title_match.group(1).replace(' - Epics and Stories', '')

    # Extract description from Overview section
    overview_match = re.search(r'## Overview\s*\n\s*\n(.+?)(?=\n\n##|\n##)', content, re.DOTALL)
    if overview_match:
        result['description'] = overview_match.group(1).strip()

    # Extract total points
    points_match = re.search(r'\*\*Points:\*\*\s*(\d+)', content)
    if points_match:
        result['total_points'] = int(points_match.group(1))
    else:
        effort_match = re.search(r'Total Effort.*?(\d+)\s*story points', content, re.IGNORECASE)
        if effort_match:
            result['total_points'] = int(effort_match.group(1))

    # Extract epic title
    epic_title_match = re.search(r'^## Epic \d+:\s*(.+)$', content, re.MULTILINE)
    if epic_title_match:
        result['epic_title'] = epic_title_match.group(1)

    # Extract epic description (User Outcome)
    user_outcome_match = re.search(r'\*\*User Outcome:\*\*\s*(.+)', content)
    if user_outcome_match:
        result['epic_description'] = user_outcome_match.group(1)

    # Parse stories
    story_pattern = re.compile(r'^### Story \d+\.(\d+):\s*(.+)$', re.MULTILINE)
    i_want_pattern = re.compile(r'^I want \*\*(.+?)\*\*,', re.MULTILINE)

    story_positions = []
    for match in story_pattern.finditer(content):
        story_positions.append({
            'num': int(match.group(1)),
            'title': match.group(2),
            'index': match.start(),
        })

    for i, story in enumerate(story_positions):
        start_index = story['index']
        end_index = story_positions[i + 1]['index'] if i < len(story_positions) - 1 else len(content)
        story_content = content[start_index:end_index]

        i_want_match = i_want_pattern.search(story_content)
        description = i_want_match.group(1) if i_want_match else ''

        result['stories'].append({
            'num': story['num'],
            'title': story['title'],
            'description': description,
        })

    return result


def get_next_epic_number(future_yaml_path: Path) -> int:
    """Get next epic number from future.yaml."""
    if not future_yaml_path.exists():
        return 60

    content = future_yaml_path.read_text()

    # Look for "Next Available Epic Number: XX"
    next_match = re.search(r'Next Available Epic Number:\s*(\d+)', content, re.IGNORECASE)
    if next_match:
        return int(next_match.group(1))

    # Fallback: find highest epic-XX number
    max_num = 59
    for match in re.finditer(r'epic-(\d+)', content):
        num = int(match.group(1))
        if num > max_num:
            max_num = num

    return max_num + 1


def generate_yaml(parsed: dict, epic_num: int, initiative_name: str, epics_file: str) -> str:
    """Generate YAML for initiative."""
    today = date.today().isoformat()

    yaml = f"""
    # ==========================================================================
    # {initiative_name}
    # Imported from: {epics_file}
    # Date: {today}
    # ==========================================================================
    - name: "{initiative_name}"
      description: |
        {parsed['description']}
      status: ready
      blocked_by: null
      total_points: {parsed['total_points']}
      prd: docs/planning/reflector-prd.md
      epics_doc: {epics_file}
      epics:
        - id: epic-{epic_num}
          title: "{parsed['epic_title'] or initiative_name}"
          description: |
            {parsed['epic_description'] or parsed['description']}
          points: {parsed['total_points']}
          priority: P1
          marker: "reflector"
          repos: pennyfarthing
          status: planning
          stories:
"""

    for story in parsed['stories']:
        yaml += f"""            - id: "{epic_num}-{story['num']}"
              title: "{story['title']}"
              description: |
                {story['description'] or story['title']}
              points: 1
              priority: P0
              status: planning
              repos: pennyfarthing
"""

    return yaml


def update_future_yaml(future_yaml_path: Path, new_content: str, next_epic_num: int) -> str:
    """Update future.yaml."""
    content = future_yaml_path.read_text()

    # Update next epic number comment
    content = re.sub(
        r'Next Available Epic Number:\s*\d+',
        f'Next Available Epic Number: {next_epic_num + 1}',
        content,
        flags=re.IGNORECASE
    )

    # Find insertion point (before SUMMARY section)
    summary_marker = '# =============================================================================\n# SUMMARY'
    summary_index = content.find(summary_marker)

    if summary_index == -1:
        content += new_content
    else:
        content = content[:summary_index] + new_content + '\n' + content[summary_index:]

    return content


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Import epics-and-stories workflow output to future.yaml"
    )
    parser.add_argument('--dry-run', action='store_true',
                        help='Print YAML to stdout instead of updating future.yaml')
    parser.add_argument('epics_file', type=str,
                        help='Path to the markdown file from epics-and-stories workflow')
    parser.add_argument('initiative_name', type=str, nargs='?', default='',
                        help='Name for the initiative (optional, extracted from file if not provided)')
    args = parser.parse_args()

    project_root = find_project_root()

    epics_path = Path(args.epics_file)
    if not epics_path.is_absolute():
        epics_path = project_root / epics_path

    if not epics_path.exists():
        log_error(f"File not found: {epics_path}")
        return 1

    future_yaml_path = project_root / 'sprint' / 'future.yaml'

    # Read and parse epics file
    content = epics_path.read_text()
    parsed = parse_epics_markdown(content)

    # Use provided name or extract from file
    initiative_name = args.initiative_name or parsed['title'] or 'Imported Initiative'

    # Get next epic number
    next_epic_num = get_next_epic_number(future_yaml_path)

    log_info(f"Next epic number: {next_epic_num}")
    log_info(f"Initiative name: {initiative_name}")
    log_info(f"Total points: {parsed['total_points']}")
    log_info(f"Epic title: {parsed['epic_title']}")
    log_info(f"Stories found: {len(parsed['stories'])}")

    # Generate YAML
    new_yaml = generate_yaml(parsed, next_epic_num, initiative_name, args.epics_file)

    if args.dry_run:
        print(f"\n{Colors.YELLOW}=== DRY RUN: Would append to future.yaml ==={Colors.NC}")
        print(new_yaml)
        print(f"{Colors.YELLOW}=== End of YAML ==={Colors.NC}\n")
        print(f"{Colors.GREEN}To apply, run without --dry-run{Colors.NC}")
    else:
        updated_content = update_future_yaml(future_yaml_path, new_yaml, next_epic_num)
        future_yaml_path.write_text(updated_content)

        log_success(f"Added epic-{next_epic_num} to {future_yaml_path}")
        log_success(f"Next available epic number is now: {next_epic_num + 1}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
