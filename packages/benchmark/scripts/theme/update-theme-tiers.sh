#!/usr/bin/env zsh
# update-theme-tiers.sh - Update tier field in theme YAML files based on THEME-TIERS.md
#
# Usage: update-theme-tiers.sh [--dry-run]

set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIR:h:h:h:h}"

THEMES_DIR="$PROJECT_ROOT/pennyfarthing-dist/personas/themes"
TIERS_DOC="$PROJECT_ROOT/docs/THEME-TIERS.md"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
    echo "DRY RUN - no changes will be made"
    echo ""
fi

# Extract theme-to-tier mapping from THEME-TIERS.md
typeset -A TIER_MAP

current_tier=""
while IFS= read -r line; do
    # Detect tier section headers
    if [[ "$line" =~ "^## S-Tier" ]]; then
        current_tier="S"
    elif [[ "$line" =~ "^## A-Tier" ]]; then
        current_tier="A"
    elif [[ "$line" =~ "^## B-Tier" ]]; then
        current_tier="B"
    elif [[ "$line" =~ "^## C-Tier" ]]; then
        current_tier="C"
    elif [[ "$line" =~ "^## D-Tier" ]]; then
        current_tier="D"
    elif [[ "$line" =~ "^## U-Tier" ]]; then
        current_tier="U"
    elif [[ "$line" =~ "^## (Role-by-Role|Recommendations|OCEAN|Data|See)" ]]; then
        # Stop parsing at these sections
        break
    fi

    # Extract theme names from table rows (| **theme** | or | theme |)
    if [[ -n "$current_tier" && "$line" =~ '^\|[[:space:]]*\*?\*?([a-z0-9-]+)\*?\*?[[:space:]]*\|' ]]; then
        theme_name="${match[1]}"
        # Skip header rows
        if [[ "$theme_name" != "Theme" && "$theme_name" != "---" ]]; then
            TIER_MAP[$theme_name]="$current_tier"
        fi
    fi
done < "$TIERS_DOC"

echo "Parsed ${#TIER_MAP[@]} theme tiers from THEME-TIERS.md"
echo ""

# Update each theme file
updated=0
skipped=0
unchanged=0

for theme_file in "$THEMES_DIR"/*.yaml; do
    [[ -f "$theme_file" ]] || continue

    theme_name="${theme_file:t:r}"
    new_tier="${TIER_MAP[$theme_name]:-U}"  # Default to U (unbenchmarked) if not found

    # Get current tier from file
    current_tier=$(grep -E "^  tier:" "$theme_file" 2>/dev/null | sed 's/.*tier:[[:space:]]*//' || echo "")

    if [[ "$current_tier" == "$new_tier" ]]; then
        unchanged=$((unchanged + 1))
        continue
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "Would update $theme_name: ${current_tier:-<none>} → $new_tier"
        updated=$((updated + 1))
    else
        # Use sed to update the tier field
        if [[ -n "$current_tier" ]]; then
            sed -i '' "s/^  tier:.*/  tier: $new_tier/" "$theme_file"
        else
            # Add tier field after user_title line
            sed -i '' "/^  user_title:/a\\
  tier: $new_tier" "$theme_file"
        fi
        echo "Updated $theme_name: ${current_tier:-<none>} → $new_tier"
        updated=$((updated + 1))
    fi
done

echo ""
echo "Summary:"
echo "  Updated: $updated"
echo "  Unchanged: $unchanged"
echo "  Skipped: $skipped"
