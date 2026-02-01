#!/usr/bin/env bash
# Shared utility: Find project root by walking up to .pennyfarthing/
#
# Usage:
#   source "$SCRIPT_DIR/../lib/find-root.sh"
#   # PROJECT_ROOT is now set
#
# Or simply:
#   source /path/to/find-root.sh
#   # PROJECT_ROOT is now set

# Allow explicit override
if [[ -n "${PROJECT_ROOT:-}" ]]; then
    export PROJECT_ROOT
    return 0 2>/dev/null || exit 0
fi

# Walk up from PWD looking for .pennyfarthing/
_d="$PWD"
while [[ ! -d "$_d/.pennyfarthing" ]] && [[ "$_d" != "/" ]]; do
    _d="$(dirname "$_d")"
done

if [[ -d "$_d/.pennyfarthing" ]]; then
    PROJECT_ROOT="$_d"
else
    echo "Error: Could not find .pennyfarthing/ directory" >&2
    echo "Are you in a Pennyfarthing-enabled project?" >&2
    exit 1
fi

unset _d
export PROJECT_ROOT
