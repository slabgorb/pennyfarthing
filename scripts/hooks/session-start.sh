#!/bin/bash
# Session start hook: Initialize environment for Claude Code session
# Called by Claude Code when a new session starts
#
# Input: JSON via stdin with session info
# Output: JSON with environment variables to set

set -euo pipefail

# Determine project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Read input from stdin (contains session_id, cwd, etc.)
input=$(cat)

# Extract current working directory
cwd=$(echo "$input" | jq -r '.cwd // ""')

# Ensure .session directory exists
mkdir -p "$PROJECT_ROOT/.session"

# Create session log entry
session_id=$(echo "$input" | jq -r '.session_id // "unknown"')
echo "$(date -Iseconds) | Session started: $session_id" >> "$PROJECT_ROOT/.session/session-log.txt"

# Output environment variables as JSON
# These will be available to subsequent tool calls
cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "environmentVariables": {
      "PROJECT_ROOT": "$PROJECT_ROOT",
      "API_REPO": "conductor-api",
      "UI_REPO": "conductor-ui",
      "SESSION_ID": "$session_id"
    }
  }
}
EOF

exit 0
