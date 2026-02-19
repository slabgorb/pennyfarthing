"""
Jira sync for Pennyfarthing epics.

This module re-exports from pf.jira.sync for
backwards compatibility. New code should import from jira.sync directly.

Usage:
    python -m pf.jira_sync <epic_number> [--dry-run] [--transition] [--points]
"""

# Re-export everything from the new location
from pf.jira.sync import (
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
