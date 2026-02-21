#!/usr/bin/env bash
#
# test_pack_gate.sh - Verify package contents test is wired as a publish gate
#
# This integration test ensures the package contents assertion is actually
# integrated into the publish/release workflow, not just sitting as an
# orphaned test file.
#
# Usage: ./tests/integration/test_pack_gate.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS=0
FAIL=0

pass() {
    echo "PASS: $1"
    ((PASS++))
}

fail() {
    echo "FAIL: $1"
    ((FAIL++))
}

echo "=== Pack Gate Integration Tests ==="
echo ""

# --- Test: package contents test script exists ---

if [[ -x "$PROJECT_ROOT/tests/unit/test_package_contents.sh" ]]; then
    pass "test_package_contents.sh exists and is executable"
else
    fail "test_package_contents.sh missing or not executable"
fi

# --- Test: manifest file exists ---

if [[ -f "$PROJECT_ROOT/tests/fixtures/package-manifest.json" ]]; then
    pass "package-manifest.json exists"
else
    fail "package-manifest.json missing"
fi

# --- Test: gate is wired into prepublishOnly or justfile ---

# Check if package.json prepublishOnly runs the pack gate
PREPUBLISH_HAS_GATE=0
if grep -q "test_package_contents" "$PROJECT_ROOT/package.json" 2>/dev/null; then
    PREPUBLISH_HAS_GATE=1
fi

# Check if justfile has a pack-check recipe
JUSTFILE_HAS_GATE=0
if [[ -f "$PROJECT_ROOT/justfile" ]] && grep -q "pack-check\|pack-gate\|check-pack\|validate-pack" "$PROJECT_ROOT/justfile" 2>/dev/null; then
    JUSTFILE_HAS_GATE=1
fi

# Check if test runner includes this test
TEST_RUNNER_HAS_GATE=0
if grep -q "test_package_contents" "$PROJECT_ROOT/tests/run-tests.sh" 2>/dev/null; then
    TEST_RUNNER_HAS_GATE=1
fi

if [[ $PREPUBLISH_HAS_GATE -eq 1 ]]; then
    pass "Pack gate wired into package.json prepublishOnly"
elif [[ $JUSTFILE_HAS_GATE -eq 1 ]]; then
    pass "Pack gate wired into justfile recipe"
elif [[ $TEST_RUNNER_HAS_GATE -eq 1 ]]; then
    pass "Pack gate wired into test runner"
else
    fail "Pack gate NOT integrated into publish workflow (not in prepublishOnly, justfile, or test runner)"
fi

# --- Test: running the content test succeeds ---

echo ""
echo "Running package contents test..."
if "$PROJECT_ROOT/tests/unit/test_package_contents.sh" > /dev/null 2>&1; then
    pass "Package contents test passes"
else
    fail "Package contents test FAILS — manifest may be out of date"
fi

echo ""

# --- Summary ---

echo "========================================"
echo "  Pack Gate Integration Summary"
echo "========================================"
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo ""

if [[ $FAIL -gt 0 ]]; then
    echo "FAILED: $FAIL assertion(s) failed"
    exit 1
else
    echo "PASSED: All gate integration assertions passed"
    exit 0
fi
