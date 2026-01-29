#!/usr/bin/env zsh
# Context warning hook: Warn agent when context usage is high
# Called by Claude Code before tool calls (PreToolUse)
#
# Input: JSON via stdin with tool_name, tool_input
# Output: Warning message to stdout if context > 60%
# Always exits 0 (warning only, never blocks)

# Read and discard stdin (required by hook protocol)
cat > /dev/null

# Script location for sibling script references
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Get context percentage from check-context.sh
CONTEXT_SCRIPT="$SCRIPT_DIR/../check-context.sh"
if [[ ! -x "$CONTEXT_SCRIPT" ]]; then
    exit 0  # Can't check, allow silently
fi

# Run check-context.sh and parse output
eval "$("$CONTEXT_SCRIPT" 2>/dev/null)" 2>/dev/null

# Check if we got a valid percentage
if [[ -z "$CONTEXT_PERCENT" ]] || [[ "$CONTEXT_PERCENT" == "null" ]]; then
    exit 0  # Can't determine, allow silently
fi

# Load thresholds from settings (defaults match check-context.sh)
WARNING_THRESHOLD="${WARNING_THRESHOLD:-60}"
CRITICAL_THRESHOLD="${CRITICAL_THRESHOLD:-85}"

# Output warning if above threshold
if [[ "$CONTEXT_PERCENT" -ge "$CRITICAL_THRESHOLD" ]] 2>/dev/null; then
    cat << EOF

---
CONTEXT WARNING: ${CONTEXT_PERCENT}% (CRITICAL)

Context usage is critically high. Recommended actions:
1. Complete current task immediately
2. Commit any pending changes
3. Hand off to next agent or ask user to start fresh session

Do NOT start new subtasks. Wrap up and hand off.
---

EOF
elif [[ "$CONTEXT_PERCENT" -ge "$WARNING_THRESHOLD" ]] 2>/dev/null; then
    cat << EOF

---
CONTEXT WARNING: ${CONTEXT_PERCENT}%

Context usage is high. Consider:
- Wrapping up current task soon
- Preparing for handoff to next agent
- Avoiding large file reads or complex operations
---

EOF
fi

# Always allow the tool (we're warning, not blocking)
exit 0
