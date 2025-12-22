#!/usr/bin/env bash
# Tests for context warning functionality in scripts/check-context.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC}: $1"; TESTS_PASSED=$((TESTS_PASSED + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $1"; TESTS_FAILED=$((TESTS_FAILED + 1)); }

CHECK_SCRIPT="$PROJECT_ROOT/scripts/check-context.sh"

# Test: Script exists
test_script_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ -f "$CHECK_SCRIPT" ]]; then
        pass "check-context.sh exists"
    else
        fail "check-context.sh does not exist"
    fi
}

# Test: Script is executable
test_script_executable() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ -x "$CHECK_SCRIPT" ]]; then
        pass "check-context.sh is executable"
    else
        fail "check-context.sh is not executable"
    fi
}

# Test: Supports --human flag
test_human_flag() {
    TESTS_RUN=$((TESTS_RUN + 1))
    local output
    output=$("$CHECK_SCRIPT" --human 2>&1) || true

    if [[ -n "$output" ]]; then
        pass "--human flag produces output"
    else
        fail "--human flag produces no output"
    fi
}

# Test: Script contains 70% threshold
test_70_threshold() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if grep -qE '70' "$CHECK_SCRIPT"; then
        pass "Script contains 70% threshold"
    else
        fail "Script lacks 70% threshold"
    fi
}

# Test: Script contains 90% threshold
test_90_threshold() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if grep -qE '90' "$CHECK_SCRIPT"; then
        pass "Script contains 90% threshold"
    else
        fail "Script lacks 90% threshold"
    fi
}

# Test: Script contains CONTEXT_WARNING
test_warning_output() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if grep -q 'CONTEXT_WARNING' "$CHECK_SCRIPT"; then
        pass "Script outputs CONTEXT_WARNING"
    else
        fail "Script lacks CONTEXT_WARNING output"
    fi
}

# Test: Warning includes recommendation
test_recommendation() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if grep -qiE 'handoff|checkpoint|consider|recommend' "$CHECK_SCRIPT"; then
        pass "Warning includes recommendation"
    else
        fail "Warning lacks recommendation"
    fi
}

# Test: Script exits cleanly
test_clean_exit() {
    TESTS_RUN=$((TESTS_RUN + 1))
    local exit_code
    "$CHECK_SCRIPT" --human >/dev/null 2>&1 || exit_code=$?
    exit_code=${exit_code:-0}

    if ((exit_code == 0 || exit_code == 1)); then
        pass "Script exits cleanly (code: $exit_code)"
    else
        fail "Unexpected exit code: $exit_code"
    fi
}

main() {
    echo "=== Context Warning Tests ==="
    echo ""

    test_script_exists
    test_script_executable
    test_human_flag
    test_70_threshold
    test_90_threshold
    test_warning_output
    test_recommendation
    test_clean_exit

    echo ""
    echo "=== Results ==="
    echo "Tests run: $TESTS_RUN"
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"

    if ((TESTS_FAILED > 0)); then
        exit 1
    fi
}

main "$@"
