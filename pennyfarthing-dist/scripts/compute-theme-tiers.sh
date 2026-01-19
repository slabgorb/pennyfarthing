#!/usr/bin/env bash
# compute-theme-tiers.sh - Compute tier rankings from job-fair results and update theme files
#
# Usage: compute-theme-tiers.sh [--dry-run] [--verbose]
#
# Reads all summary.yaml files from internal/results/job-fair/
# For each theme, extracts all character×role scores from the matrix
# Computes delta vs baseline for each role, then averages across all roles
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

JOB_FAIR_DIR="$PROJECT_ROOT/internal/results/job-fair"
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

# Process all job-fair summary.yaml files
# Extract theme name, compute mean score and delta vs baselines
echo "Scanning job-fair results..."

find "$JOB_FAIR_DIR" -name "summary.yaml" -type f | while read -r f; do
    theme=$(yq '.theme' "$f" 2>/dev/null | grep -v "^null$" || true)
    [[ -z "$theme" ]] && continue

    # Extract baselines as "role:mean" pairs
    baselines=$(yq '.baselines | to_entries | .[] | .key + ":" + (.value.mean | tostring)' "$f" 2>/dev/null || true)
    [[ -z "$baselines" ]] && continue

    # Extract all matrix scores as "role:mean" pairs (flatten character dimension)
    # Matrix format: character: { role: {mean: X, n: Y} }
    scores=$(yq '.matrix | to_entries | .[] | .value | to_entries | .[] | .key + ":" + (.value.mean | tostring)' "$f" 2>/dev/null || true)
    [[ -z "$scores" ]] && continue

    # Use awk to compute per-role averages and deltas, then overall mean
    echo "$theme" "$(echo "$baselines" | tr '\n' '|')" "$(echo "$scores" | tr '\n' '|')"
done | awk '
{
    theme = $1

    # Parse baselines (field 2)
    n_base = split($2, base_pairs, "|")
    for (i = 1; i <= n_base; i++) {
        if (base_pairs[i] == "") continue
        split(base_pairs[i], kv, ":")
        baseline[kv[1]] = kv[2]
    }

    # Parse scores (field 3) and accumulate by role
    delete role_sum
    delete role_count
    n_scores = split($3, score_pairs, "|")
    for (i = 1; i <= n_scores; i++) {
        if (score_pairs[i] == "") continue
        split(score_pairs[i], kv, ":")
        role = kv[1]
        score = kv[2]
        role_sum[role] += score
        role_count[role]++
    }

    # Compute delta for each role, then average
    total_delta = 0
    total_score = 0
    n_roles = 0
    for (role in role_sum) {
        role_mean = role_sum[role] / role_count[role]
        if (role in baseline) {
            delta = role_mean - baseline[role]
            total_delta += delta
            total_score += role_mean
            n_roles++
        }
    }

    if (n_roles > 0) {
        mean_delta = total_delta / n_roles
        mean_score = total_score / n_roles
        print theme, n_scores, mean_score, mean_delta
    }
}
' > "$THEME_DATA"

summary_count=$(wc -l < "$THEME_DATA" | tr -d ' ')
echo "Found $summary_count themes with job-fair results"
echo ""

# Aggregate by theme (in case multiple job-fair runs exist for same theme)
# Take the most recent (last) result for each theme
awk '
{
    theme = $1
    n = $2
    score = $3
    delta = $4
    # Keep last occurrence (most recent)
    data[theme] = n "|" score "|" delta
}
END {
    for (theme in data) {
        split(data[theme], parts, "|")
        n = parts[1]
        score = parts[2]
        delta = parts[3]

        # Assign tier based on mean delta
        if (delta >= 10) tier = "S"
        else if (delta >= 0) tier = "A"
        else if (delta >= -10) tier = "B"
        else if (delta >= -20) tier = "C"
        else tier = "D"

        printf "%s|%d|%.2f|%.2f|%s\n", theme, n, score, delta, tier
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
