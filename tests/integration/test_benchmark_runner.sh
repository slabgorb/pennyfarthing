#!/bin/bash
# test_benchmark_runner.sh - Integration tests for benchmark-runner.sh
# Tests the unified benchmark runner entry point
# RED phase: These tests will fail until benchmark-runner.sh is implemented

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
RUNNER="$PROJECT_DIR/scripts/benchmark-runner.sh"
FIXTURE_DIR="$SCRIPT_DIR/../fixtures"
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "=== Benchmark Runner Integration Tests ==="

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
        echo "Output was: $haystack"
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

assert_json_field() {
    local json="$1"
    local field="$2"
    local expected="$3"
    local test_name="$4"

    local actual=$(echo "$json" | jq -r ".$field" 2>/dev/null)
    if [[ "$actual" == "$expected" ]]; then
        echo "PASS: $test_name"
        ((PASS++))
    else
        echo "FAIL: $test_name - Expected $field='$expected', got '$actual'"
        ((FAIL++))
    fi
}

# ---- Prerequisites ----

echo ""
echo "--- Prerequisite Check ---"

# Test 0: Script exists
if [[ -x "$RUNNER" ]]; then
    echo "PASS: benchmark-runner.sh exists and is executable"
    ((PASS++))
else
    echo "FAIL: benchmark-runner.sh does not exist or is not executable at $RUNNER"
    ((FAIL++))
    echo ""
    echo "=== Results: $PASS passed, $FAIL failed ==="
    echo "=== Cannot continue without script - RED phase expected ==="
    exit 1
fi

# ---- Test Group A: Catalog Mode ----

echo ""
echo "--- Test Group A: Catalog Mode ---"

# Test A1: Catalog mode lists test cases
echo "Test A1: Catalog mode lists test cases..."
OUTPUT=$($RUNNER --mode catalog 2>&1)
EXIT_CODE=$?
assert_exit_code 0 $EXIT_CODE "Catalog mode exits cleanly"
assert_contains "dev-001" "$OUTPUT" "Catalog lists dev-001"
assert_contains "architecture" "$OUTPUT" "Catalog shows architecture category"

# Test A2: Catalog with category filter
echo "Test A2: Catalog with category filter..."
OUTPUT=$($RUNNER --mode catalog --category dev 2>&1)
assert_contains "dev-001" "$OUTPUT" "Dev category shows dev-001"
assert_not_contains "arch-001" "$OUTPUT" "Dev category excludes architecture tests"

# Test A3: Catalog as JSON
echo "Test A3: Catalog as JSON output..."
OUTPUT=$($RUNNER --mode catalog --format json 2>&1)
# Verify it's valid JSON
if echo "$OUTPUT" | jq . > /dev/null 2>&1; then
    echo "PASS: Catalog JSON is valid"
    ((PASS++))
else
    echo "FAIL: Catalog output is not valid JSON"
    ((FAIL++))
fi

# ---- Test Group B: Error Handling ----

echo ""
echo "--- Test Group B: Error Handling ---"

# Test B1: No arguments shows usage
echo "Test B1: No arguments shows usage..."
OUTPUT=$($RUNNER 2>&1 || true)
assert_contains "usage" "$OUTPUT" "No args shows usage"

# Test B2: Invalid mode
echo "Test B2: Invalid mode rejected..."
OUTPUT=$($RUNNER --mode invalid 2>&1 || true)
EXIT_CODE=$?
assert_exit_code 1 $EXIT_CODE "Invalid mode exits with error"
assert_contains "error\|invalid\|unknown" "$OUTPUT" "Invalid mode error message"

# Test B3: Missing required arguments for solo mode
echo "Test B3: Solo mode requires agent..."
OUTPUT=$($RUNNER --mode solo --case dev-001 2>&1 || true)
EXIT_CODE=$?
assert_exit_code 1 $EXIT_CODE "Solo without agent exits with error"
assert_contains "agent\|required" "$OUTPUT" "Missing agent error message"

# Test B4: Non-existent test case
echo "Test B4: Non-existent test case..."
OUTPUT=$($RUNNER --mode solo --case nonexistent-999 --agent rome:dev 2>&1 || true)
EXIT_CODE=$?
assert_exit_code 1 $EXIT_CODE "Non-existent case exits with error"
assert_contains "not found\|invalid\|error" "$OUTPUT" "Non-existent case error message"

# Test B5: Non-existent category
echo "Test B5: Non-existent category..."
OUTPUT=$($RUNNER --mode catalog --category nonexistent 2>&1)
EXIT_CODE=$?
# Empty results are OK, but should not error
assert_exit_code 0 $EXIT_CODE "Empty category still exits cleanly"

# ---- Test Group C: YAML Loading ----

echo ""
echo "--- Test Group C: YAML Loading ---"

# Test C1: Parses test case metadata
echo "Test C1: Parse test case metadata..."
OUTPUT=$($RUNNER --mode info --case dev-001 2>&1)
assert_contains "Buggy" "$OUTPUT" "Info shows test case name"
assert_contains "hard" "$OUTPUT" "Info shows difficulty"
assert_contains "dev" "$OUTPUT" "Info shows category"

# Test C2: Info mode as JSON
echo "Test C2: Info mode JSON output..."
OUTPUT=$($RUNNER --mode info --case dev-001 --format json 2>&1)
assert_json_field "$OUTPUT" "id" "dev-001" "JSON has correct id"
assert_json_field "$OUTPUT" "category" "dev" "JSON has correct category"

# ---- Test Group D: Output Format ----

echo ""
echo "--- Test Group D: Output Format ---"

# Test D1: Solo mode produces JSON result (mock/dry-run)
echo "Test D1: Solo dry-run produces JSON..."
OUTPUT=$($RUNNER --mode solo --case dev-001 --agent rome:dev --dry-run 2>&1)
if echo "$OUTPUT" | jq . > /dev/null 2>&1; then
    echo "PASS: Solo dry-run output is valid JSON"
    ((PASS++))
else
    echo "FAIL: Solo dry-run output is not valid JSON"
    ((FAIL++))
fi

# Test D2: Result includes required fields
echo "Test D2: Result has required fields..."
OUTPUT=$($RUNNER --mode solo --case dev-001 --agent rome:dev --dry-run 2>&1)
assert_json_field "$OUTPUT" "mode" "solo" "Result has mode field"
assert_json_field "$OUTPUT" "test_case" "dev-001" "Result has test_case field"
assert_json_field "$OUTPUT" "agent" "rome:dev" "Result has agent field"

# ---- Test Group E: Suite Mode ----

echo ""
echo "--- Test Group E: Suite Mode ---"

# Test E1: Suite mode accepts category
echo "Test E1: Suite mode with category (dry-run)..."
OUTPUT=$($RUNNER --mode suite --category dev --agent rome:dev --dry-run 2>&1)
EXIT_CODE=$?
assert_exit_code 0 $EXIT_CODE "Suite dry-run exits cleanly"
assert_contains "dev-001" "$OUTPUT" "Suite includes dev-001"

# Test E2: Suite produces summary
echo "Test E2: Suite produces summary..."
OUTPUT=$($RUNNER --mode suite --category dev --agent rome:dev --dry-run 2>&1)
assert_contains "total\|summary\|cases" "$OUTPUT" "Suite shows summary"

echo ""
echo "========================================"
echo "=== Results: $PASS passed, $FAIL failed ==="
echo "========================================"

if [[ $FAIL -gt 0 ]]; then
    echo "=== Benchmark Runner Tests FAILED ==="
    exit 1
fi

echo "=== Benchmark Runner Tests PASSED ==="
exit 0
