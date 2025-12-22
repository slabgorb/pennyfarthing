#!/bin/bash
# Session start hook: Initialize environment for Claude Code session
# Called by Claude Code when a new session starts
#
# Uses CLAUDE_ENV_FILE to persist environment variables for the session.
# Projects using pennyfarthing can add their own hooks for project-specific vars.

set -euo pipefail

# Determine project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Read input from stdin (contains session_id, cwd, etc.)
input=$(cat)
session_id=$(echo "$input" | jq -r '.session_id // "unknown"')

# Ensure .session directory exists
mkdir -p "$PROJECT_ROOT/.session"

# Create session log entry
echo "$(date -Iseconds) | Session started: $session_id" >> "$PROJECT_ROOT/.session/session-log.txt"

# Write environment variables to CLAUDE_ENV_FILE (persists for session)
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    cat >> "$CLAUDE_ENV_FILE" << EOF
# Pennyfarthing core environment
export PROJECT_ROOT="$PROJECT_ROOT"
export SESSION_ID="$session_id"
EOF
fi

exit 0
