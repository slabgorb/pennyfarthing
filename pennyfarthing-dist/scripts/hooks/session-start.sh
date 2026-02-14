#!/usr/bin/env bash
#
# Session Start Hook - Shell wrapper for Python implementation
#
# Initializes environment for Claude Code session:
# - Session directory setup and logging
# - Checkpoint validation (cross-session drift)
# - WheelHub auto-start
# - OTEL auto-configuration
#
# Input (stdin): JSON with session_id, source, cwd, etc.
# Output: Writes to CLAUDE_ENV_FILE

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

python3 -m pennyfarthing_scripts.session_start_hook
