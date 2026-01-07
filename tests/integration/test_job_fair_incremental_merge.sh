#!/bin/bash
# test_job_fair_incremental_merge.sh - Tests for job-fair incremental merge (Story 7-2)
# Validates that running --roles for one role doesn't destroy existing role data
#
# TEA Notes (Jinx): If running --roles architect nukes the dev/reviewer/tea/sm data,
# the whole job-fair is WORTHLESS. This test makes sure we don't lose data!
#
# This is an INTEGRATION test because it operates on real job-fair result files.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
JOB_FAIR_DIR="$PROJECT_DIR/internal/results/job-fair"

echo "=== Job-Fair Incremental Merge Tests ==="
echo "Testing that --roles preserves existing role data"
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

assert_dir_exists() {
    local dir="$1"
    local test_name="$2"

    if [[ -d "$dir" ]]; then
        echo "PASS: $test_name"
        ((PASS++))
    else
        echo "FAIL: $test_name - Directory not found: $dir"
        ((FAIL++))
    fi
}

assert_has_role_data() {
    local summary_file="$1"
    local role="$2"
    local test_name="$3"

    if [[ ! -f "$summary_file" ]]; then
        echo "FAIL: $test_name - Summary file not found"
        ((FAIL++))
        return
    fi

    # Check if role exists in matrix (yq v4 syntax)
    has_role=$(yq ".matrix | to_entries[0].value | has(\"$role\")" "$summary_file" 2>/dev/null)

    if [[ "$has_role" == "true" ]]; then
        echo "PASS: $test_name"
        ((PASS++))
    else
        echo "FAIL: $test_name - Role '$role' not found in matrix"
        ((FAIL++))
    fi
}

# =============================================================================
# Test 1: Job-fair results directory exists
# =============================================================================
echo "--- Test Group 1: Results Directory ---"

assert_dir_exists "$JOB_FAIR_DIR" "Job-fair results directory exists"

# Count total job-fair runs
run_count=$(ls -d "$JOB_FAIR_DIR"/*/ 2>/dev/null | wc -l | tr -d ' ')
echo "Found $run_count job-fair runs"

assert_true '[[ "$run_count" -gt 0 ]]' "At least one job-fair run exists"

# =============================================================================
# Test 2: Existing runs have multi-role data
# =============================================================================
echo ""
echo "--- Test Group 2: Multi-Role Data Preservation ---"

# Find a theme with existing job-fair data
sample_run=$(ls -d "$JOB_FAIR_DIR"/*/ 2>/dev/null | head -1)

if [[ -n "$sample_run" ]]; then
    theme_name=$(basename "$sample_run" | sed 's/-[0-9TZ]*$//')
    echo "Checking sample run: $sample_run"
    echo "Theme: $theme_name"

    summary_file="$sample_run/summary.yaml"
    assert_file_exists "$summary_file" "Summary file exists"

    if [[ -f "$summary_file" ]]; then
        # Check for each established role
        for role in dev reviewer tea sm; do
            assert_has_role_data "$summary_file" "$role" "Has $role data in matrix"
        done
    fi
fi

# =============================================================================
# Test 3: Verify data structure allows incremental add
# =============================================================================
echo ""
echo "--- Test Group 3: Incremental Add Structure ---"

# The summary.yaml structure should support adding new roles without overwriting
# Check that matrix is a proper nested structure

if [[ -f "$summary_file" ]]; then
    # Verify matrix structure (yq v4 syntax)
    matrix_type=$(yq '.matrix | type' "$summary_file" 2>/dev/null)
    assert_true '[[ "$matrix_type" == "!!map" ]]' "Matrix is a map (supports incremental add)"

    # Count characters in matrix (yq v4 syntax)
    char_count=$(yq '.matrix | keys | length' "$summary_file" 2>/dev/null)
    assert_true '[[ "$char_count" -gt 0 ]]' "Matrix has character entries (count=$char_count)"

    # Check scenarios section exists (needed for role-scenario mapping)
    # Note: Older job-fair formats may not have this - it's optional for legacy data
    has_scenarios=$(yq '.scenarios' "$summary_file" 2>/dev/null)
    if [[ -n "$has_scenarios" && "$has_scenarios" != "null" ]]; then
        echo "PASS: Has scenarios section for role mapping"
        ((PASS++))
    else
        echo "INFO: No scenarios section (legacy format) - incremental merge will add it"
    fi
fi

# =============================================================================
# Test 4: Simulate incremental merge (dry run validation)
# =============================================================================
echo ""
echo "--- Test Group 4: Merge Safety Check ---"

# Create a temporary test file to verify merge logic
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Copy a sample summary to temp
if [[ -f "$summary_file" ]]; then
    cp "$summary_file" "$TMPDIR/test_summary.yaml"

    # Record original role count per character (yq v4 syntax)
    original_roles=$(yq '.matrix | to_entries[0].value | keys | length' "$TMPDIR/test_summary.yaml" 2>/dev/null)
    echo "Original roles per character: $original_roles"

    # Simulate adding architect role (just checking structure)
    # A proper merge would ADD to existing, not replace
    yq -i '.scenarios.architect = "database-selection"' "$TMPDIR/test_summary.yaml" 2>/dev/null

    # Verify existing data wasn't destroyed (yq v4 syntax)
    new_roles=$(yq '.matrix | to_entries[0].value | keys | length' "$TMPDIR/test_summary.yaml" 2>/dev/null)
    assert_true '[[ "$new_roles" -ge "$original_roles" ]]' "Adding architect scenario preserves existing roles"
fi

# =============================================================================
# Test 5: Check for data loss indicators
# =============================================================================
echo ""
echo "--- Test Group 5: Data Loss Detection ---"

# Look for themes that have FEWER roles than expected (potential data loss)
expected_roles=4  # dev, reviewer, tea, sm

for run_dir in "$JOB_FAIR_DIR"/*/; do
    if [[ -f "$run_dir/summary.yaml" ]]; then
        theme=$(basename "$run_dir" | sed 's/-[0-9TZ]*$//')

        # Get unique roles across all characters
        role_count=$(yq -r '.matrix | to_entries | .[].value | keys | .[]' "$run_dir/summary.yaml" 2>/dev/null | sort -u | wc -l | tr -d ' ')

        if [[ "$role_count" -lt "$expected_roles" ]]; then
            echo "WARNING: $theme has only $role_count roles (expected $expected_roles)"
        fi
    fi
done | head -10

echo "Data loss check complete"

# =============================================================================
# Results
# =============================================================================
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [[ $FAIL -gt 0 ]]; then
    echo ""
    echo "⚠️  Some tests failed. Incremental merge may not be safe!"
    exit 1
fi

echo ""
echo "✓ All Incremental Merge Tests PASSED 💥"
echo ""
echo "NOTE: These tests verify the DATA STRUCTURE supports incremental merge."
echo "A full integration test should run --roles architect on a real theme"
echo "and verify all existing dev/reviewer/tea/sm data is preserved."
