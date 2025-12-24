#!/bin/bash
# Bootstrap script - finds PROJECT_ROOT and runs the requested script
# Usage: ./scripts/run.sh <script-name> [args...]
#
# This solves the absolute path problem by:
# 1. Finding PROJECT_ROOT by looking for the .claude/ directory
# 2. Exporting PROJECT_ROOT for the script to use
# 3. Running the script with full absolute paths

set -euo pipefail

# Find PROJECT_ROOT by looking for .claude/ marker
find_project_root() {
    local dir="$PWD"
    while [[ ! -d "$dir/.claude" ]] && [[ "$dir" != "/" ]]; do
        dir="$(dirname "$dir")"
    done
    if [[ -d "$dir/.claude" ]]; then
        echo "$dir"
    else
        echo "Error: Could not find project root (no .claude/ directory found)" >&2
        exit 1
    fi
}

PROJECT_ROOT="$(find_project_root)"
export PROJECT_ROOT

# Get the script to run
if [[ $# -lt 1 ]]; then
    echo "Usage: ./scripts/run.sh <script-name> [args...]" >&2
    echo "Example: ./scripts/run.sh agent-session.sh start sm" >&2
    exit 1
fi

SCRIPT_NAME="$1"
shift

# Handle different script locations
if [[ -f "$PROJECT_ROOT/scripts/$SCRIPT_NAME" ]]; then
    exec "$PROJECT_ROOT/scripts/$SCRIPT_NAME" "$@"
elif [[ -f "$PROJECT_ROOT/scripts/utils/$SCRIPT_NAME" ]]; then
    exec "$PROJECT_ROOT/scripts/utils/$SCRIPT_NAME" "$@"
elif [[ -f "$PROJECT_ROOT/scripts/hooks/$SCRIPT_NAME" ]]; then
    exec "$PROJECT_ROOT/scripts/hooks/$SCRIPT_NAME" "$@"
else
    echo "Error: Script not found: $SCRIPT_NAME" >&2
    echo "Looked in:" >&2
    echo "  $PROJECT_ROOT/scripts/$SCRIPT_NAME" >&2
    echo "  $PROJECT_ROOT/scripts/utils/$SCRIPT_NAME" >&2
    echo "  $PROJECT_ROOT/scripts/hooks/$SCRIPT_NAME" >&2
    exit 1
fi
