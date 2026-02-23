#!/usr/bin/env bash
# list-themes.sh - List all available persona themes
#
# Thin wrapper: discovery logic lives in pf.common.themes
#
# Usage: list-themes.sh [--current-only]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

export PROJECT_ROOT="${PROJECT_ROOT:-$PACKAGE_ROOT}"

# Use run-pf.sh for consistent pf invocation (src/ layout)
source "$SCRIPT_DIR/../lib/run-pf.sh"

if [[ "${1:-}" == "--current-only" ]]; then
    run_pf theme show --current-only
else
    run_pf theme list
fi
