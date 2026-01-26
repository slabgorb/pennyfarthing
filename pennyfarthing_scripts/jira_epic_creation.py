"""
Create Jira epics from Pennyfarthing sprint YAML definitions.

This module re-exports from pennyfarthing_scripts.jira.epic for
backwards compatibility. New code should import from jira.epic directly.

Usage:
    python -m pennyfarthing_scripts.jira_epic_creation <epic_id> [options]
"""

# Re-export everything from the new location
from pennyfarthing_scripts.jira.epic import (
    build_epic_payload,
    create_epic,
    create_epic_from_yaml,
    main,
    parse_args,
)

__all__ = [
    "build_epic_payload",
    "create_epic",
    "create_epic_from_yaml",
    "main",
    "parse_args",
]

if __name__ == "__main__":
    import sys
    sys.exit(main())
