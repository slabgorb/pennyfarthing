#!/usr/bin/env bash
#
# Cyclist PreToolUse Hook - Shell wrapper for Python implementation
#
# Routes tool approval requests through WheelHub when Cyclist is running.
# Falls back to Claude Code's built-in permissions when Cyclist is not active.
#
# Input (stdin): JSON with tool_name, tool_input, session_id, etc.
# Output (stdout): JSON decision (allow/deny/ask)
#
# Story: MSSCI-14320

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/../lib/find-root.sh"

# Set PYTHONPATH for pennyfarthing_scripts
PENNYFARTHING_SCRIPTS=""
if [[ -d "$PROJECT_ROOT/pennyfarthing" ]]; then
    # Dogfooding: framework inlined in orchestrator
    PENNYFARTHING_SCRIPTS="$PROJECT_ROOT/pennyfarthing"
elif [[ -d "$PROJECT_ROOT/node_modules/@pennyfarthing/core" ]]; then
    # Normal install
    PENNYFARTHING_SCRIPTS="$PROJECT_ROOT/node_modules/@pennyfarthing/core"
fi

if [[ -n "$PENNYFARTHING_SCRIPTS" ]]; then
    export PYTHONPATH="$PENNYFARTHING_SCRIPTS:${PYTHONPATH:-}"
fi

python3 -m pennyfarthing_scripts.pretooluse_hook
