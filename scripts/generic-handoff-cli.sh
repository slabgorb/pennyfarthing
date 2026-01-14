#!/bin/bash
# generic-handoff-cli.sh - Shell wrapper for generic-handoff-cli.js
# Story 31-10: CLI interface for workflow handoff operations
#
# All logic is implemented in generic-handoff-cli.js (Node.js)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$SCRIPT_DIR/generic-handoff-cli.js" "$@"
