#!/bin/bash
# test_architect_scenario_selection.sh - Tests for architect scenario selection (Story 7-2)
# Validates that the chosen architect scenario properly tests competence
#
# TEA Notes (Jinx): The scenario must discriminate between good and mediocre architects.
# A scenario where everyone scores 85-90 tells us NOTHING!

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
SCENARIOS_DIR="$PROJECT_DIR/scenarios/architecture"
BASELINES_DIR="$PROJECT_DIR/internal/results/baselines"

echo "=== Architect Scenario Selection Tests ==="
echo "Testing that chosen scenario properly measures architect competence"
echo ""

PASS=0
FAIL=0

assert_true() {
    local condition="$1"
    local test_name="$2"

    if eval "$condition"; then
        echo "PASS: $test_name"
        ((PASS++))
    else
        echo "FAIL: $test_name"
        ((FAIL++))
    fi
}

assert_file_exists() {
    local file="$1"
    local test_name="$2"

    if [[ -f "$file" ]]; then
        echo "PASS: $test_name"
        ((PASS++))
    else
        echo "FAIL: $test_name - File not found: $file"
        ((FAIL++))
    fi
}

assert_gt() {
    local actual="$1"
    local threshold="$2"
    local test_name="$3"

    if (( $(echo "$actual > $threshold" | bc -l) )); then
        echo "PASS: $test_name ($actual > $threshold)"
        ((PASS++))
    else
        echo "FAIL: $test_name - Expected $actual > $threshold"
        ((FAIL++))
    fi
}

assert_lt() {
    local actual="$1"
    local threshold="$2"
    local test_name="$3"

    if (( $(echo "$actual < $threshold" | bc -l) )); then
        echo "PASS: $test_name ($actual < $threshold)"
        ((PASS++))
    else
        echo "FAIL: $test_name - Expected $actual < $threshold"
        ((FAIL++))
    fi
}

# =============================================================================
# Test 1: Architect scenarios exist
# =============================================================================
echo "--- Test Group 1: Scenario Availability ---"

assert_file_exists "$SCENARIOS_DIR/database-selection.yaml" "database-selection.yaml exists"
assert_file_exists "$SCENARIOS_DIR/legacy-modernization.yaml" "legacy-modernization.yaml exists"
assert_file_exists "$SCENARIOS_DIR/scaling-decision.yaml" "scaling-decision.yaml exists"

# =============================================================================
# Test 2: Scenarios have required structure
# =============================================================================
echo ""
echo "--- Test Group 2: Scenario Structure ---"

for scenario in database-selection legacy-modernization scaling-decision; do
    scenario_file="$SCENARIOS_DIR/$scenario.yaml"

    # Check for required fields (yq v4 syntax)
    has_name=$(yq '.name' "$scenario_file" 2>/dev/null)
    has_category=$(yq '.category' "$scenario_file" 2>/dev/null)
    has_prompt=$(yq '.prompt' "$scenario_file" 2>/dev/null)
    has_scoring=$(yq '.scoring' "$scenario_file" 2>/dev/null)

    assert_true '[[ -n "$has_name" && "$has_name" != "null" ]]' "$scenario has 'name' field"
    assert_true '[[ -n "$has_category" && "$has_category" != "null" ]]' "$scenario has 'category' field"
    assert_true '[[ -n "$has_prompt" && "$has_prompt" != "null" ]]' "$scenario has 'prompt' field"
    assert_true '[[ -n "$has_scoring" && "$has_scoring" != "null" ]]' "$scenario has 'scoring' field"
done

# =============================================================================
# Test 3: At least one scenario has baseline
# =============================================================================
echo ""
echo "--- Test Group 3: Baseline Availability ---"

architect_baseline_exists=false
for scenario in database-selection legacy-modernization scaling-decision; do
    baseline_dir="$BASELINES_DIR/$scenario/architect"
    if [[ -d "$baseline_dir" ]]; then
        architect_baseline_exists=true
        echo "Found architect baseline: $baseline_dir"

        # Check baseline has minimum runs
        summary_file="$baseline_dir/summary.yaml"
        if [[ -f "$summary_file" ]]; then
            n=$(yq '.statistics.n' "$summary_file" 2>/dev/null)
            [[ "$n" == "null" ]] && n=0
            assert_gt "$n" "9" "Baseline has 10+ runs (n=$n)"
        fi
    fi
done

assert_true '$architect_baseline_exists' "At least one architect baseline exists"

# =============================================================================
# Test 4: Baseline quality check (score variance)
# =============================================================================
echo ""
echo "--- Test Group 4: Baseline Quality ---"

# A good benchmark scenario should show variance in scores
# If std_dev is too low (< 2.0), everyone scores the same = low signal
# If std_dev is too high (> 15), scenario is inconsistent

for scenario in database-selection legacy-modernization; do
    baseline_summary="$BASELINES_DIR/$scenario/architect/summary.yaml"
    if [[ -f "$baseline_summary" ]]; then
        std_dev=$(yq '.statistics.std_dev' "$baseline_summary" 2>/dev/null)
        mean=$(yq '.statistics.mean' "$baseline_summary" 2>/dev/null)
        [[ "$std_dev" == "null" ]] && std_dev=0
        [[ "$mean" == "null" ]] && mean=0

        echo "Scenario: $scenario (mean=$mean, std_dev=$std_dev)"

        # Std dev should be > 1.5 for meaningful differentiation
        assert_gt "$std_dev" "1.5" "$scenario has meaningful variance (std_dev > 1.5)"

        # Std dev should be < 15 for consistency
        assert_lt "$std_dev" "15" "$scenario is consistent (std_dev < 15)"

        # Mean should be reasonable (not too easy, not too hard)
        assert_gt "$mean" "50" "$scenario is not too hard (mean > 50)"
        assert_lt "$mean" "95" "$scenario is not too easy (mean < 95)"
    fi
done

# =============================================================================
# Test 5: Scenario selection criteria documentation
# =============================================================================
echo ""
echo "--- Test Group 5: Selection Criteria ---"

# Check that scenarios have difficulty ratings
for scenario in database-selection legacy-modernization scaling-decision; do
    scenario_file="$SCENARIOS_DIR/$scenario.yaml"
    difficulty=$(yq '.difficulty' "$scenario_file" 2>/dev/null)
    assert_true '[[ -n "$difficulty" && "$difficulty" != "null" ]]' "$scenario has difficulty rating"
done

# =============================================================================
# Results
# =============================================================================
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [[ $FAIL -gt 0 ]]; then
    echo ""
    echo "⚠️  Some tests failed. Review architect scenario selection."
    exit 1
fi

echo ""
echo "✓ All Architect Scenario Selection Tests PASSED 💥"
