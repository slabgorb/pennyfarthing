#!/usr/bin/env zsh
#
# Pennyfarthing Test Runner
# Runs all validation tests for the agent framework
#
# Usage: ./tests/run-tests.sh
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
    local name="$1"
    local script="$2"

    ((TESTS_RUN++))
    echo -e "${BLUE}Running:${NC} $name"

    if "$SCRIPT_DIR/$script" > /dev/null 2>&1; then
        ((TESTS_PASSED++))
        echo -e "  ${GREEN}PASSED${NC}"
        return 0
    else
        ((TESTS_FAILED++))
        echo -e "  ${RED}FAILED${NC}"
        # Show output on failure
        echo "  --- Output ---"
        "$SCRIPT_DIR/$script" 2>&1 | sed 's/^/  /' | tail -20
        echo "  ---------------"
        return 1
    fi
}

echo ""
echo "========================================"
echo "   Pennyfarthing Test Suite"
echo "========================================"
echo ""

# Run all test scripts
run_test "Reference Integrity" "check-references.sh" || true
run_test "Package Contents" "unit/test_package_contents.sh" || true

# Add more tests here as they are created:
# run_test "YAML Schema Validation" "check-yaml-schemas.sh" || true
# run_test "Markdown Structure" "check-markdown-structure.sh" || true
# run_test "Shell Script Tests" "test-shell-scripts.sh" || true

echo ""
echo "========================================"
echo "   Summary"
echo "========================================"
echo "Tests run:    $TESTS_RUN"
echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [[ $TESTS_FAILED -gt 0 ]]; then
    echo -e "${RED}FAILED: $TESTS_FAILED test(s) failed${NC}"
    exit 1
else
    echo -e "${GREEN}PASSED: All tests passed${NC}"
    exit 0
fi
