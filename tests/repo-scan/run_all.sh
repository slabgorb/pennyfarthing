#!/usr/bin/env zsh
# Run all repo-scan tests
# Story 1-4a: Split workflow-status-check.md subagent

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "========================================"
echo "  Repo Scan Test Suite"
echo "========================================"
echo ""

SUITES_PASSED=0
SUITES_FAILED=0

run_suite() {
    local suite="$1"
    echo "Running: $suite"
    if "$SCRIPT_DIR/$suite"; then
        SUITES_PASSED=$((SUITES_PASSED + 1))
    else
        SUITES_FAILED=$((SUITES_FAILED + 1))
    fi
    echo ""
}

run_suite "test_repo_scan.sh"

echo "========================================"
echo "  Final Results"
echo "========================================"
echo "Test suites passed: $SUITES_PASSED"
echo "Test suites failed: $SUITES_FAILED"
echo ""

if [[ $SUITES_FAILED -gt 0 ]]; then
    echo "OVERALL: FAILED"
    exit 1
else
    echo "OVERALL: PASSED"
    exit 0
fi
