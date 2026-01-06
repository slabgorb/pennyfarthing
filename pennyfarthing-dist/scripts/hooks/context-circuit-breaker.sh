#!/usr/bin/env zsh
# Context circuit breaker hook: Block tool execution at 85% context usage
# Called by Claude Code before tool calls (PreToolUse)
#
# Input: JSON via stdin with tool_name, tool_input
# Output: Exit 0 to allow, Exit 2 to block (stderr shown to Claude)
#
# This hook provides a hard stop when context is critically high,
# unlike context-warning.sh which only warns.

# Read and discard stdin (required by hook protocol)
cat > /dev/null

# Find project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../utils/find-root.sh" 2>/dev/null || true

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

# Load critical threshold (default 85%)
CRITICAL_THRESHOLD="${CRITICAL_THRESHOLD:-85}"

# Check if at or above critical threshold
if [[ "$CONTEXT_PERCENT" -ge "$CRITICAL_THRESHOLD" ]] 2>/dev/null; then
    # Send error message to stderr (Claude will see this)
    cat >&2 << EOF
CONTEXT CIRCUIT BREAKER TRIGGERED

Context usage: ${CONTEXT_PERCENT}% - CRITICAL (threshold: ${CRITICAL_THRESHOLD}%)

Tool execution BLOCKED. You must stop and hand off.

Required actions:
1. Save checkpoint: Run checkpoint_save "{phase}" "{work_summary}"
2. Update session file with current progress
3. Commit any pending changes
4. Hand off to next agent OR tell user to start fresh session

DO NOT attempt further tool calls. This is a hard stop.

To resume later: /continue-session (story 3-4)
EOF
    # Exit 2 blocks the tool execution
    exit 2
fi

# Below threshold: allow the tool
exit 0
