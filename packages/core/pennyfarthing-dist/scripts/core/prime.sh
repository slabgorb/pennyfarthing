#!/usr/bin/env bash
# prime.sh - Load essential project context at agent activation
# Usage: prime.sh [--minimal] [--full] [--quiet] [--agent <name>]
#
# Thin wrapper around python -m pennyfarthing_scripts.prime

# Find the package root (where pennyfarthing_scripts lives)
# Works for both npm installs (node_modules/@pennyfarthing/core) and local dev
# Use pwd -P to resolve symlinks in the path (handles symlinked parent dirs)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd -P)"

# Fallback: if pennyfarthing_scripts not found at expected location,
# look in node_modules (handles edge cases like stale copies)
if [[ ! -d "$PACKAGE_ROOT/pennyfarthing_scripts" ]]; then
    # Find project root by looking for .pennyfarthing marker
    PROJECT_ROOT="$PWD"
    while [[ ! -d "$PROJECT_ROOT/.pennyfarthing" ]] && [[ "$PROJECT_ROOT" != "/" ]]; do
        PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"
    done
    # Try node_modules location
    if [[ -d "$PROJECT_ROOT/node_modules/@pennyfarthing/core/pennyfarthing_scripts" ]]; then
        PACKAGE_ROOT="$PROJECT_ROOT/node_modules/@pennyfarthing/core"
    fi
fi

# Set PYTHONPATH so Python can find pennyfarthing_scripts
export PYTHONPATH="${PACKAGE_ROOT}:${PYTHONPATH:-}"

exec python3 -m pennyfarthing_scripts.prime "$@"
