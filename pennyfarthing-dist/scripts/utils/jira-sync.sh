#!/usr/bin/env zsh
# Thin wrapper for jira-sync.mjs
# Usage: ./scripts/jira-sync.sh <epic_number> [--dry-run] [--transition] [--points]
#
# Delegates to Node script for cleaner, more maintainable implementation.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "${SCRIPT_DIR}/jira/jira-sync.mjs" "$@"
