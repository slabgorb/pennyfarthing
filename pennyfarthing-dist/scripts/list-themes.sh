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

# Collect themes into array
themes=()
for theme_file in "$THEMES_DIR"/*.yaml; do
    [[ -f "$theme_file" ]] || continue
    theme_name=$(basename "$theme_file" .yaml)

    # Get tier from theme file
    tier=$(grep -E "^  tier:" "$theme_file" 2>/dev/null | sed 's/.*tier:[[:space:]]*//' || echo "U")

    if [[ "$theme_name" == "$CURRENT_THEME" ]]; then
        themes+=("*${theme_name} [${tier}]")
    else
        themes+=("${theme_name} [${tier}]")
    fi
done

# Print header
echo "**${#themes[@]} themes available.** Current: **${CURRENT_THEME:-none}**"
echo ""

# Print in 3 columns
col_width=28
col_count=3
i=0
for theme in "${themes[@]}"; do
    printf "%-${col_width}s" "$theme"
    ((i++))
    if (( i % col_count == 0 )); then
        echo ""
    fi
done

# Final newline if needed
if (( i % col_count != 0 )); then
    echo ""
fi
