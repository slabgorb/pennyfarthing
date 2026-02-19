"""
Sync a single story between Pennyfarthing sprint YAML and Jira.

This module re-exports from pf.jira.story for
backwards compatibility. New code should import from jira.story directly.

Usage:
    python -m pf.jira_sync_story <story_key> [options]
"""

# Re-export everything from the new location
from pf.jira.story import (
    fetch_jira_issue,
    get_story_from_sprint,
    main,
    parse_args,
    sync_story,
)

__all__ = [
    "fetch_jira_issue",
    "get_story_from_sprint",
    "main",
    "parse_args",
    "sync_story",
]

if __name__ == "__main__":
    import sys
    sys.exit(main())
