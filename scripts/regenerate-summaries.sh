#!/usr/bin/env bash
# Regenerate job-fair summaries with champions sections
# Usage: ./scripts/regenerate-summaries.sh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RESULTS_DIR="$PROJECT_DIR/internal/results/job-fair"
THEMES_DIR="$PROJECT_DIR/pennyfarthing-dist/personas/themes"
OUTPUT_FILE="$PROJECT_DIR/.scratch/swap-recommendations.yaml"

echo "=== Regenerating Job Fair Summaries ==="
echo ""

# Create output file header
cat > "$OUTPUT_FILE" << 'EOF'
# Job Fair Swap Recommendations
# Generated from job-fair results analysis
#
# For each theme, shows:
#   - Current role assignments
#   - Champions from job-fair benchmarks
#   - Recommended swaps (where champion != native)

recommendations:
EOF

# Process each summary directory (use newest timestamp per theme)
declare -A PROCESSED_THEMES

for summary_file in "$RESULTS_DIR"/*/summary.yaml; do
    dir_name=$(basename "$(dirname "$summary_file")")

    # Extract theme name (everything before the timestamp)
    theme=$(echo "$dir_name" | sed 's/-[0-9]*T[0-9]*Z$//' | sed 's/-[0-9]*-[0-9]*$//')

    # Skip if we already processed a newer version of this theme
    if [[ -n "${PROCESSED_THEMES[$theme]}" ]]; then
        continue
    fi
    PROCESSED_THEMES[$theme]=1

    theme_file="$THEMES_DIR/${theme}.yaml"
    if [[ ! -f "$theme_file" ]]; then
        echo "  [SKIP] $theme - no theme file found"
        continue
    fi

    echo "Processing: $theme"

    # Get native role holders from theme file
    dev_native=$(yq -r '.agents.dev.character // .agents.dev.shortName // "unknown"' "$theme_file" 2>/dev/null || echo "unknown")
    reviewer_native=$(yq -r '.agents.reviewer.character // .agents.reviewer.shortName // "unknown"' "$theme_file" 2>/dev/null || echo "unknown")
    tea_native=$(yq -r '.agents.tea.character // .agents.tea.shortName // "unknown"' "$theme_file" 2>/dev/null || echo "unknown")
    sm_native=$(yq -r '.agents.sm.character // .agents.sm.shortName // "unknown"' "$theme_file" 2>/dev/null || echo "unknown")

    # Parse matrix and find champions for each role
    # This handles both consolidated and duplicated key formats
    dev_champion=""
    dev_score=0
    reviewer_champion=""
    reviewer_score=0
    tea_champion=""
    tea_score=0
    sm_champion=""
    sm_score=0

    # Extract all character scores using yq
    # For dev role
    while IFS=: read -r char score; do
        if [[ -n "$char" && -n "$score" ]]; then
            score_num=$(echo "$score" | grep -oE '[0-9]+\.?[0-9]*' | head -1)
            if [[ -n "$score_num" ]]; then
                if (( $(echo "$score_num > $dev_score" | bc -l) )); then
                    dev_score=$score_num
                    dev_champion=$char
                fi
            fi
        fi
    done < <(yq -r '.matrix | to_entries[] | select(.value.dev) | "\(.key):\(.value.dev.mean)"' "$summary_file" 2>/dev/null || true)

    # For reviewer role
    while IFS=: read -r char score; do
        if [[ -n "$char" && -n "$score" ]]; then
            score_num=$(echo "$score" | grep -oE '[0-9]+\.?[0-9]*' | head -1)
            if [[ -n "$score_num" ]]; then
                if (( $(echo "$score_num > $reviewer_score" | bc -l) )); then
                    reviewer_score=$score_num
                    reviewer_champion=$char
                fi
            fi
        fi
    done < <(yq -r '.matrix | to_entries[] | select(.value.reviewer) | "\(.key):\(.value.reviewer.mean)"' "$summary_file" 2>/dev/null || true)

    # For tea role
    while IFS=: read -r char score; do
        if [[ -n "$char" && -n "$score" ]]; then
            score_num=$(echo "$score" | grep -oE '[0-9]+\.?[0-9]*' | head -1)
            if [[ -n "$score_num" ]]; then
                if (( $(echo "$score_num > $tea_score" | bc -l) )); then
                    tea_score=$score_num
                    tea_champion=$char
                fi
            fi
        fi
    done < <(yq -r '.matrix | to_entries[] | select(.value.tea) | "\(.key):\(.value.tea.mean)"' "$summary_file" 2>/dev/null || true)

    # For sm role
    while IFS=: read -r char score; do
        if [[ -n "$char" && -n "$score" ]]; then
            score_num=$(echo "$score" | grep -oE '[0-9]+\.?[0-9]*' | head -1)
            if [[ -n "$score_num" ]]; then
                if (( $(echo "$score_num > $sm_score" | bc -l) )); then
                    sm_score=$score_num
                    sm_champion=$char
                fi
            fi
        fi
    done < <(yq -r '.matrix | to_entries[] | select(.value.sm) | "\(.key):\(.value.sm.mean)"' "$summary_file" 2>/dev/null || true)

    # Output to recommendations file
    echo "  - theme: $theme" >> "$OUTPUT_FILE"
    echo "    natives:" >> "$OUTPUT_FILE"
    echo "      dev: \"$dev_native\"" >> "$OUTPUT_FILE"
    echo "      reviewer: \"$reviewer_native\"" >> "$OUTPUT_FILE"
    echo "      tea: \"$tea_native\"" >> "$OUTPUT_FILE"
    echo "      sm: \"$sm_native\"" >> "$OUTPUT_FILE"
    echo "    champions:" >> "$OUTPUT_FILE"
    echo "      dev: {character: \"$dev_champion\", score: $dev_score}" >> "$OUTPUT_FILE"
    echo "      reviewer: {character: \"$reviewer_champion\", score: $reviewer_score}" >> "$OUTPUT_FILE"
    echo "      tea: {character: \"$tea_champion\", score: $tea_score}" >> "$OUTPUT_FILE"
    echo "      sm: {character: \"$sm_champion\", score: $sm_score}" >> "$OUTPUT_FILE"

    # Calculate swaps needed
    swaps=""
    if [[ -n "$dev_champion" && "$dev_champion" != "unknown" ]]; then
        dev_native_slug=$(echo "$dev_native" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/_/g')
        if [[ "$dev_champion" != "$dev_native_slug" && "$dev_champion" != *"$dev_native_slug"* ]]; then
            swaps="$swaps dev:$dev_champion"
        fi
    fi
    if [[ -n "$reviewer_champion" && "$reviewer_champion" != "unknown" ]]; then
        reviewer_native_slug=$(echo "$reviewer_native" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/_/g')
        if [[ "$reviewer_champion" != "$reviewer_native_slug" && "$reviewer_champion" != *"$reviewer_native_slug"* ]]; then
            swaps="$swaps reviewer:$reviewer_champion"
        fi
    fi
    if [[ -n "$tea_champion" && "$tea_champion" != "unknown" ]]; then
        tea_native_slug=$(echo "$tea_native" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/_/g')
        if [[ "$tea_champion" != "$tea_native_slug" && "$tea_champion" != *"$tea_native_slug"* ]]; then
            swaps="$swaps tea:$tea_champion"
        fi
    fi
    if [[ -n "$sm_champion" && "$sm_champion" != "unknown" ]]; then
        sm_native_slug=$(echo "$sm_native" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/_/g')
        if [[ "$sm_champion" != "$sm_native_slug" && "$sm_champion" != *"$sm_native_slug"* ]]; then
            swaps="$swaps sm:$sm_champion"
        fi
    fi

    if [[ -n "$swaps" ]]; then
        echo "    swaps_needed: [${swaps# }]" >> "$OUTPUT_FILE"
    else
        echo "    swaps_needed: []" >> "$OUTPUT_FILE"
    fi
    echo "" >> "$OUTPUT_FILE"

done

echo ""
echo "=== Summary Regeneration Complete ==="
echo "Recommendations saved to: $OUTPUT_FILE"
