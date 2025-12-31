#!/usr/bin/env zsh
# Session start hook: Initialize environment for Claude Code session
# Called by Claude Code when a new session starts
#
# Uses CLAUDE_ENV_FILE to persist environment variables for the session.
# Projects using pennyfarthing can add their own hooks for project-specific vars.

set -euo pipefail

# Find project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../utils/find-root.sh"

# Read input from stdin (contains session_id, source, cwd, etc.)
input=$(cat)
session_id=$(echo "$input" | jq -r '.session_id // "unknown"')
source=$(echo "$input" | jq -r '.source // "unknown"')

# Ensure .session directory exists
mkdir -p "$CLAUDE_PROJECT_DIR/.session"
mkdir -p "$CLAUDE_PROJECT_DIR/.session/agents"

# Note: Agent cleanup is handled by agent-session.sh (7-day TTL) to preserve multi-session state
# DO NOT clear .session/agents/* here - it breaks parallel sessions

# Create session log entry
echo "$(date -Iseconds) | Session $source: $session_id" >> "$CLAUDE_PROJECT_DIR/.session/session-log.txt"

# Write environment variables to CLAUDE_ENV_FILE (persists for session)
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    cat >> "$CLAUDE_ENV_FILE" << EOF
# Pennyfarthing core environment
export PROJECT_ROOT="$CLAUDE_PROJECT_DIR"
export SESSION_ID="$session_id"
EOF
fi

exit 0
