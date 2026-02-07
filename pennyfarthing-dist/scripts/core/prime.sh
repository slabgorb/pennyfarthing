#!/usr/bin/env bash
# prime.sh - Load essential project context at agent activation
# Usage: prime.sh [--minimal] [--full] [--quiet] [--agent <name>]
#
# Uses the `pf` CLI (installed via uv/pipx during pennyfarthing init).
# Falls back to python3 -m with PYTHONPATH if pf is not available.

# Prefer pf CLI if available
if command -v pf &>/dev/null; then
    exec pf prime "$@"
fi

# Fallback: find pennyfarthing_scripts via PYTHONPATH
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd -P)"

if [[ ! -d "$PACKAGE_ROOT/pennyfarthing_scripts" ]]; then
    PROJECT_ROOT="$PWD"
    while [[ ! -d "$PROJECT_ROOT/.pennyfarthing" ]] && [[ "$PROJECT_ROOT" != "/" ]]; do
        PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"
    done
    if [[ -d "$PROJECT_ROOT/node_modules/@pennyfarthing/core/pennyfarthing_scripts" ]]; then
        PACKAGE_ROOT="$PROJECT_ROOT/node_modules/@pennyfarthing/core"
    fi
fi

export PYTHONPATH="${PACKAGE_ROOT}:${PYTHONPATH:-}"
exec python3 -m pennyfarthing_scripts.prime "$@"
