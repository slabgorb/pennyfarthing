#!/usr/bin/env bash
# Job Fair Runner
# Runs all characters from a theme against all roles with baselines
# Usage: ./scripts/job-fair-runner.sh <theme> [--runs N]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SOLO_RUNNER="$SCRIPT_DIR/solo-runner.sh"

THEME="$1"
RUNS=2  # Default runs per combo
REQUESTED_ROLES=""  # Empty = all roles

# Parse flags
if [[ $# -gt 0 ]]; then
    shift  # Remove theme from args
fi
while [[ $# -gt 0 ]]; do
    case "$1" in
        --runs)
            RUNS="$2"
            shift 2
            ;;
        --roles)
            REQUESTED_ROLES="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

if [[ -z "$THEME" ]]; then
    echo "Usage: $0 <theme> [--runs N] [--roles role1,role2,...]" >&2
    echo "  --runs N     Number of runs per combination (default: 2)"
    echo "  --roles      Comma-separated roles to test (default: all)"
    echo "               Available: dev,reviewer,tea,sm,architect"
    echo "               Note: 'dev' expands to dev-codegen,dev-debug"
    exit 1
fi

THEME_FILE="$PROJECT_DIR/pennyfarthing-dist/personas/themes/${THEME}.yaml"
if [[ ! -f "$THEME_FILE" ]]; then
    echo "Error: Theme not found: $THEME_FILE" >&2
    exit 1
fi

# Define role -> scenario mappings
# DEV is special: has TWO sub-competencies (codegen + debug)
get_scenario() {
    case "$1" in
        dev-codegen) echo "tdd-shopping-cart" ;;
        dev-debug) echo "astropy-12907" ;;
        dev) echo "tdd-shopping-cart" ;;  # Legacy fallback
        reviewer) echo "order-service" ;;
        tea) echo "payment-processor-tests" ;;
        sm) echo "sprint-planning-conflict" ;;
        architect) echo "legacy-modernization" ;;
    esac
}

get_baseline() {
    case "$1" in
        dev-codegen) echo "85.8" ;;
        dev-debug) echo "77.5" ;;
        dev) echo "85.8" ;;  # Legacy fallback
        reviewer) echo "78.5" ;;
        tea) echo "72.1" ;;
        sm) echo "80.3" ;;
        architect) echo "87.2" ;;
    esac
}

# Dev has dual testing - returns space-separated list
get_dev_sub_roles() {
    echo "dev-codegen dev-debug"
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

# Build role list - dev expands to dev-codegen and dev-debug
# If --roles specified, only test those roles
if [[ -n "$REQUESTED_ROLES" ]]; then
    # Parse comma-separated roles
    BASE_ROLES=$(echo "$REQUESTED_ROLES" | tr ',' ' ')
else
    BASE_ROLES="dev reviewer tea sm architect"
fi

ROLES_TO_TEST=""
for BASE_ROLE in $BASE_ROLES; do
    if [[ "$BASE_ROLE" == "dev" ]]; then
        # Dev has dual sub-competencies
        ROLES_TO_TEST="$ROLES_TO_TEST dev-codegen dev-debug"
    elif [[ "$BASE_ROLE" == "dev-codegen" || "$BASE_ROLE" == "dev-debug" ]]; then
        # Allow specifying individual dev sub-competencies
        ROLES_TO_TEST="$ROLES_TO_TEST $BASE_ROLE"
    else
        ROLES_TO_TEST="$ROLES_TO_TEST $BASE_ROLE"
    fi
done

echo "Roles to test: $ROLES_TO_TEST"

# Run each role (dev-codegen and dev-debug tested separately)
for ROLE in $ROLES_TO_TEST; do
    SCENARIO=$(get_scenario "$ROLE")
    BASELINE=$(get_baseline "$ROLE")

    # For dev sub-roles, use 'dev' as the actual agent role
    if [[ "$ROLE" == "dev-codegen" || "$ROLE" == "dev-debug" ]]; then
        AGENT_ROLE="dev"
    else
        AGENT_ROLE="$ROLE"
    fi

    echo "### Testing: $ROLE (scenario: $SCENARIO, baseline: $BASELINE)"

    # Run each character for this role
    while IFS=: read -r source_role char; do
        # Determine spec based on whether this is native or cross-role
        # Use AGENT_ROLE for comparison (dev for both dev-codegen and dev-debug)
        if [[ "$source_role" == "$AGENT_ROLE" ]]; then
            # Native role - direct run
            SPEC="$THEME:$AGENT_ROLE"
            CROSS=""
        else
            # Cross-role - extract first name or simple identifier
            # Use first word of character name for lookup
            FIRST_NAME=$(echo "$char" | awk '{print $1}')
            SPEC="$THEME:$FIRST_NAME"
            CROSS="--as $AGENT_ROLE"
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

# Dev has dual sub-competency testing (only role with 2 scenarios)
scenarios:
  dev-codegen: $(get_scenario dev-codegen)
  dev-debug: $(get_scenario dev-debug)
  reviewer: $(get_scenario reviewer)
  tea: $(get_scenario tea)
  sm: $(get_scenario sm)
  architect: $(get_scenario architect)

baselines:
  dev-codegen: {mean: $(get_baseline dev-codegen), std: 7.30, n: 10}
  dev-debug: {mean: $(get_baseline dev-debug), std: 8.54, n: 10}
  reviewer: {mean: $(get_baseline reviewer), std: 1.8, n: 10}
  tea: {mean: $(get_baseline tea), std: 2.3, n: 10}
  sm: {mean: $(get_baseline sm), std: 1.9, n: 10}
  architect: {mean: $(get_baseline architect), std: 3.25, n: 10}
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

# Update manifest
MANIFEST_FILE="$PROJECT_DIR/internal/results/job-fair/manifest.yaml"
if [[ -f "$MANIFEST_FILE" ]]; then
    echo ""
    echo "### Updating manifest..."

    # Check if theme already in manifest
    if grep -q "theme: $THEME$" "$MANIFEST_FILE"; then
        echo "Theme '$THEME' already in manifest"
    else
        # Append new entry before the "# Themes not yet run" comment
        ENTRY="  - theme: $THEME
    timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)
    has_raw_data: true
    runs_per_combo: $RUNS

"
        # Insert before the comment line
        sed -i.bak "/^# Themes not yet run/i\\
$ENTRY" "$MANIFEST_FILE" && rm -f "${MANIFEST_FILE}.bak"
        echo "Added '$THEME' to manifest"
    fi
fi
