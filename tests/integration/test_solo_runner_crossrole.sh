#!/bin/bash
# test_solo_runner_crossrole.sh - Integration tests for solo-runner.sh with --as
# These tests check error handling and argument parsing without making API calls

# Don't exit on error for test script - we handle failures ourselves

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
RUNNER="$PROJECT_DIR/packages/benchmark/scripts/solo-runner.sh"
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "=== Solo Runner Cross-Role Integration Tests ==="

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

# ---- Test Group B: Error Handling ----

# Test B1: Invalid character name
echo "Test B1: Invalid character name..."
OUTPUT=$($RUNNER shakespeare:hamlet-not-exist race-condition-cache "$TMPDIR/b1" --as dev 2>&1 || true)
assert_contains "not found" "$OUTPUT" "Invalid character rejected"

# Test B2: Invalid role override
echo "Test B2: Invalid role override..."
OUTPUT=$($RUNNER shakespeare:prospero race-condition-cache "$TMPDIR/b2" --as wizard 2>&1 || true)
assert_contains "invalid\|error" "$OUTPUT" "Invalid role rejected"

# Test B3: Missing theme file
echo "Test B3: Theme not found..."
OUTPUT=$($RUNNER nonexistent-theme:prospero race-condition-cache "$TMPDIR/b3" --as dev 2>&1 || true)
assert_contains "not found" "$OUTPUT" "Missing theme rejected"

# Test B4: Missing scenario file
echo "Test B4: Scenario not found..."
OUTPUT=$($RUNNER shakespeare:dev nonexistent-scenario-xyz "$TMPDIR/b4" 2>&1 || true)
assert_contains "not found" "$OUTPUT" "Missing scenario rejected"

# Test B5: Invalid spec format (no colon)
echo "Test B5: Invalid spec format..."
OUTPUT=$($RUNNER shakespeare race-condition-cache "$TMPDIR/b5" 2>&1 || true)
assert_contains "invalid\|error\|usage" "$OUTPUT" "Invalid spec format rejected"

# Test B6: Empty arguments
echo "Test B6: Empty arguments..."
OUTPUT=$($RUNNER 2>&1 || true)
assert_contains "usage" "$OUTPUT" "Empty arguments shows usage"

# ---- Test Group D: Argument Parsing (no API calls) ----

# Test D1: --as with invalid theme (exits before API call)
echo "Test D1: --as with missing theme..."
OUTPUT=$($RUNNER missing-theme:prospero race-condition-cache "$TMPDIR/d1" --as dev 2>&1 || true)
if echo "$OUTPUT" | grep -qi "not found"; then
    echo "PASS: --as syntax accepted, failed on theme lookup"
    ((PASS++))
else
    echo "FAIL: Unexpected behavior"
    ((FAIL++))
fi

# Test D2: --as flag parses correctly (check via error message format)
echo "Test D2: --as parses correctly..."
# Use a valid theme but invalid character to verify --as is parsed
OUTPUT=$($RUNNER shakespeare:not-a-character race-condition-cache "$TMPDIR/d2" --as dev 2>&1 || true)
if echo "$OUTPUT" | grep -qi "not found in theme"; then
    echo "PASS: --as parsed, character lookup executed"
    ((PASS++))
else
    echo "FAIL: --as may not have been parsed correctly"
    ((FAIL++))
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [[ $FAIL -gt 0 ]]; then
    exit 1
fi

echo "=== Solo Runner Integration Tests PASSED ==="
