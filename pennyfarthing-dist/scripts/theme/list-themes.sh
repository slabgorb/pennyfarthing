#!/usr/bin/env bash
# list-themes.sh - List all available persona themes
#
# Usage: list-themes.sh [--current-only]
#
# Options:
#   --current-only  Only show the current theme name

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

THEMES_DIR="$PROJECT_ROOT/pennyfarthing-dist/personas/themes"
CONFIG_FILE="$PROJECT_ROOT/.pennyfarthing/config.local.yaml"

# Get current theme from config
get_current_theme() {
    if [[ -f "$CONFIG_FILE" ]]; then
        grep -E "^theme:" "$CONFIG_FILE" 2>/dev/null | sed 's/theme:[[:space:]]*//' || echo ""
    else
        echo ""
    fi
}

CURRENT_THEME=$(get_current_theme)

# Handle --current-only flag
if [[ "${1:-}" == "--current-only" ]]; then
    if [[ -n "$CURRENT_THEME" ]]; then
        echo "$CURRENT_THEME"
    else
        echo "No theme set"
        exit 1
    fi
    exit 0
fi

# Extract all theme data in one grep + format with awk (fast path)
# Single grep call across all files, awk handles formatting
grep -H "^  tier:" "$THEMES_DIR"/*.yaml 2>/dev/null | \
    sed 's|.*/||; s|\.yaml:.*tier:[[:space:]]*| |' | \
    sort | \
    awk -v current="$CURRENT_THEME" '
    {
        theme = $1
        tier = $2 ? $2 : "U"
        if (theme == current) {
            themes[NR] = "*" theme " [" tier "]"
        } else {
            themes[NR] = theme " [" tier "]"
        }
        count++
    }
    END {
        # Print header
        print "**" count " themes available.** Current: **" (current ? current : "none") "**"
        print ""

        # Print in 3 columns
        col_width = 28
        col = 0
        for (i = 1; i <= count; i++) {
            printf "%-" col_width "s", themes[i]
            col++
            if (col == 3) {
                print ""
                col = 0
            }
        }
        if (col > 0) print ""
    }
'
