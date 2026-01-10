#!/bin/bash
# test_aggregate_benchmark_stats.sh - Integration tests for aggregate-benchmark-stats.sh
# Tests the job-fair results aggregation into unified benchmark statistics
# RED phase: These tests will fail until aggregate-benchmark-stats.sh is implemented

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
RUNNER="$PROJECT_DIR/scripts/aggregate-benchmark-stats.sh"
RESULTS_DIR="$PROJECT_DIR/internal/results"
CONSOLIDATED_DIR="$RESULTS_DIR/job-fair/consolidated"
OUTPUT_FILE="$RESULTS_DIR/aggregate-stats.yaml"
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "=== Aggregate Benchmark Stats Integration Tests ==="

PASS=0
FAIL=0

assert_contains() {
    local needle="$1"
    local haystack="$2"
    local test_name="$3"

    if echo "$haystack" | grep -qi "$needle"; then
        echo "PASS: $test_name"
        ((PASS++))
    else
        echo "FAIL: $test_name - Output did not contain '$needle'"
        echo "Output was: $(echo "$haystack" | head -10)"
        ((FAIL++))
    fi
}

assert_not_contains() {
    local needle="$1"
    local haystack="$2"
    local test_name="$3"

    if ! echo "$haystack" | grep -qi "$needle"; then
        echo "PASS: $test_name"
        ((PASS++))
    else
        echo "FAIL: $test_name - Output unexpectedly contained '$needle'"
        ((FAIL++))
    fi
}

assert_exit_code() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    if [[ "$actual" -eq "$expected" ]]; then
        echo "PASS: $test_name"
        ((PASS++))
    else
        echo "FAIL: $test_name - Expected exit code $expected, got $actual"
        ((FAIL++))
    fi
}

assert_yaml_field() {
    local file="$1"
    local field="$2"
    local expected="$3"
    local test_name="$4"

    local actual=$(yq -r ".$field" "$file" 2>/dev/null)
    if [[ "$actual" == "$expected" ]]; then
        echo "PASS: $test_name"
        ((PASS++))
    else
        echo "FAIL: $test_name - Expected $field='$expected', got '$actual'"
        ((FAIL++))
    fi
}

assert_yaml_exists() {
    local file="$1"
    local field="$2"
    local test_name="$3"

    local actual=$(yq -r ".$field" "$file" 2>/dev/null)
    if [[ -n "$actual" && "$actual" != "null" ]]; then
        echo "PASS: $test_name"
        ((PASS++))
    else
        echo "FAIL: $test_name - Field '$field' is missing or null"
        ((FAIL++))
    fi
}

assert_yaml_numeric() {
    local file="$1"
    local field="$2"
    local test_name="$3"

    local actual=$(yq -r ".$field" "$file" 2>/dev/null)
    if [[ "$actual" =~ ^[0-9]+\.?[0-9]*$ ]]; then
        echo "PASS: $test_name"
        ((PASS++))
    else
        echo "FAIL: $test_name - Field '$field' is not numeric: '$actual'"
        ((FAIL++))
    fi
}

assert_yaml_array_length_gt() {
    local file="$1"
    local field="$2"
    local min_length="$3"
    local test_name="$4"

    local actual=$(yq -r ".$field | length" "$file" 2>/dev/null)
    if [[ "$actual" -gt "$min_length" ]]; then
        echo "PASS: $test_name"
        ((PASS++))
    else
        echo "FAIL: $test_name - Expected $field length > $min_length, got $actual"
        ((FAIL++))
    fi
}

# ---- Prerequisites ----

echo ""
echo "--- Prerequisite Check ---"

# Test 0: Script exists and is executable
if [[ -x "$RUNNER" ]]; then
    echo "PASS: aggregate-benchmark-stats.sh exists and is executable"
    ((PASS++))
else
    echo "FAIL: aggregate-benchmark-stats.sh does not exist or is not executable at $RUNNER"
    ((FAIL++))
    echo ""
    echo "=== Results: $PASS passed, $FAIL failed ==="
    echo "=== Cannot continue without script - RED phase expected ==="
    exit 1
fi

# Test 0b: Consolidated directory has data
if [[ -d "$CONSOLIDATED_DIR" ]] && [[ $(ls -1 "$CONSOLIDATED_DIR" | wc -l) -gt 0 ]]; then
    echo "PASS: Consolidated job-fair data exists"
    ((PASS++))
else
    echo "FAIL: No consolidated job-fair data at $CONSOLIDATED_DIR"
    ((FAIL++))
    echo ""
    echo "=== Results: $PASS passed, $FAIL failed ==="
    echo "=== Cannot test without consolidated data ==="
    exit 1
fi

# ---- Test Group A: Basic Execution ----

echo ""
echo "--- Test Group A: Basic Execution ---"

# Test A1: Script runs successfully
echo "Test A1: Script runs successfully..."
OUTPUT=$($RUNNER 2>&1)
EXIT_CODE=$?
assert_exit_code 0 $EXIT_CODE "Script exits cleanly"

# Test A2: Output file is created
echo "Test A2: Output file is created..."
if [[ -f "$OUTPUT_FILE" ]]; then
    echo "PASS: Output file exists at $OUTPUT_FILE"
    ((PASS++))
else
    echo "FAIL: Output file not created at $OUTPUT_FILE"
    ((FAIL++))
fi

# Test A3: Output is valid YAML
echo "Test A3: Output is valid YAML..."
if yq . "$OUTPUT_FILE" > /dev/null 2>&1; then
    echo "PASS: Output file is valid YAML"
    ((PASS++))
else
    echo "FAIL: Output file is not valid YAML"
    ((FAIL++))
fi

# ---- Test Group B: Required Sections ----

echo ""
echo "--- Test Group B: Required Sections ---"

# Test B1: Has metadata section
echo "Test B1: Has metadata section..."
assert_yaml_exists "$OUTPUT_FILE" "metadata" "Output has metadata section"

# Test B2: Metadata has generated timestamp
echo "Test B2: Metadata has generated_at..."
assert_yaml_exists "$OUTPUT_FILE" "metadata.generated_at" "Metadata has generated_at timestamp"

# Test B3: Metadata has themes_processed count
echo "Test B3: Metadata has themes_processed..."
assert_yaml_numeric "$OUTPUT_FILE" "metadata.themes_processed" "Metadata has numeric themes_processed"

# Test B4: Has roles section
echo "Test B4: Has roles section..."
assert_yaml_exists "$OUTPUT_FILE" "roles" "Output has roles section"

# Test B5: Has role statistics for dev-codegen
echo "Test B5: Has dev-codegen role..."
assert_yaml_exists "$OUTPUT_FILE" "roles.dev-codegen" "Output has dev-codegen role"

# Test B6: Has role statistics for reviewer
echo "Test B6: Has reviewer role..."
assert_yaml_exists "$OUTPUT_FILE" "roles.reviewer" "Output has reviewer role"

# Test B7: Has rankings section
echo "Test B7: Has rankings section..."
assert_yaml_exists "$OUTPUT_FILE" "rankings" "Output has rankings section"

# Test B8: Has control comparison section
echo "Test B8: Has control section..."
assert_yaml_exists "$OUTPUT_FILE" "control" "Output has control section"

# ---- Test Group C: Statistical Calculations ----

echo ""
echo "--- Test Group C: Statistical Calculations ---"

# Test C1: Role has mean calculated
echo "Test C1: Role has mean calculated..."
assert_yaml_numeric "$OUTPUT_FILE" "roles.dev-codegen.mean" "dev-codegen has numeric mean"

# Test C2: Role has std_dev calculated
echo "Test C2: Role has std_dev calculated..."
assert_yaml_numeric "$OUTPUT_FILE" "roles.dev-codegen.std_dev" "dev-codegen has numeric std_dev"

# Test C3: Role has sample count
echo "Test C3: Role has sample count..."
assert_yaml_numeric "$OUTPUT_FILE" "roles.dev-codegen.n" "dev-codegen has numeric sample count"

# Test C4: Role has min score
echo "Test C4: Role has min score..."
assert_yaml_numeric "$OUTPUT_FILE" "roles.dev-codegen.min" "dev-codegen has numeric min"

# Test C5: Role has max score
echo "Test C5: Role has max score..."
assert_yaml_numeric "$OUTPUT_FILE" "roles.dev-codegen.max" "dev-codegen has numeric max"

# Test C6: Verify mean calculation is reasonable (between 0 and 100)
echo "Test C6: Mean is in valid range..."
MEAN=$(yq -r ".roles.dev-codegen.mean" "$OUTPUT_FILE" 2>/dev/null)
if (( $(echo "$MEAN >= 0 && $MEAN <= 100" | bc -l) )); then
    echo "PASS: Mean $MEAN is in valid range [0, 100]"
    ((PASS++))
else
    echo "FAIL: Mean $MEAN is outside valid range [0, 100]"
    ((FAIL++))
fi

# ---- Test Group D: Theme Rankings ----

echo ""
echo "--- Test Group D: Theme Rankings ---"

# Test D1: Rankings per role exist
echo "Test D1: Rankings per role exist..."
assert_yaml_exists "$OUTPUT_FILE" "rankings.dev-codegen" "Rankings for dev-codegen exist"

# Test D2: Rankings have theme entries
echo "Test D2: Rankings have theme entries..."
assert_yaml_array_length_gt "$OUTPUT_FILE" "rankings.dev-codegen" 0 "dev-codegen rankings has entries"

# Test D3: Each ranking entry has theme name
echo "Test D3: Ranking entry has theme name..."
FIRST_THEME=$(yq -r ".rankings.dev-codegen[0].theme" "$OUTPUT_FILE" 2>/dev/null)
if [[ -n "$FIRST_THEME" && "$FIRST_THEME" != "null" ]]; then
    echo "PASS: First ranking entry has theme: $FIRST_THEME"
    ((PASS++))
else
    echo "FAIL: First ranking entry missing theme name"
    ((FAIL++))
fi

# Test D4: Each ranking entry has mean
echo "Test D4: Ranking entry has mean..."
assert_yaml_numeric "$OUTPUT_FILE" "rankings.dev-codegen[0].mean" "First ranking entry has numeric mean"

# Test D5: Rankings are sorted descending by mean
echo "Test D5: Rankings are sorted descending..."
FIRST_MEAN=$(yq -r ".rankings.dev-codegen[0].mean" "$OUTPUT_FILE" 2>/dev/null)
SECOND_MEAN=$(yq -r ".rankings.dev-codegen[1].mean" "$OUTPUT_FILE" 2>/dev/null)
if [[ -n "$FIRST_MEAN" && -n "$SECOND_MEAN" ]]; then
    if (( $(echo "$FIRST_MEAN >= $SECOND_MEAN" | bc -l) )); then
        echo "PASS: Rankings are sorted descending ($FIRST_MEAN >= $SECOND_MEAN)"
        ((PASS++))
    else
        echo "FAIL: Rankings not sorted descending ($FIRST_MEAN < $SECOND_MEAN)"
        ((FAIL++))
    fi
else
    echo "FAIL: Could not verify ranking order"
    ((FAIL++))
fi

# ---- Test Group E: Control Baseline Integration ----

echo ""
echo "--- Test Group E: Control Baseline Integration ---"

# Test E1: Control section has baseline reference
echo "Test E1: Control section has baseline..."
assert_yaml_exists "$OUTPUT_FILE" "control.baseline" "Control has baseline reference"

# Test E2: Control has comparison data per role
echo "Test E2: Control has role comparison..."
assert_yaml_exists "$OUTPUT_FILE" "control.dev-codegen" "Control has dev-codegen comparison"

# Test E3: Control comparison has mean
echo "Test E3: Control comparison has mean..."
assert_yaml_numeric "$OUTPUT_FILE" "control.dev-codegen.mean" "Control dev-codegen has numeric mean"

# Test E4: Control comparison has vs_baseline delta
echo "Test E4: Control has vs_baseline delta..."
assert_yaml_exists "$OUTPUT_FILE" "control.dev-codegen.vs_baseline" "Control has vs_baseline delta"

# ---- Test Group F: All Roles Covered ----

echo ""
echo "--- Test Group F: All Roles Covered ---"

# All 6 standard roles should be present
ROLES="dev-codegen dev-debug reviewer tea sm architect"

for ROLE in $ROLES; do
    echo "Test F: Role $ROLE exists..."
    assert_yaml_exists "$OUTPUT_FILE" "roles.$ROLE" "Role $ROLE is present"
done

# ---- Test Group G: Dry Run Mode ----

echo ""
echo "--- Test Group G: Dry Run Mode ---"

# Test G1: Dry run does not write file
echo "Test G1: Dry run mode..."
# Backup existing file
if [[ -f "$OUTPUT_FILE" ]]; then
    cp "$OUTPUT_FILE" "$TMPDIR/backup.yaml"
fi

# Remove file to test dry run
rm -f "$OUTPUT_FILE"
OUTPUT=$($RUNNER --dry-run 2>&1)
EXIT_CODE=$?
assert_exit_code 0 $EXIT_CODE "Dry run exits cleanly"

if [[ ! -f "$OUTPUT_FILE" ]]; then
    echo "PASS: Dry run did not create output file"
    ((PASS++))
else
    echo "FAIL: Dry run created output file"
    ((FAIL++))
fi

# Test G2: Dry run outputs to stdout
echo "Test G2: Dry run outputs to stdout..."
assert_contains "metadata" "$OUTPUT" "Dry run output contains metadata"

# Restore backup
if [[ -f "$TMPDIR/backup.yaml" ]]; then
    cp "$TMPDIR/backup.yaml" "$OUTPUT_FILE"
fi

# ---- Test Group H: Specific Theme Filter ----

echo ""
echo "--- Test Group H: Theme Filter ---"

# Test H1: Filter to single theme
echo "Test H1: Single theme filter..."
OUTPUT=$($RUNNER --theme discworld --dry-run 2>&1)
EXIT_CODE=$?
assert_exit_code 0 $EXIT_CODE "Theme filter exits cleanly"
assert_contains "discworld" "$OUTPUT" "Output includes filtered theme"
assert_yaml_field <(echo "$OUTPUT") "metadata.themes_processed" "1" "Single theme processed"

echo ""
echo "========================================"
echo "=== Results: $PASS passed, $FAIL failed ==="
echo "========================================"

if [[ $FAIL -gt 0 ]]; then
    echo "=== Aggregate Benchmark Stats Tests FAILED ==="
    exit 1
fi

echo "=== Aggregate Benchmark Stats Tests PASSED ==="
exit 0
