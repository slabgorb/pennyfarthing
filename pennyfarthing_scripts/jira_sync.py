"""
Jira sync for Pennyfarthing epics.

This module re-exports from pennyfarthing_scripts.jira.sync for
backwards compatibility. New code should import from jira.sync directly.

Usage:
    python -m pennyfarthing_scripts.jira_sync <epic_number> [--dry-run] [--transition] [--points]
"""

# Re-export everything from the new location
from pennyfarthing_scripts.jira.sync import (
    SyncResult,
    async_main,
    format_story_line,
    format_summary,
    main,
    parse_args,
    sync_epic,
    sync_story,
)

__all__ = [
    "SyncResult",
    "async_main",
    "format_story_line",
    "format_summary",
    "main",
    "parse_args",
    "sync_epic",
    "sync_story",
]

if __name__ == "__main__":
    import sys
    sys.exit(main())
