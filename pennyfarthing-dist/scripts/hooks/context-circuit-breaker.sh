#!/usr/bin/env zsh
# Context circuit breaker hook: Block tool execution at 85% context usage
# Called by Claude Code before tool calls (PreToolUse)
#
# Input: JSON via stdin with tool_name, tool_input, session_id
# Output: Exit 0 to allow, Exit 2 to block (stderr shown to Claude)
#
# This hook provides a hard stop when context is critically high,
# unlike context-warning.sh which only warns.
#
# When triggered, automatically saves the active agent to a checkpoint
# so /continue-session can restore it with FULL tier.

# Read stdin to get session_id (required by hook protocol)
INPUT=$(cat)

# Script location for sibling script references
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Get context percentage from check-context.sh
CONTEXT_SCRIPT="$SCRIPT_DIR/../check-context.sh"
if [[ ! -x "$CONTEXT_SCRIPT" ]]; then
    # graceful degradation: if check-context.sh not found, allow the tool
    exit 0
fi

# Run check-context.sh and parse output
eval "$("$CONTEXT_SCRIPT" 2>/dev/null)" 2>/dev/null

# graceful degradation: if we can't get context, allow the tool
if [[ -z "$CONTEXT_PERCENT" ]] || [[ "$CONTEXT_PERCENT" == "null" ]]; then
    exit 0
fi

# Load critical threshold (default 80%)
CRITICAL_THRESHOLD="${CRITICAL_THRESHOLD:-80}"

# Check if at or above critical threshold
if [[ "$CONTEXT_PERCENT" -ge "$CRITICAL_THRESHOLD" ]] 2>/dev/null; then
    # Auto-save active agent to checkpoint before blocking
    # This allows /continue-session to restore with FULL tier
    source "$SCRIPT_DIR/../lib/checkpoint.sh" 2>/dev/null || true

    # Get session_id from input JSON
    SESSION_ID=""
    if command -v jq &>/dev/null && [[ -n "$INPUT" ]]; then
        SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
    fi

    # Look up active agent for this session
    ACTIVE_AGENT=""
    AGENT_FILE="${CLAUDE_PROJECT_DIR:-.}/.session/agents/${SESSION_ID}"
    if [[ -n "$SESSION_ID" && -f "$AGENT_FILE" ]]; then
        ACTIVE_AGENT=$(cat "$AGENT_FILE" 2>/dev/null)
    fi

    # Save agent checkpoint if we found one
    if [[ -n "$ACTIVE_AGENT" ]]; then
        checkpoint_save "circuit_breaker_agent" "$ACTIVE_AGENT" 2>/dev/null || true
    fi

    # Send error message to stderr (Claude will see this)
    cat >&2 << EOF
CONTEXT CIRCUIT BREAKER TRIGGERED

Context usage: ${CONTEXT_PERCENT}% - CRITICAL (threshold: ${CRITICAL_THRESHOLD}%)

Tool execution BLOCKED. You must stop and hand off.
EOF

    # Include agent info if available
    if [[ -n "$ACTIVE_AGENT" ]]; then
        cat >&2 << EOF

Active agent saved: ${ACTIVE_AGENT}
The agent will be restored with FULL context when you run /continue-session.
EOF
    fi

    cat >&2 << EOF

Required actions:
1. Commit any pending changes
2. Tell user to start fresh session with /continue-session

DO NOT attempt further tool calls. This is a hard stop.

To resume later: /continue-session
EOF
    # Exit 2 blocks the tool execution
    exit 2
fi

# Below threshold: allow the tool
exit 0
