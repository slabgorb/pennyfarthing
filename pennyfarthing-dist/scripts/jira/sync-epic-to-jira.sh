#!/usr/bin/env zsh
# Sync Pennyfarthing Epic to Jira MSSCI Project using jira
# Usage: ./scripts/sync-epic-to-jira.sh <epic_number> [--dry-run] [--with-comments]
#
# Prerequisites:
#   - jira installed: brew install ankitpokhrel/jira/jira
#   - jira configured: jira init
#   - JIRA_API_TOKEN environment variable set
#
# Options:
#   --dry-run         Show what would be done without making changes
#   --with-comments   (Deprecated - kept for compatibility)

# Delegate to jira-sync.sh which implements the actual sync logic
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "${SCRIPT_DIR}/jira-sync.sh" "$@"
