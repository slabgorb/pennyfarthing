#!/usr/bin/env bash
# Shared utility: Find project root via BASH_SOURCE self-location
#
# Core principle: Scripts derive paths from their own location, not from $PWD.
# A script in pennyfarthing-dist/scripts/<category>/ is always 3 levels below
# the package root. This works regardless of where the user invoked it from.
#
# Usage:
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
#   source "$SCRIPT_DIR/../lib/find-root.sh"
#   # PROJECT_ROOT is now set

# Require SCRIPT_DIR to be set by caller
if [[ -z "${SCRIPT_DIR:-}" ]]; then
    echo "Error: SCRIPT_DIR must be set before sourcing find-root.sh" >&2
    echo "Add this before sourcing:" >&2
    echo '  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"' >&2
    exit 1
fi

# Allow explicit override via PENNYFARTHING_ROOT (avoids conflict with orchestrator's PROJECT_ROOT)
if [[ -n "${PENNYFARTHING_ROOT:-}" ]]; then
    PROJECT_ROOT="$PENNYFARTHING_ROOT"
    export PROJECT_ROOT
    return 0 2>/dev/null || exit 0
fi

# Resolve SCRIPT_DIR (follow symlinks to real location)
_real_script_dir="$(cd "$SCRIPT_DIR" && pwd -P)"

# Derive package root from script location
# Scripts in pennyfarthing-dist/scripts/lib/ are 3 levels deep
# Scripts in pennyfarthing-dist/scripts/<category>/ are also 3 levels deep
if [[ "$_real_script_dir" == */pennyfarthing-dist/scripts/* ]]; then
    # Extract everything before /pennyfarthing-dist/scripts/
    _pkg_root="${_real_script_dir%/pennyfarthing-dist/scripts/*}"

    # Determine context: framework dev or consumer?
    # Check node_modules FIRST - if we're in node_modules, we're always a consumer
    if [[ "$_pkg_root" == */node_modules/* ]]; then
        # Consumer context: walk up from node_modules to project
        PROJECT_ROOT="${_pkg_root%/node_modules/*}"
    elif [[ -d "$_pkg_root/pennyfarthing-dist" && ! -L "$_pkg_root/pennyfarthing-dist" ]]; then
        # Framework context: package root IS project root
        PROJECT_ROOT="$_pkg_root"
    else
        PROJECT_ROOT="$_pkg_root"
    fi
else
    echo "Error: Script not in expected location (pennyfarthing-dist/scripts/...)" >&2
    echo "SCRIPT_DIR=$_real_script_dir" >&2
    exit 1
fi

unset _real_script_dir _pkg_root
export PROJECT_ROOT
