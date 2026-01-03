#!/bin/bash
# Parallel Benchmark Runner
# Runs multiple themes in parallel with staggered starts to avoid rate limiting
# Usage: ./scripts/parallel-benchmark.sh <scenario> <theme1:agent> <theme2:agent> ... [--stagger N]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOLO_RUNNER="$SCRIPT_DIR/solo-runner.sh"

if [[ ! -x "$SOLO_RUNNER" ]]; then
    echo "Error: solo-runner.sh not found or not executable" >&2
    exit 1
fi

# Parse arguments
SCENARIO=""
STAGGER=3  # Default 3 second stagger
SPECS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --stagger)
            STAGGER="$2"
            shift 2
            ;;
        --scenario)
            SCENARIO="$2"
            shift 2
            ;;
        *)
            if [[ -z "$SCENARIO" ]]; then
                SCENARIO="$1"
            else
                SPECS+=("$1")
            fi
            shift
            ;;
    esac
done

if [[ -z "$SCENARIO" || ${#SPECS[@]} -eq 0 ]]; then
    echo "Usage: $0 <scenario> <theme:agent> [theme:agent ...] [--stagger N]" >&2
    echo "" >&2
    echo "Examples:" >&2
    echo "  $0 race-condition-cache breaking-bad:dev firefly:dev the-wire:dev" >&2
    echo "  $0 security-review discworld:reviewer west-wing:reviewer --stagger 5" >&2
    exit 1
fi

# Create output directory
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_BASE="/tmp/parallel-benchmark-${SCENARIO}-${TIMESTAMP}"
mkdir -p "$OUTPUT_BASE"

echo "=== Parallel Benchmark ==="
echo "Scenario: $SCENARIO"
echo "Contestants: ${SPECS[*]}"
echo "Stagger: ${STAGGER}s"
echo "Output: $OUTPUT_BASE"
echo ""

# Launch all runs with staggered starts
PIDS=()
for spec in "${SPECS[@]}"; do
    theme="${spec%%:*}"
    mkdir -p "$OUTPUT_BASE/$theme"

    echo "Starting: $spec"
    "$SOLO_RUNNER" "$spec" "$SCENARIO" "$OUTPUT_BASE/$theme" > "$OUTPUT_BASE/$theme/stdout.txt" 2>&1 &
    PIDS+=($!)

    # Stagger next start
    if [[ ${#PIDS[@]} -lt ${#SPECS[@]} ]]; then
        sleep "$STAGGER"
    fi
done

echo ""
echo "Waiting for ${#PIDS[@]} runs to complete..."

# Wait for all processes
FAILED=0
for i in "${!PIDS[@]}"; do
    pid="${PIDS[$i]}"
    spec="${SPECS[$i]}"
    if wait "$pid"; then
        echo "  [OK] $spec"
    else
        echo "  [FAIL] $spec"
        FAILED=$((FAILED + 1))
    fi
done

echo ""
echo "=== Results ==="

# Collect and display results
RESULTS=()
for spec in "${SPECS[@]}"; do
    theme="${spec%%:*}"
    result_file="$OUTPUT_BASE/$theme/stdout.txt"

    if [[ -f "$result_file" ]]; then
        # Extract score from the JSON output
        score=$(grep -o '"score": [0-9.]*' "$result_file" | head -1 | grep -o '[0-9.]*' || echo "N/A")
        character=$(grep -o '"character": "[^"]*"' "$result_file" | head -1 | sed 's/"character": "\([^"]*\)"/\1/' || echo "Unknown")

        if [[ "$score" != "N/A" ]]; then
            printf "%-30s %-25s %s\n" "$spec" "$character" "$score"
            RESULTS+=("$spec:$score")
        else
            printf "%-30s %-25s %s\n" "$spec" "$character" "FAILED"
            # Show error
            tail -5 "$result_file" 2>/dev/null
        fi
    else
        printf "%-30s %-25s %s\n" "$spec" "Unknown" "NO OUTPUT"
    fi
done

echo ""
echo "=== Summary ==="
echo "Total: ${#SPECS[@]}"
echo "Succeeded: $((${#SPECS[@]} - FAILED))"
echo "Failed: $FAILED"
echo "Output: $OUTPUT_BASE"

# Calculate mean if we have results
if [[ ${#RESULTS[@]} -gt 0 ]]; then
    total=0
    count=0
    for result in "${RESULTS[@]}"; do
        score="${result##*:}"
        total=$(echo "$total + $score" | bc)
        count=$((count + 1))
    done
    mean=$(echo "scale=2; $total / $count" | bc)
    echo "Mean Score: $mean"
fi
