#!/usr/bin/env zsh
# Thin wrapper for jira-sync-story.mjs
# Usage: ./scripts/jira-sync-story.sh <story_key> [--transition] [--points] [--comment "message"]
#
# Delegates to Node script for cleaner, more maintainable implementation.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "${SCRIPT_DIR}/jira/jira-sync-story.mjs" "$@"
