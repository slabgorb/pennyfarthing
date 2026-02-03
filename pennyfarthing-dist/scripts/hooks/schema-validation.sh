#!/usr/bin/env zsh
# Schema Validation Hook
# Validates XML schema for session, skill, and workflow step files on Write operations
# Called by Claude Code PreToolUse hook
#
# Input: JSON via stdin with tool_name, tool_input
# Output: JSON with decision (allow/deny)

set -euo pipefail

# Find script directory (zsh compatible)
SCRIPT_DIR="${0:A:h}"
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

# Run Python validation hook
python3 -m pennyfarthing_scripts.schema_validation_hook
