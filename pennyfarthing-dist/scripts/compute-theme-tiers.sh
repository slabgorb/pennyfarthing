#!/usr/bin/env bash
# compute-theme-tiers.sh - Compute tier rankings from benchmark results and update theme files
#
# Usage: compute-theme-tiers.sh [--dry-run] [--verbose]
#
# Reads all summary.yaml files from internal/results/benchmarks/
# Aggregates mean scores per theme across all scenarios
# Assigns tier based on overall performance vs control baseline
#
# Tier criteria (based on mean delta from control):
#   S: delta >= +10 (elite - consistently beats control)
#   A: delta >= 0   (excellent - matches or beats control)
#   B: delta >= -10 (strong - slightly below control)
#   C: delta >= -20 (good - notably below control)
#   D: delta < -20  (below average)
#   U: no data      (unbenchmarked)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

BENCHMARKS_DIR="$PROJECT_ROOT/internal/results/benchmarks"
THEMES_DIR="$PROJECT_ROOT/pennyfarthing-dist/personas/themes"

DRY_RUN=false
VERBOSE=false

for arg in "$@"; do
    case $arg in
        --dry-run) DRY_RUN=true ;;
        --verbose) VERBOSE=true ;;
    esac
done

if [[ "$DRY_RUN" == "true" ]]; then
    echo "DRY RUN - no changes will be made"
    echo ""
fi

# Check dependencies
if ! command -v yq &> /dev/null; then
    echo "Error: yq is required but not installed"
    exit 1
fi

# Temporary files for aggregation
THEME_DATA=$(mktemp)
THEME_AGG=$(mktemp)
trap "rm -f $THEME_DATA $THEME_AGG" EXIT

# Process all summary.yaml files - extract theme, mean score, and delta
echo "Scanning benchmark results..."

find "$BENCHMARKS_DIR" -name "summary.yaml" -type f | while read -r f; do
    theme=$(yq '.agent.theme' "$f" 2>/dev/null | grep -v "^null$" || true)
    mean=$(yq '.statistics.mean' "$f" 2>/dev/null | grep -v "^null$" || true)
    delta=$(yq '.baseline_comparison.delta' "$f" 2>/dev/null | grep -v "^null$" || true)
    if [[ -n "$theme" && -n "$mean" ]]; then
        echo "$theme $mean ${delta:-0}"
    fi
done > "$THEME_DATA"

summary_count=$(wc -l < "$THEME_DATA" | tr -d ' ')
echo "Found $summary_count benchmark results"
echo ""

# Aggregate by theme: calculate count, sum of scores, sum of deltas
awk '
{
    theme = $1
    score = $2
    delta = $3
    count[theme]++
    sum_score[theme] += score
    sum_delta[theme] += delta
}
END {
    for (theme in count) {
        mean_score = sum_score[theme] / count[theme]
        mean_delta = sum_delta[theme] / count[theme]

        # Assign tier based on mean delta
        if (mean_delta >= 10) tier = "S"
        else if (mean_delta >= 0) tier = "A"
        else if (mean_delta >= -10) tier = "B"
        else if (mean_delta >= -20) tier = "C"
        else tier = "D"

        printf "%s|%d|%.2f|%.2f|%s\n", theme, count[theme], mean_score, mean_delta, tier
    }
}
' "$THEME_DATA" | sort -t'|' -k4 -rn > "$THEME_AGG"

# Print results
echo "Theme Performance Summary"
echo "========================="
echo ""
printf "%-25s %6s %8s %8s %4s\n" "Theme" "Runs" "Mean" "Delta" "Tier"
printf "%-25s %6s %8s %8s %4s\n" "-------------------------" "------" "--------" "--------" "----"

updated=0
unchanged=0

while IFS='|' read -r theme n score delta tier; do
    printf "%-25s %6d %8.2f %+8.2f %4s\n" "$theme" "$n" "$score" "$delta" "$tier"

    # Update theme file
    theme_file="$THEMES_DIR/${theme}.yaml"
    if [[ -f "$theme_file" ]]; then
        current_tier=$(grep -E "^  tier:" "$theme_file" 2>/dev/null | sed 's/.*tier:[[:space:]]*//' || echo "U")

        if [[ "$current_tier" != "$tier" ]]; then
            if [[ "$DRY_RUN" == "true" ]]; then
                [[ "$VERBOSE" == "true" ]] && echo "  Would update: $current_tier → $tier"
            else
                sed -i '' "s/^  tier:.*/  tier: $tier/" "$theme_file"
                [[ "$VERBOSE" == "true" ]] && echo "  Updated: $current_tier → $tier"
            fi
            updated=$((updated + 1))
        else
            unchanged=$((unchanged + 1))
        fi
    else
        [[ "$VERBOSE" == "true" ]] && echo "  Warning: No theme file for $theme"
    fi
done < "$THEME_AGG"

echo ""

# Count themes by tier
echo "Tier Distribution:"
for t in S A B C D; do
    count=$(grep -c "|$t$" "$THEME_AGG" 2>/dev/null || echo 0)
    echo "  $t: $count themes"
done

# Count unbenchmarked themes
benchmarked=$(wc -l < "$THEME_AGG" | tr -d ' ')
total_themes=$(ls "$THEMES_DIR"/*.yaml 2>/dev/null | wc -l | tr -d ' ')
unbenchmarked=$((total_themes - benchmarked))
echo "  U: $unbenchmarked themes (unbenchmarked)"

echo ""
echo "Summary: $updated updated, $unchanged unchanged"
