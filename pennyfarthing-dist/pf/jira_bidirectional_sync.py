"""
Bidirectional sync between sprint YAML and Jira.

This module re-exports from pf.jira.bidirectional for
backwards compatibility. New code should import from jira.bidirectional directly.

Usage: python -m pf.jira_bidirectional_sync [options]
"""

# Re-export everything from the new location
from pf.jira.bidirectional import (
    SyncChange,
    SyncPlan,
    SyncResult,
    async_main,
    execute_sync_plan,
    format_sync_plan,
    generate_sync_plan,
    main,
    parse_cli_args,
)

__all__ = [
    "SyncChange",
    "SyncPlan",
    "SyncResult",
    "async_main",
    "execute_sync_plan",
    "format_sync_plan",
    "generate_sync_plan",
    "main",
    "parse_cli_args",
]

if __name__ == "__main__":
    import sys
    sys.exit(main())
