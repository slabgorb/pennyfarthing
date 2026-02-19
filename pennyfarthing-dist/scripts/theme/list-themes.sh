#!/usr/bin/env bash
# list-themes.sh - List all available persona themes
#
# Thin wrapper: discovery logic lives in pf.common.themes
#
# Usage: list-themes.sh [--current-only]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

export PROJECT_ROOT

if [[ "${1:-}" == "--current-only" ]]; then
    python3 -c "
from pf.common.themes import get_current_theme
t = get_current_theme()
if t:
    print(t)
else:
    print('No theme set')
    exit(1)
"
else
    python3 -c "
from pf.common.themes import format_theme_list
print(format_theme_list())
"
fi
