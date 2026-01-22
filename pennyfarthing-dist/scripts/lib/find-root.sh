#!/usr/bin/env zsh
# Shared utility: Find project root by .claude/ marker
#
# DEPRECATED: Scripts invoked via run.sh already have PROJECT_ROOT set.
# This file is kept for backwards compatibility with scripts that may be
# run directly (not via run.sh).
#
# When run.sh executes a script, it sets PROJECT_ROOT before exec'ing,
# so sourcing this file is a no-op (line 12 skips if already set).
#
# For new scripts: Just assume PROJECT_ROOT is set by the caller (run.sh).

# Skip if PROJECT_ROOT is already set (e.g., by run.sh or CLAUDE_PROJECT_DIR)
if [ -z "${PROJECT_ROOT:-}" ]; then
    # Prefer SCRIPT_DIR (stable, set by caller) over PWD (may not be in project)
    if [ -n "${SCRIPT_DIR:-}" ]; then
        _find_root_dir="$SCRIPT_DIR"
    else
        _find_root_dir="$PWD"
    fi

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
