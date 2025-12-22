#!/usr/bin/env bash
# Tests for scripts/utils/checkpoint.sh

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

CHECKPOINT_SCRIPT="$PROJECT_ROOT/scripts/utils/checkpoint.sh"
TEST_TMP=""
ORIG_PROJECT_ROOT="$PROJECT_ROOT"

setup() {
    TEST_TMP=$(mktemp -d)
    mkdir -p "$TEST_TMP/.session"
    export PROJECT_ROOT="$TEST_TMP"
}

cleanup() {
    export PROJECT_ROOT="$ORIG_PROJECT_ROOT"
    [[ -n "$TEST_TMP" ]] && rm -rf "$TEST_TMP"
}

trap cleanup EXIT

# Test: checkpoint.sh exists
test_script_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ -f "$CHECKPOINT_SCRIPT" ]]; then
        if source "$CHECKPOINT_SCRIPT" 2>/dev/null; then
            pass "checkpoint.sh exists and is sourceable"
        else
            fail "checkpoint.sh cannot be sourced"
        fi
    else
        fail "checkpoint.sh does not exist"
    fi
}

# Test: checkpoint_save function exists
test_save_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$CHECKPOINT_SCRIPT" 2>/dev/null || true
    if declare -f checkpoint_save > /dev/null 2>&1; then
        pass "checkpoint_save function exists"
    else
        fail "checkpoint_save not defined"
    fi
}

# Test: checkpoint_restore function exists
test_restore_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$CHECKPOINT_SCRIPT" 2>/dev/null || true
    if declare -f checkpoint_restore > /dev/null 2>&1; then
        pass "checkpoint_restore function exists"
    else
        fail "checkpoint_restore not defined"
    fi
}

# Test: checkpoint_list function exists
test_list_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$CHECKPOINT_SCRIPT" 2>/dev/null || true
    if declare -f checkpoint_list > /dev/null 2>&1; then
        pass "checkpoint_list function exists"
    else
        fail "checkpoint_list not defined"
    fi
}

# Test: checkpoint_clear function exists
test_clear_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$CHECKPOINT_SCRIPT" 2>/dev/null || true
    if declare -f checkpoint_clear > /dev/null 2>&1; then
        pass "checkpoint_clear function exists"
    else
        fail "checkpoint_clear not defined"
    fi
}

# Test: Save creates file
test_save_creates_file() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$CHECKPOINT_SCRIPT" 2>/dev/null || { fail "Cannot source"; return; }

    checkpoint_save "test_label" "test_data"

    if [[ -f "$TEST_TMP/.session/checkpoints.log" ]]; then
        pass "checkpoint_save creates file"
    else
        fail "checkpoint_save did not create file"
    fi
}

# Test: Save format is correct
test_save_format() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$CHECKPOINT_SCRIPT" 2>/dev/null || { fail "Cannot source"; return; }

    checkpoint_save "my_label" "my_data"

    local content
    content=$(cat "$TEST_TMP/.session/checkpoints.log")

    if echo "$content" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*\|my_label\|my_data$'; then
        pass "checkpoint format correct (timestamp|label|data)"
    else
        fail "Format incorrect: $content"
    fi
}

# Test: Restore retrieves data
test_restore_works() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$CHECKPOINT_SCRIPT" 2>/dev/null || { fail "Cannot source"; return; }

    checkpoint_save "restore_test" "expected_value"

    local result
    result=$(checkpoint_restore "restore_test")

    if [[ "$result" == "expected_value" ]]; then
        pass "checkpoint_restore retrieves correct data"
    else
        fail "Expected 'expected_value', got '$result'"
    fi
}

# Test: Restore returns latest
test_restore_latest() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$CHECKPOINT_SCRIPT" 2>/dev/null || { fail "Cannot source"; return; }

    checkpoint_save "dup" "first"
    checkpoint_save "dup" "second"
    checkpoint_save "dup" "latest"

    local result
    result=$(checkpoint_restore "dup")

    if [[ "$result" == "latest" ]]; then
        pass "checkpoint_restore returns latest value"
    else
        fail "Expected 'latest', got '$result'"
    fi
}

# Test: Restore empty for missing
test_restore_empty() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$CHECKPOINT_SCRIPT" 2>/dev/null || { fail "Cannot source"; return; }

    local result
    result=$(checkpoint_restore "nonexistent")

    if [[ -z "$result" ]]; then
        pass "checkpoint_restore empty for missing label"
    else
        fail "Expected empty, got '$result'"
    fi
}

# Test: List shows entries
test_list_works() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$CHECKPOINT_SCRIPT" 2>/dev/null || { fail "Cannot source"; return; }

    checkpoint_save "list1" "data1"
    checkpoint_save "list2" "data2"

    local result
    result=$(checkpoint_list)

    if echo "$result" | grep -q "list1" && echo "$result" | grep -q "list2"; then
        pass "checkpoint_list shows entries"
    else
        fail "List missing entries"
    fi
}

# Test: Clear removes file
test_clear_works() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$CHECKPOINT_SCRIPT" 2>/dev/null || { fail "Cannot source"; return; }

    checkpoint_save "clear_test" "data"
    checkpoint_clear

    if [[ ! -f "$TEST_TMP/.session/checkpoints.log" ]]; then
        pass "checkpoint_clear removes file"
    else
        fail "File not removed"
    fi
}

main() {
    echo "=== Checkpoint Utility Tests ==="
    echo ""

    setup

    test_script_exists
    test_save_exists
    test_restore_exists
    test_list_exists
    test_clear_exists
    test_save_creates_file
    test_save_format
    test_restore_works
    test_restore_latest
    test_restore_empty
    test_list_works
    test_clear_works

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
