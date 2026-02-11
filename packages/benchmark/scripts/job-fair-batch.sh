#!/bin/bash
# Job Fair Batch Runner
# Runs all characters in a theme against all role scenarios
# Usage: ./scripts/job-fair-batch.sh <theme> [runs_per_combo]

set -e

THEME="$1"
RUNS="${2:-4}"

if [[ -z "$THEME" ]]; then
    echo "Usage: $0 <theme> [runs_per_combo]" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PERSONA_FILE="$PROJECT_DIR/pennyfarthing-dist/personas/themes/${THEME}.yaml"

if [[ ! -f "$PERSONA_FILE" ]]; then
    echo "Error: Theme not found: $THEME" >&2
    exit 1
fi

# Output directory
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_DIR="$PROJECT_DIR/internal/results/job-fair/${THEME}-${TIMESTAMP}"
mkdir -p "$OUTPUT_DIR"

echo "=== Job Fair: $THEME ===" | tee "$OUTPUT_DIR/log.txt"
echo "Runs per combo: $RUNS" | tee -a "$OUTPUT_DIR/log.txt"
echo "Output: $OUTPUT_DIR" | tee -a "$OUTPUT_DIR/log.txt"

# Role -> Scenario mapping function (macOS bash 3.x compatible)
get_scenario_for_role() {
    case "$1" in
        dev) echo "astropy-12907" ;;
        reviewer) echo "astropy-12907" ;;
        tea) echo "checkout-component-tests" ;;
        sm) echo "dependency-deadlock" ;;
        architect) echo "database-selection" ;;
        *) echo "" ;;
    esac
}

# Get all characters from theme
CHARACTERS=$(yq -r '.agents | to_entries[] | "\(.key):\(.value.character)"' "$PERSONA_FILE")

# Initialize results file
echo "theme: $THEME" > "$OUTPUT_DIR/summary.yaml"
echo "timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$OUTPUT_DIR/summary.yaml"
echo "runs_per_combo: $RUNS" >> "$OUTPUT_DIR/summary.yaml"
echo "results:" >> "$OUTPUT_DIR/summary.yaml"

TOTAL_RUNS=0
TOTAL_COST=0

# For each target role
for TARGET_ROLE in dev reviewer tea sm architect; do
    SCENARIO=$(get_scenario_for_role "$TARGET_ROLE")
    echo "" | tee -a "$OUTPUT_DIR/log.txt"
    echo "--- Testing as $TARGET_ROLE (scenario: $SCENARIO) ---" | tee -a "$OUTPUT_DIR/log.txt"

    # For each character
    while IFS=: read -r SOURCE_ROLE CHARACTER; do
        echo "  $CHARACTER ($SOURCE_ROLE -> $TARGET_ROLE)" | tee -a "$OUTPUT_DIR/log.txt"

        CHAR_SLUG=$(echo "$CHARACTER" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g')
        COMBO_DIR="$OUTPUT_DIR/${TARGET_ROLE}/${CHAR_SLUG}"
        mkdir -p "$COMBO_DIR"

        SCORES=""
        for RUN in $(seq 1 $RUNS); do
            echo -n "    Run $RUN/$RUNS... " | tee -a "$OUTPUT_DIR/log.txt"

            # Run solo benchmark with cross-role
            RESULT=$("$SCRIPT_DIR/solo-runner.sh" "${THEME}:${CHARACTER}" "$SCENARIO" "$COMBO_DIR" --as "$TARGET_ROLE" 2>&1) || {
                echo "FAILED" | tee -a "$OUTPUT_DIR/log.txt"
                echo "$RESULT" >> "$OUTPUT_DIR/log.txt"
                continue
            }

            SCORE=$(echo "$RESULT" | jq -r '.score // 0')
            COST=$(echo "$RESULT" | jq -r '.total_cost_usd // 0')

            echo "score=$SCORE cost=\$$COST" | tee -a "$OUTPUT_DIR/log.txt"

            SCORES="$SCORES $SCORE"
            TOTAL_COST=$(echo "$TOTAL_COST + $COST" | bc)
            ((TOTAL_RUNS++))
        done

        # Calculate mean for this combo
        if [[ -n "$SCORES" ]]; then
            MEAN=$(echo "$SCORES" | tr ' ' '\n' | grep -v '^$' | awk '{sum+=$1; n++} END {if(n>0) printf "%.2f", sum/n; else print 0}')
            echo "  - character: \"$CHARACTER\"" >> "$OUTPUT_DIR/summary.yaml"
            echo "    source_role: $SOURCE_ROLE" >> "$OUTPUT_DIR/summary.yaml"
            echo "    target_role: $TARGET_ROLE" >> "$OUTPUT_DIR/summary.yaml"
            echo "    mean: $MEAN" >> "$OUTPUT_DIR/summary.yaml"
            echo "    scores: [$SCORES ]" >> "$OUTPUT_DIR/summary.yaml"
        fi

    done <<< "$CHARACTERS"
done

echo "" | tee -a "$OUTPUT_DIR/log.txt"
echo "=== Complete ===" | tee -a "$OUTPUT_DIR/log.txt"
echo "Total runs: $TOTAL_RUNS" | tee -a "$OUTPUT_DIR/log.txt"
echo "Total cost: \$$TOTAL_COST" | tee -a "$OUTPUT_DIR/log.txt"
echo "Results: $OUTPUT_DIR/summary.yaml" | tee -a "$OUTPUT_DIR/log.txt"

# Add totals to summary
echo "total_runs: $TOTAL_RUNS" >> "$OUTPUT_DIR/summary.yaml"
echo "total_cost_usd: $TOTAL_COST" >> "$OUTPUT_DIR/summary.yaml"

echo "$OUTPUT_DIR"
