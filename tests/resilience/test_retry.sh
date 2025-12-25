#!/usr/bin/env zsh
# Tests for scripts/utils/retry.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC}: $1"; TESTS_PASSED=$((TESTS_PASSED + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $1"; TESTS_FAILED=$((TESTS_FAILED + 1)); }

RETRY_SCRIPT="$PROJECT_ROOT/scripts/utils/retry.sh"
TEST_TMP=""

setup() {
    TEST_TMP=$(mktemp -d)
}

cleanup() {
    [[ -n "$TEST_TMP" ]] && rm -rf "$TEST_TMP"
}

trap cleanup EXIT

# Test: retry.sh exists and is sourceable
test_script_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ -f "$RETRY_SCRIPT" ]]; then
        if source "$RETRY_SCRIPT" 2>/dev/null; then
            pass "retry.sh exists and is sourceable"
        else
            fail "retry.sh exists but cannot be sourced"
        fi
    else
        fail "retry.sh does not exist"
    fi
}

# Test: retry_with_backoff function exists
test_function_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$RETRY_SCRIPT" 2>/dev/null || true
    if declare -f retry_with_backoff > /dev/null 2>&1; then
        pass "retry_with_backoff function exists"
    else
        fail "retry_with_backoff function not defined"
    fi
}

# Test: Successful command returns immediately
test_success_no_retry() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$RETRY_SCRIPT" 2>/dev/null || { fail "Cannot source"; return; }

    local start end elapsed
    start=$(date +%s)
    retry_with_backoff 3 1 10 true
    end=$(date +%s)
    elapsed=$((end - start))

    if ((elapsed < 2)); then
        pass "Successful command returns immediately (${elapsed}s)"
    else
        fail "Took too long: ${elapsed}s"
    fi
}

# Test: Configurable retry attempts
test_retry_count() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$RETRY_SCRIPT" 2>/dev/null || { fail "Cannot source"; return; }

    local counter="$TEST_TMP/counter"
    echo "0" > "$counter"

    retry_with_backoff 3 0 1 bash -c "n=\$(cat $counter); echo \$((n+1)) > $counter; false" 2>/dev/null || true

    local count
    count=$(cat "$counter")
    if [[ "$count" == "3" ]]; then
        pass "Retry count configurable (ran 3 times)"
    else
        fail "Expected 3 attempts, got $count"
    fi
}

# Test: command_with_fallback exists
test_fallback_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$RETRY_SCRIPT" 2>/dev/null || true
    if declare -f command_with_fallback > /dev/null 2>&1; then
        pass "command_with_fallback function exists"
    else
        fail "command_with_fallback function not defined"
    fi
}

# Test: Fallback runs when primary fails
test_fallback_runs() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$RETRY_SCRIPT" 2>/dev/null || { fail "Cannot source"; return; }

    local result="$TEST_TMP/result"
    command_with_fallback "false" "echo done > $result" 2>/dev/null || true

    if [[ -f "$result" ]]; then
        pass "Fallback runs when primary fails"
    else
        fail "Fallback did not run"
    fi
}

# Test: Primary success skips fallback
test_primary_skips_fallback() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$RETRY_SCRIPT" 2>/dev/null || { fail "Cannot source"; return; }

    local marker="$TEST_TMP/marker"
    command_with_fallback "true" "touch $marker" 2>/dev/null || true

    if [[ ! -f "$marker" ]]; then
        pass "Primary success skips fallback"
    else
        fail "Fallback ran when primary succeeded"
    fi
}

main() {
    echo "=== Retry Utility Tests ==="
    echo ""

    setup

    test_script_exists
    test_function_exists
    test_success_no_retry
    test_retry_count
    test_fallback_exists
    test_fallback_runs
    test_primary_skips_fallback

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
