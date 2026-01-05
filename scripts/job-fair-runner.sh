#!/usr/bin/env bash
# Job Fair Runner
# Runs all characters from a theme against all roles with baselines
# Usage: ./scripts/job-fair-runner.sh <theme> [--runs N]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SOLO_RUNNER="$SCRIPT_DIR/solo-runner.sh"

THEME="$1"
RUNS=2  # Default runs per combo

# Parse --runs flag
if [[ "$2" == "--runs" && -n "$3" ]]; then
    RUNS="$3"
fi

if [[ -z "$THEME" ]]; then
    echo "Usage: $0 <theme> [--runs N]" >&2
    exit 1
fi

THEME_FILE="$PROJECT_DIR/pennyfarthing-dist/personas/themes/${THEME}.yaml"
if [[ ! -f "$THEME_FILE" ]]; then
    echo "Error: Theme not found: $THEME_FILE" >&2
    exit 1
fi

# Define role -> scenario mappings
get_scenario() {
    case "$1" in
        dev) echo "race-condition-cache" ;;
        reviewer) echo "order-service" ;;
        tea) echo "payment-processor-tests" ;;
        sm) echo "sprint-planning-conflict" ;;
    esac
}

get_baseline() {
    case "$1" in
        dev) echo "75.2" ;;
        reviewer) echo "78.5" ;;
        tea) echo "72.1" ;;
        sm) echo "80.3" ;;
    esac
}

# Create output directory
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUTPUT_DIR="$PROJECT_DIR/internal/results/job-fair/${THEME}-${TIMESTAMP}"
mkdir -p "$OUTPUT_DIR"

echo "=== Job Fair: $THEME ==="
echo "Output: $OUTPUT_DIR"
echo "Runs per combo: $RUNS"
echo ""

# Get main characters (the 5 core roles)
MAIN_CHARS_FILE=$(mktemp)
yq -r '.agents | to_entries[] | select(.key | test("^(orchestrator|sm|tea|dev|reviewer)$")) | "\(.key):\(.value.character)"' "$THEME_FILE" > "$MAIN_CHARS_FILE"

echo "### Characters"
while IFS=: read -r role char; do
    echo "  - $role: $char"
done < "$MAIN_CHARS_FILE"
echo ""

# Touch raw results file
touch "$OUTPUT_DIR/raw_results.txt"

# Run each role
for ROLE in dev reviewer tea sm; do
    SCENARIO=$(get_scenario "$ROLE")
    BASELINE=$(get_baseline "$ROLE")

    echo "### Testing: $ROLE (scenario: $SCENARIO, baseline: $BASELINE)"

    # Run each character for this role
    while IFS=: read -r source_role char; do
        # Determine spec based on whether this is native or cross-role
        if [[ "$source_role" == "$ROLE" ]]; then
            # Native role - direct run
            SPEC="$THEME:$ROLE"
            CROSS=""
        else
            # Cross-role - extract first name or simple identifier
            # Use first word of character name for lookup
            FIRST_NAME=$(echo "$char" | awk '{print $1}')
            SPEC="$THEME:$FIRST_NAME"
            CROSS="--as $ROLE"
        fi

        CHAR_SLUG=$(echo "$char" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g')
        RUN_DIR="$OUTPUT_DIR/runs/$ROLE/$CHAR_SLUG"
        mkdir -p "$RUN_DIR"

        SUM=0
        COUNT=0
        for i in $(seq 1 $RUNS); do
            echo -n "  $char ($source_role) -> $ROLE [$i/$RUNS]: "

            if [[ -n "$CROSS" ]]; then
                RESULT=$("$SOLO_RUNNER" "$SPEC" "$SCENARIO" "$RUN_DIR" $CROSS 2>/dev/null || echo '{"success":false,"score":0}')
            else
                RESULT=$("$SOLO_RUNNER" "$SPEC" "$SCENARIO" "$RUN_DIR" 2>/dev/null || echo '{"success":false,"score":0}')
            fi

            SCORE=$(echo "$RESULT" | jq -r '.score // 0')
            echo "$SCORE"

            # Save individual result
            echo "$RESULT" > "$RUN_DIR/run_$i.json"

            # Accumulate scores
            SUM=$(echo "$SUM + $SCORE" | bc)
            COUNT=$((COUNT + 1))

            # Brief pause between runs
            sleep 1
        done

        # Calculate mean for this character-role combo
        if [[ $COUNT -gt 0 ]]; then
            MEAN=$(echo "scale=2; $SUM / $COUNT" | bc)
            echo "  -> Mean: $MEAN"

            # Store in results file
            echo "$source_role:$char:$ROLE:$MEAN:$COUNT" >> "$OUTPUT_DIR/raw_results.txt"
        fi
    done < "$MAIN_CHARS_FILE"

    echo ""
done

# Clean up temp file
rm -f "$MAIN_CHARS_FILE"

# Generate summary
echo "### Generating summary..."

cat > "$OUTPUT_DIR/summary.yaml" << EOF
theme: $THEME
timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)
runs_per_combo: $RUNS
mode: full

scenarios:
  dev: $(get_scenario dev)
  reviewer: $(get_scenario reviewer)
  tea: $(get_scenario tea)
  sm: $(get_scenario sm)

baselines:
  dev: {mean: $(get_baseline dev), std: 2.1, n: 10}
  reviewer: {mean: $(get_baseline reviewer), std: 1.8, n: 10}
  tea: {mean: $(get_baseline tea), std: 2.3, n: 10}
  sm: {mean: $(get_baseline sm), std: 1.9, n: 10}
EOF

# Parse raw results and add to summary
if [[ -s "$OUTPUT_DIR/raw_results.txt" ]]; then
    echo "" >> "$OUTPUT_DIR/summary.yaml"
    echo "matrix:" >> "$OUTPUT_DIR/summary.yaml"

    # Group by source role
    CURRENT_CHAR=""
    while IFS=: read -r src_role char role mean n; do
        CHAR_KEY=$(echo "$char" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/_/g')
        if [[ "$CHAR_KEY" != "$CURRENT_CHAR" ]]; then
            if [[ -n "$CURRENT_CHAR" ]]; then
                echo "" >> "$OUTPUT_DIR/summary.yaml"
            fi
            echo "  $CHAR_KEY:" >> "$OUTPUT_DIR/summary.yaml"
            CURRENT_CHAR="$CHAR_KEY"
        fi
        echo "    $role: {mean: $mean, n: $n}" >> "$OUTPUT_DIR/summary.yaml"
    done < "$OUTPUT_DIR/raw_results.txt"
fi

echo ""
echo "=== Job Fair Complete ==="
echo "Results: $OUTPUT_DIR/summary.yaml"
