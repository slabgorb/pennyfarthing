#!/usr/bin/env zsh
# Session start hook: Initialize environment for Claude Code session
# Called by Claude Code when a new session starts
#
# Uses CLAUDE_ENV_FILE to persist environment variables for the session.
# Projects using pennyfarthing can add their own hooks for project-specific vars.
#
# Also validates previous session checkpoint to detect cross-session state changes.

set -euo pipefail

# Find project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../utils/find-root.sh"
source "$SCRIPT_DIR/../utils/checkpoint.sh"

# Read input from stdin (contains session_id, source, cwd, etc.)
input=$(cat)
session_id=$(echo "$input" | jq -r '.session_id // "unknown"')
source_type=$(echo "$input" | jq -r '.source // "unknown"')

# Ensure .session directory exists
mkdir -p "$CLAUDE_PROJECT_DIR/.session"
mkdir -p "$CLAUDE_PROJECT_DIR/.session/agents"

# Note: Agent cleanup is handled by agent-session.sh (7-day TTL) to preserve multi-session state
# DO NOT clear .session/agents/* here - it breaks parallel sessions

# Create session log entry
echo "$(date -Iseconds) | Session $source_type: $session_id" >> "$CLAUDE_PROJECT_DIR/.session/session-log.txt"

# Validate previous session checkpoint (cross-session continuity)
validate_checkpoint() {
    local prev_state
    prev_state=$(checkpoint_restore "session_state")

    if [[ -z "$prev_state" ]]; then
        # No previous checkpoint - fresh start
        return 0
    fi

    # Parse checkpoint data (format: key=value;key=value;...)
    local prev_sha prev_agent prev_story prev_phase prev_session
    prev_sha=$(echo "$prev_state" | tr ';' '\n' | grep '^sha=' | cut -d= -f2)
    prev_agent=$(echo "$prev_state" | tr ';' '\n' | grep '^agent=' | cut -d= -f2)
    prev_story=$(echo "$prev_state" | tr ';' '\n' | grep '^story=' | cut -d= -f2)
    prev_phase=$(echo "$prev_state" | tr ';' '\n' | grep '^phase=' | cut -d= -f2)
    prev_session=$(echo "$prev_state" | tr ';' '\n' | grep '^session=' | cut -d= -f2)

    # Get current git SHA
    local current_sha=""
    if command -v git &>/dev/null && git rev-parse --git-dir &>/dev/null; then
        current_sha=$(git rev-parse --short HEAD 2>/dev/null || echo "")
    fi

    # Compare git state
    if [[ -n "$prev_sha" && -n "$current_sha" && "$prev_sha" != "$current_sha" ]]; then
        # Git state changed between sessions - write warning to session log
        local warning="CROSS_SESSION_DRIFT: Git changed since last session (was: $prev_sha, now: $current_sha)"
        if [[ -n "$prev_story" ]]; then
            warning="$warning | Story: $prev_story"
        fi
        if [[ -n "$prev_agent" ]]; then
            warning="$warning | Agent: $prev_agent"
        fi
        echo "$(date -Iseconds) | $warning" >> "$CLAUDE_PROJECT_DIR/.session/session-log.txt"

        # Also write to a dedicated drift log for easy scanning
        echo "$(date -Iseconds) | prev_sha=$prev_sha | current_sha=$current_sha | story=$prev_story | agent=$prev_agent | phase=$prev_phase" >> "$CLAUDE_PROJECT_DIR/.session/drift-log.txt"
    fi
}

# Run checkpoint validation (don't fail if it errors)
validate_checkpoint 2>/dev/null || true

# Write environment variables to CLAUDE_ENV_FILE (persists for session)
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    cat >> "$CLAUDE_ENV_FILE" << EOF
# Pennyfarthing core environment
export PROJECT_ROOT="$CLAUDE_PROJECT_DIR"
export SESSION_ID="$session_id"
EOF

    # Auto-configure OTEL if Cyclist is running (Story 20-1)
    PORT_FILE="$CLAUDE_PROJECT_DIR/.cyclist-port"
    if [[ -f "$PORT_FILE" ]]; then
        CYCLIST_PORT=$(cat "$PORT_FILE" 2>/dev/null)
        if [[ "$CYCLIST_PORT" =~ ^[0-9]+$ ]]; then
            cat >> "$CLAUDE_ENV_FILE" << EOF
# OTEL auto-configuration for Cyclist (Story 20-1)
export OTEL_EXPORTER_OTLP_PROTOCOL="http/json"
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:$CYCLIST_PORT"
EOF
        fi
    fi
fi

exit 0
