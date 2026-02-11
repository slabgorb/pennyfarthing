#!/usr/bin/env bash
# Consolidate Job Fair Results
# Merges multiple role-specific runs for the same theme into one summary
# Usage: ./scripts/consolidate-job-fair.sh [theme1 theme2 ...]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
RESULTS_DIR="$PROJECT_DIR/internal/results/job-fair"
CONSOLIDATED_DIR="$RESULTS_DIR/consolidated"

mkdir -p "$CONSOLIDATED_DIR"

# If themes specified, use those; otherwise find all themes
if [[ $# -gt 0 ]]; then
    THEMES="$@"
else
    # Extract unique theme names from directory names
    THEMES=$(ls -d "$RESULTS_DIR"/*-20* 2>/dev/null | xargs -n1 basename | sed 's/-20[0-9]*T[0-9]*Z$//' | sed 's/-20[0-9]*-[0-9]*$//' | sort -u)
fi

echo "=== Consolidating Job Fair Results ==="
echo ""

for THEME in $THEMES; do
    echo "### Processing: $THEME"

    # Find all directories for this theme
    THEME_DIRS=$(ls -d "$RESULTS_DIR/${THEME}"-20* 2>/dev/null | sort)

    if [[ -z "$THEME_DIRS" ]]; then
        echo "  [SKIP] No results found for $THEME"
        continue
    fi

    # Create consolidated directory for this theme
    THEME_OUT="$CONSOLIDATED_DIR/$THEME"
    mkdir -p "$THEME_OUT"

    # Merge all raw_results.txt files
    > "$THEME_OUT/raw_results.txt"

    for DIR in $THEME_DIRS; do
        if [[ -f "$DIR/raw_results.txt" ]]; then
            cat "$DIR/raw_results.txt" >> "$THEME_OUT/raw_results.txt"
        fi
    done

    # Count unique roles collected
    ROLES=$(cut -d: -f3 "$THEME_OUT/raw_results.txt" 2>/dev/null | sort -u | tr '\n' ' ')
    ROLE_COUNT=$(echo "$ROLES" | wc -w | tr -d ' ')

    echo "  Merged $ROLE_COUNT roles: $ROLES"

    # Generate consolidated summary
    TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    cat > "$THEME_OUT/summary.yaml" << EOF
# Consolidated Job Fair Results
theme: $THEME
consolidated_at: $TIMESTAMP
source_runs: $(echo "$THEME_DIRS" | wc -l | tr -d ' ')

scenarios:
  dev-codegen: tdd-shopping-cart
  dev-debug: astropy-12907
  reviewer: order-service
  tea: payment-processor-tests
  sm: sprint-planning-conflict
  architect: legacy-modernization

baselines:
  dev-codegen: {mean: 85.8, std: 7.30, n: 10}
  dev-debug: {mean: 77.5, std: 8.54, n: 10}
  reviewer: {mean: 78.5, std: 1.8, n: 10}
  tea: {mean: 72.1, std: 2.3, n: 10}
  sm: {mean: 80.3, std: 1.9, n: 10}
  architect: {mean: 87.2, std: 3.25, n: 10}

EOF

    # Parse raw results and build matrix
    if [[ -s "$THEME_OUT/raw_results.txt" ]]; then
        echo "" >> "$THEME_OUT/summary.yaml"
        echo "matrix:" >> "$THEME_OUT/summary.yaml"

        # Get unique characters (handle names with spaces)
        cut -d: -f2 "$THEME_OUT/raw_results.txt" | sort -u | while IFS= read -r CHAR; do
            [[ -z "$CHAR" ]] && continue
            CHAR_KEY=$(echo "$CHAR" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/_/g' | sed 's/__*/_/g' | sed 's/^_//;s/_$//')
            echo "  $CHAR_KEY:" >> "$THEME_OUT/summary.yaml"

            # Get all roles for this character (escape special chars in grep)
            CHAR_ESCAPED=$(printf '%s\n' "$CHAR" | sed 's/[[\.*^$()+?{|]/\\&/g')
            grep ":${CHAR}:" "$THEME_OUT/raw_results.txt" | while IFS=: read -r src_role char role mean n; do
                echo "    $role: {mean: $mean, n: $n}" >> "$THEME_OUT/summary.yaml"
            done
        done
    fi

    echo "  -> $THEME_OUT/summary.yaml"
done

echo ""
echo "=== Consolidation Complete ==="
echo "Results in: $CONSOLIDATED_DIR/"
