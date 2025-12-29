#!/usr/bin/env zsh
# Shared utility: Find project root by .claude/ marker
# Source this file to get PROJECT_ROOT set correctly
#
# Usage: source "$(dirname "$0")/utils/find-root.sh"
#    or: source "$SCRIPT_DIR/utils/find-root.sh"
#
# After sourcing, PROJECT_ROOT will be set to the project root directory.

# Skip if PROJECT_ROOT is already set (e.g., by run.sh or CLAUDE_PROJECT_DIR)
if [ -z "$PROJECT_ROOT" ]; then
    _find_root_dir="$PWD"
    while [[ ! -d "$_find_root_dir/.claude" ]] && [[ "$_find_root_dir" != "/" ]]; do
        _find_root_dir="$(dirname "$_find_root_dir")"
    done

    if [[ -d "$_find_root_dir/.claude" ]]; then
        PROJECT_ROOT="$_find_root_dir"
    else
        echo "Error: Could not find project root (no .claude/ directory found)" >&2
        exit 1
    fi
    unset _find_root_dir
fi

export PROJECT_ROOT
