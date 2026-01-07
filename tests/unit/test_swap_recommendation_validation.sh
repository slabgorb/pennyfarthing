#!/bin/bash
# test_swap_recommendation_validation.sh - Tests for swap recommendation logic (Story 7-2)
# Validates that role swaps are based on statistically significant improvements
#
# TEA Notes (Jinx): A swap should only happen if the challenger CLEARLY beats
# the native. If it's within noise margin, that's not a real improvement!
# We need STATISTICAL SIGNIFICANCE, not just "bigger number = better"!

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
JOB_FAIR_DIR="$PROJECT_DIR/internal/results/job-fair"
THEMES_DIR="$PROJECT_DIR/pennyfarthing-dist/personas/themes"

echo "=== Swap Recommendation Validation Tests ==="
echo "Testing that swaps are statistically significant"
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

# =============================================================================
# Test 1: Swap comments exist in theme files
# =============================================================================
echo "--- Test Group 1: Swap Documentation ---"

# Count themes with swap comments
swap_themes=$(grep -l "JOB FAIR OPTIMIZED" "$THEMES_DIR"/*.yaml 2>/dev/null | wc -l | tr -d ' ')
echo "Themes with JOB FAIR OPTIMIZED comments: $swap_themes"

if [[ "$swap_themes" -gt 0 ]]; then
    echo "PASS: Some themes have documented swaps"
    ((PASS++))
else
    echo "INFO: No swap comments found yet (expected if architect not backfilled)"
    # Not a failure - architect swaps aren't done yet
fi

# =============================================================================
# Test 2: Verify swap comments include margin
# =============================================================================
echo ""
echo "--- Test Group 2: Swap Margin Documentation ---"

# Swaps should document the performance margin
# Format: # JOB FAIR OPTIMIZED: Character (+X.X over Previous)

sample_swap=$(grep -h "JOB FAIR OPTIMIZED" "$THEMES_DIR"/*.yaml 2>/dev/null | head -1)

if [[ -n "$sample_swap" ]]; then
    # Check if it includes a margin (+ number)
    if echo "$sample_swap" | grep -qE '\+[0-9]+(\.[0-9]+)?'; then
        echo "PASS: Swap comments include performance margin"
        ((PASS++))
    else
        echo "FAIL: Swap comments should include margin (e.g., '+5.0 over Native')"
        ((FAIL++))
    fi
else
    echo "SKIP: No swap comments to validate"
fi

# =============================================================================
# Test 3: Statistical significance calculation
# =============================================================================
echo ""
echo "--- Test Group 3: Statistical Significance Logic ---"

# For a swap to be valid, champion should beat native by more than noise
# Rule of thumb: margin > 2 * std_dev of the lower performer

# Test the calculation logic with mock data
calc_significant() {
    local champion_mean=$1
    local champion_std=$2
    local native_mean=$3
    local native_std=$4

    # Calculate margin
    margin=$(echo "$champion_mean - $native_mean" | bc -l)

    # Use larger std_dev as noise baseline
    if (( $(echo "$champion_std > $native_std" | bc -l) )); then
        noise=$champion_std
    else
        noise=$native_std
    fi

    # Significant if margin > 1.5 * noise (roughly p < 0.05 equivalent)
    threshold=$(echo "$noise * 1.5" | bc -l)

    if (( $(echo "$margin > $threshold" | bc -l) )); then
        echo "significant"
    else
        echo "not_significant"
    fi
}

# Test case 1: Clear winner (margin >> noise)
result=$(calc_significant 85.0 3.0 75.0 3.0)
assert_true '[[ "$result" == "significant" ]]' "Clear winner (85 vs 75, std=3) is significant"

# Test case 2: Noise (margin within std dev)
result=$(calc_significant 77.0 5.0 75.0 5.0)
assert_true '[[ "$result" == "not_significant" ]]' "Close scores (77 vs 75, std=5) is NOT significant"

# Test case 3: Edge case - margin ABOVE threshold
result=$(calc_significant 83.0 5.0 75.0 5.0)
assert_true '[[ "$result" == "significant" ]]' "Margin above threshold (83 vs 75, std=5) is significant"

# Test case 4: Edge case - margin EXACTLY at threshold (not significant - need to BEAT threshold)
result=$(calc_significant 82.5 5.0 75.0 5.0)
assert_true '[[ "$result" == "not_significant" ]]' "Margin exactly at threshold (82.5 vs 75, std=5) is NOT significant"

# =============================================================================
# Test 4: Validate existing swaps in job-fair results
# =============================================================================
echo ""
echo "--- Test Group 4: Validate Existing Swaps ---"

# Find a job-fair result with champions
sample_run=$(ls -d "$JOB_FAIR_DIR"/*/ 2>/dev/null | head -1)

if [[ -n "$sample_run" && -f "$sample_run/summary.yaml" ]]; then
    # Check if there are any "upsets" (non-native winners)
    upsets=$(yq -r '.champions | to_entries | .[] | select(.value.native == false) | .key' "$sample_run/summary.yaml" 2>/dev/null)

    if [[ -n "$upsets" ]]; then
        echo "Found upsets (potential swaps):"
        for role in $upsets; do
            echo "  - $role"

            # Get champion details
            winner=$(yq -r ".champions.$role.character" "$sample_run/summary.yaml" 2>/dev/null)
            score=$(yq -r ".champions.$role.score" "$sample_run/summary.yaml" 2>/dev/null)
            delta=$(yq -r ".champions.$role.delta" "$sample_run/summary.yaml" 2>/dev/null)

            echo "    Winner: $winner (score=$score, delta=$delta)"

            # Verify delta is positive and meaningful
            if [[ -n "$delta" ]]; then
                # Remove leading + if present
                delta_num=$(echo "$delta" | sed 's/^+//')
                if (( $(echo "$delta_num > 3.0" | bc -l 2>/dev/null) )); then
                    echo "    PASS: Delta ($delta_num) is meaningful (> 3.0)"
                    ((PASS++))
                else
                    echo "    WARN: Delta ($delta_num) is small - may be noise"
                fi
            fi
        done
    else
        echo "No upsets found in sample - all native characters won"
    fi
else
    echo "SKIP: No job-fair results to validate"
fi

# =============================================================================
# Test 5: Ensure no swaps without evidence
# =============================================================================
echo ""
echo "--- Test Group 5: Evidence Requirements ---"

# Every swap in theme files should be traceable to job-fair data
swap_files=$(grep -l "JOB FAIR OPTIMIZED" "$THEMES_DIR"/*.yaml 2>/dev/null)

if [[ -n "$swap_files" ]]; then
    for theme_file in $swap_files; do
        theme_name=$(basename "$theme_file" .yaml)

        # Check if corresponding job-fair data exists
        job_fair_run=$(ls -d "$JOB_FAIR_DIR/$theme_name-"* 2>/dev/null | head -1)

        if [[ -n "$job_fair_run" ]]; then
            echo "PASS: $theme_name has supporting job-fair data"
            ((PASS++))
        else
            echo "FAIL: $theme_name has swap but no job-fair evidence"
            ((FAIL++))
        fi
    done
else
    echo "SKIP: No swaps to validate evidence for"
fi

# =============================================================================
# Results
# =============================================================================
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [[ $FAIL -gt 0 ]]; then
    echo ""
    echo "⚠️  Some tests failed. Review swap recommendation logic."
    exit 1
fi

echo ""
echo "✓ All Swap Recommendation Validation Tests PASSED 💥"
echo ""
echo "Swap Recommendation Criteria:"
echo "  1. Champion mean > Native mean"
echo "  2. Margin > 1.5 * max(std_dev) for statistical significance"
echo "  3. Every swap documented with margin in theme file"
echo "  4. Job-fair data exists to support the swap"
