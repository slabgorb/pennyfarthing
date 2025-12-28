#!/usr/bin/env zsh
# Session start hook: Initialize environment for Claude Code session
# Called by Claude Code when a new session starts
#
# Uses CLAUDE_ENV_FILE to persist environment variables for the session.
# Projects using pennyfarthing can add their own hooks for project-specific vars.

set -euo pipefail

# Determine project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Read input from stdin (contains session_id, cwd, etc.)
input=$(cat)
session_id=$(echo "$input" | jq -r '.session_id // "unknown"')

# Ensure .session directory exists
mkdir -p "$CLAUDE_PROJECT_DIR/.session"
mkdir -p "$CLAUDE_PROJECT_DIR/.session/agents"

# Clear stale agent state from previous session
rm -f "$CLAUDE_PROJECT_DIR/.session/current-agent" 2>/dev/null || true
# Use find to avoid zsh glob errors when directory is empty
find "$CLAUDE_PROJECT_DIR/.session/agents" -type f -delete 2>/dev/null || true

# Create session log entry
echo "$(date -Iseconds) | Session started: $session_id" >> "$CLAUDE_PROJECT_DIR/.session/session-log.txt"

# Write environment variables to CLAUDE_ENV_FILE (persists for session)
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    cat >> "$CLAUDE_ENV_FILE" << EOF
# Pennyfarthing core environment
export PROJECT_ROOT="$CLAUDE_PROJECT_DIR"
export SESSION_ID="$session_id"
EOF
fi

exit 0
