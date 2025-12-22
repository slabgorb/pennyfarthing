#!/usr/bin/env bash
# Run all resilience utility tests
# TEA: Mr. Darcy - "I find that... acceptable. If the tests pass."

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================"
echo "  Resilience Utilities Test Suite"
echo "========================================"
echo ""

TOTAL_PASSED=0
TOTAL_FAILED=0

run_test() {
    local test_file="$1"
    local test_name
    test_name=$(basename "$test_file" .sh)

    echo "--- Running: $test_name ---"

    if "$test_file"; then
        ((TOTAL_PASSED++))
    else
        ((TOTAL_FAILED++))
    fi

    echo ""
}

# Run each test file
for test_file in "$SCRIPT_DIR"/test_*.sh; do
    if [[ -f "$test_file" ]]; then
        run_test "$test_file"
    fi
done

echo "========================================"
echo "  Final Results"
echo "========================================"
echo "Test suites passed: $TOTAL_PASSED"
echo "Test suites failed: $TOTAL_FAILED"
echo ""

if ((TOTAL_FAILED > 0)); then
    echo "OVERALL: FAILED"
    exit 1
else
    echo "OVERALL: PASSED"
    exit 0
fi
