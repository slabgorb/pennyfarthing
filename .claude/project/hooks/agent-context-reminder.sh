#!/usr/bin/env zsh
# UserPromptSubmit hook for agent context persistence
# Checks if an agent is registered for this session and reminds Claude to reload
# if the agent context appears to be missing (e.g., after compaction)
#
# Input: JSON via stdin with session_id
# Output: JSON with optional context injection

set -e

# Use Claude Code's project dir (set by Claude Code)
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
AGENTS_DIR="$PROJECT_ROOT/.session/agents"

# Read JSON from stdin
input=$(cat)

# Extract session_id
session_id=""
if command -v jq &>/dev/null && [ -n "$input" ]; then
  session_id=$(echo "$input" | jq -r '.session_id // empty' 2>/dev/null)
fi

# No session = nothing to do
if [ -z "$session_id" ]; then
  exit 0
fi

# Check if agent is registered for this session
AGENT_FILE="$AGENTS_DIR/$session_id"
if [ ! -f "$AGENT_FILE" ]; then
  exit 0
fi

AGENT=$(cat "$AGENT_FILE")
if [ -z "$AGENT" ]; then
  exit 0
fi

# Agent is registered - output context reminder
# This gets injected into the prompt context
cat <<EOF
{
  "addToPrompt": "<!-- AGENT-CONTEXT-REMINDER: You should be operating as the ${AGENT} agent. If you don't recall loading the ${AGENT} persona (likely due to compaction), run: $PROJECT_ROOT/.claude/scripts/agent-session.sh start \"${AGENT}\" \"${session_id}\" to reload your persona and context. -->"
}
EOF
