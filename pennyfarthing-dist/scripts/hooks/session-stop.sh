#!/usr/bin/env zsh
# Session stop hook: Save checkpoint for cross-session continuity
# Called by Claude Code when a session ends
#
# Writes session state to checkpoint:
#   - Active agent (from .session/agents/)
#   - Current story (from .session/*-session.md)
#   - Workflow phase (from session file)
#   - Git SHA (current HEAD)
#   - Session ID
#
# Next session can validate this against current git state.

set -euo pipefail

# Load shared functions
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Determine project root (directory containing .claude)
PROJECT_ROOT="$SCRIPT_DIR"
while [[ ! -d "$PROJECT_ROOT/.claude" ]] && [[ "$PROJECT_ROOT" != "/" ]]; do
    PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"
done

source "$SCRIPT_DIR/../lib/checkpoint.sh"

# Read input from stdin (contains session_id, source, etc.)
input=$(cat)
session_id=$(echo "$input" | jq -r '.session_id // "unknown"')

# Get current agent for this session
agent=""
agent_file="$PROJECT_ROOT/.session/agents/$session_id"
if [[ -f "$agent_file" ]]; then
    agent=$(cat "$agent_file")
fi

# Find active story from session files
story=""
phase=""
session_file=$(find "$PROJECT_ROOT/.session" -maxdepth 1 -name "*-session.md" -type f 2>/dev/null | head -1)
if [[ -n "$session_file" && -f "$session_file" ]]; then
    # Extract story ID from filename (e.g., 8-3-session.md -> 8-3)
    story=$(basename "$session_file" | sed 's/-session\.md$//')

    # Extract phase from session file (look for "Phase:" line)
    phase=$(grep -i "^- Phase:" "$session_file" 2>/dev/null | head -1 | sed 's/.*Phase:[[:space:]]*//' | cut -d' ' -f1 || echo "")
fi

# Get current git SHA
git_sha=""
if command -v git &>/dev/null && git rev-parse --git-dir &>/dev/null; then
    git_sha=$(git rev-parse --short HEAD 2>/dev/null || echo "")
fi

# Build checkpoint data (semicolon-separated key=value pairs)
checkpoint_data="agent=${agent};story=${story};phase=${phase};sha=${git_sha};session=${session_id}"

# Save checkpoint
checkpoint_save "session_state" "$checkpoint_data"

# Log session end
echo "$(date -Iseconds) | Session end: $session_id (agent=$agent, story=$story)" >> "$PROJECT_ROOT/.session/session-log.txt"

exit 0
