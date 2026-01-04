#!/bin/bash
# Generate LEADERBOARD.md from benchmark results
# Usage: ./scripts/generate-leaderboard.sh <scenario> <role>
#
# Example: ./scripts/generate-leaderboard.sh race-condition-cache dev

set -e

SCENARIO="$1"
ROLE="$2"

if [[ -z "$SCENARIO" || -z "$ROLE" ]]; then
    echo "Usage: $0 <scenario> <role>" >&2
    echo "Example: $0 race-condition-cache dev" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BASELINE_DIR="$PROJECT_DIR/results/baselines/$SCENARIO/$ROLE"
BENCHMARK_DIR="$PROJECT_DIR/results/benchmarks/$SCENARIO"
OUTPUT_FILE="$BENCHMARK_DIR/LEADERBOARD.md"

# Check baseline exists
if [[ ! -f "$BASELINE_DIR/summary.yaml" ]]; then
    echo "Error: Baseline not found at $BASELINE_DIR/summary.yaml" >&2
    exit 1
fi

# Extract baseline stats
BASELINE_MEAN=$(yq -r '.statistics.mean' "$BASELINE_DIR/summary.yaml")
BASELINE_STD=$(yq -r '.statistics.std_dev' "$BASELINE_DIR/summary.yaml")
BASELINE_N=$(yq -r '.statistics.n' "$BASELINE_DIR/summary.yaml")

# Get version and timestamp
VERSION=$(cat "$PROJECT_DIR/package.json" | jq -r '.version // "unknown"')
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Role title mapping
case "$ROLE" in
    dev) ROLE_TITLE="Developer" ;;
    reviewer) ROLE_TITLE="Reviewer" ;;
    tea) ROLE_TITLE="Test Engineer" ;;
    sm) ROLE_TITLE="Scrum Master" ;;
    architect) ROLE_TITLE="Architect" ;;
    *) ROLE_TITLE="$ROLE" ;;
esac

# Scenario title (convert kebab-case to Title Case)
SCENARIO_TITLE=$(echo "$SCENARIO" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')

# Get difficulty from scenario file
SCENARIO_FILE=$(find "$PROJECT_DIR/scenarios" -name "${SCENARIO}.yaml" 2>/dev/null | head -1)
if [[ -f "$SCENARIO_FILE" ]]; then
    DIFFICULTY=$(yq -r '.difficulty // "medium"' "$SCENARIO_FILE")
    DESCRIPTION=$(yq -r '.description // "Scenario benchmark"' "$SCENARIO_FILE")
else
    DIFFICULTY="medium"
    DESCRIPTION="Scenario benchmark"
fi

# Collect all theme data
TMPFILE=$(mktemp)
trap "rm -f $TMPFILE" EXIT

# Match both standard (*-ROLE/) and cross-role (*-as-ROLE/) directories
for dir in "$BENCHMARK_DIR"/*-"$ROLE"/ "$BENCHMARK_DIR"/*-as-"$ROLE"/; do
    if [[ -f "$dir/summary.yaml" ]]; then
        THEME=$(yq -r '.agent.theme' "$dir/summary.yaml")
        CHARACTER=$(yq -r '.agent.character // ""' "$dir/summary.yaml")
        MEAN=$(yq -r '.statistics.mean' "$dir/summary.yaml")
        STD=$(yq -r '.statistics.std_dev' "$dir/summary.yaml")
        N=$(yq -r '.statistics.n' "$dir/summary.yaml")

        # Cross-role metadata
        CROSS_ROLE=$(yq -r '.agent.cross_role // false' "$dir/summary.yaml")
        SOURCE_ROLE=$(yq -r '.agent.source_role // ""' "$dir/summary.yaml")
        EFFECTIVE_ROLE=$(yq -r '.agent.effective_role // .agent.role // ""' "$dir/summary.yaml")

        # Calculate delta
        DELTA=$(echo "$MEAN - $BASELINE_MEAN" | bc -l)

        # Calculate Cohen's d using pooled std
        # d = (M1 - M2) / sqrt(((n1-1)*s1² + (n2-1)*s2²) / (n1+n2-2))
        COHENS_D=$(echo "scale=2; ($MEAN - $BASELINE_MEAN) / sqrt((($N - 1) * $STD * $STD + ($BASELINE_N - 1) * $BASELINE_STD * $BASELINE_STD) / ($N + $BASELINE_N - 2))" | bc -l 2>/dev/null || echo "0")

        # Handle missing character - try to get from theme file
        if [[ -z "$CHARACTER" || "$CHARACTER" == "null" ]]; then
            THEME_FILE="$PROJECT_DIR/pennyfarthing-dist/personas/themes/${THEME}.yaml"
            if [[ -f "$THEME_FILE" ]]; then
                # For cross-role, look up by source_role if available
                LOOKUP_ROLE="${SOURCE_ROLE:-$ROLE}"
                CHARACTER=$(yq -r ".agents.${LOOKUP_ROLE}.character // \"Unknown\"" "$THEME_FILE")
            else
                CHARACTER="Unknown"
            fi
        fi

        # Add cross-role indicator to character name for display
        if [[ "$CROSS_ROLE" == "true" ]]; then
            CHARACTER="${CHARACTER} (as ${EFFECTIVE_ROLE})"
        fi

        echo "$MEAN|$THEME|$CHARACTER|$STD|$N|$DELTA|$COHENS_D|$CROSS_ROLE|$SOURCE_ROLE" >> "$TMPFILE"
    fi
done

# Sort by mean descending
SORTED=$(sort -t'|' -k1 -rn "$TMPFILE")

# Count stats
TOTAL_THEMES=$(echo "$SORTED" | wc -l | tr -d ' ')
THEMES_ABOVE=$(echo "$SORTED" | awk -F'|' -v base="$BASELINE_MEAN" '$1 > base' | wc -l | tr -d ' ')
THEMES_NEAR=$(echo "$SORTED" | awk -F'|' -v base="$BASELINE_MEAN" '$1 >= base-1 && $1 <= base+1' | wc -l | tr -d ' ')
TOTAL_RUNS=$(echo "$SORTED" | awk -F'|' '{sum+=$5} END {print sum}')

# Generate markdown
cat > "$OUTPUT_FILE" << HEADER
# $SCENARIO_TITLE - $ROLE_TITLE Leaderboard

**Scenario:** \`$SCENARIO\` ($DIFFICULTY difficulty)
**Role:** $ROLE_TITLE (\`$ROLE\`)
**Baseline:** Control agent, mean $BASELINE_MEAN, std_dev $BASELINE_STD, n=$BASELINE_N
**Pennyfarthing Version:** $VERSION
**Generated:** $TIMESTAMP

**Analysis:** [OCEAN Personality Correlation Analysis](./OCEAN-ANALYSIS.md)

---

## Cohen's d Interpretation

| Effect Size | Cohen's d |
|-------------|-----------|
| Negligible | |d| < 0.20 |
| Small | |d| = 0.20 |
| Medium | |d| = 0.50 |
| Large | |d| = 0.80 |
| Very Large | |d| > 1.20 |

---

## Rankings

| Rank | Theme | Character | Mean | Std Dev | n | Delta | Cohen's d |
|------|-------|-----------|------|---------|---|-------|-----------|
HEADER

# Generate ranking rows
RANK=0
PREV_MEAN=""
CONTROL_INSERTED=false

echo "$SORTED" | while IFS='|' read MEAN THEME CHARACTER STD N DELTA COHENS_D; do
    # Check if we need to insert control row
    if [[ "$CONTROL_INSERTED" != "true" ]]; then
        DELTA_NUM=$(echo "$DELTA" | tr -d ' ')
        if (( $(echo "$DELTA_NUM < 0" | bc -l) )); then
            echo "| --- | **CONTROL** | **Baseline** | **$BASELINE_MEAN** | **$BASELINE_STD** | **$BASELINE_N** | **0.00** | **0.00** |"
            CONTROL_INSERTED=true
        fi
    fi

    # Increment rank (handle ties)
    if [[ "$MEAN" != "$PREV_MEAN" ]]; then
        ((RANK++))
    fi
    PREV_MEAN="$MEAN"

    # Format delta with sign
    DELTA_FMT=$(printf "%+.2f" "$DELTA")
    COHENS_FMT=$(printf "%+.2f" "$COHENS_D")

    echo "| $RANK | $THEME | $CHARACTER | $MEAN | $STD | $N | $DELTA_FMT | $COHENS_FMT |"
done >> "$OUTPUT_FILE"

# Add summary section
cat >> "$OUTPUT_FILE" << SUMMARY

---

## Summary Statistics

- **Total Themes:** $TOTAL_THEMES
- **Themes Beating Baseline:** $THEMES_ABOVE
- **Themes At/Near Baseline (within 1 point):** $THEMES_NEAR
- **Total Benchmark Runs:** $TOTAL_RUNS

## Top Performers (Above Baseline)

| Theme | Character | Mean | Delta | Cohen's d |
|-------|-----------|------|-------|-----------|
SUMMARY

# Top 5 by Cohen's d
echo "$SORTED" | sort -t'|' -k7 -rn | head -5 | while IFS='|' read MEAN THEME CHARACTER STD N DELTA COHENS_D; do
    DELTA_FMT=$(printf "%+.2f" "$DELTA")
    COHENS_FMT=$(printf "%+.2f" "$COHENS_D")
    echo "| $THEME | $CHARACTER | $MEAN | $DELTA_FMT | $COHENS_FMT |"
done >> "$OUTPUT_FILE"

cat >> "$OUTPUT_FILE" << BOTTOM

## Bottom Performers

| Theme | Character | Mean | Delta | Cohen's d |
|-------|-----------|------|-------|-----------|
BOTTOM

# Bottom 5 by Cohen's d
echo "$SORTED" | sort -t'|' -k7 -n | head -5 | while IFS='|' read MEAN THEME CHARACTER STD N DELTA COHENS_D; do
    DELTA_FMT=$(printf "%+.2f" "$DELTA")
    COHENS_FMT=$(printf "%+.2f" "$COHENS_D")
    echo "| $THEME | $CHARACTER | $MEAN | $DELTA_FMT | $COHENS_FMT |"
done >> "$OUTPUT_FILE"

cat >> "$OUTPUT_FILE" << NOTES

---

## Notes

- Cohen's d uses pooled standard deviation: \`d = (M1 - M2) / sqrt(((n1-1)*s1² + (n2-1)*s2²) / (n1+n2-2))\`
- Positive d indicates theme outperforms baseline; negative indicates underperformance
- Model and token usage tracked per-run in individual result files
- Cross-role entries (e.g., "Prospero (as dev)") run a character from one role on another role's task
- Cross-role results compare against the effective role's baseline
- $DESCRIPTION
NOTES

echo "Generated: $OUTPUT_FILE"
echo "Total themes: $TOTAL_THEMES"
echo "Themes above baseline: $THEMES_ABOVE"
