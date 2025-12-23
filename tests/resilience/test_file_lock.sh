#!/usr/bin/env bash
# Tests for scripts/utils/file-lock.sh

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

LOCK_SCRIPT="$PROJECT_ROOT/scripts/utils/file-lock.sh"
TEST_TMP=""
ORIG_PROJECT_ROOT="$PROJECT_ROOT"

setup() {
    TEST_TMP=$(mktemp -d)
    mkdir -p "$TEST_TMP/.session"
    export PROJECT_ROOT="$TEST_TMP"
    # Source the script after setting PROJECT_ROOT
    source "$LOCK_SCRIPT" 2>/dev/null || true
}

# Reset between tests by cleaning up locks
reset_test() {
    rm -rf "$TEST_TMP/.session/.locks"
}

cleanup() {
    export PROJECT_ROOT="$ORIG_PROJECT_ROOT"
    [[ -n "$TEST_TMP" ]] && rm -rf "$TEST_TMP"
}

trap cleanup EXIT

# Test: file-lock.sh exists and functions are defined
test_script_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ -f "$LOCK_SCRIPT" ]]; then
        pass "file-lock.sh exists"
    else
        fail "file-lock.sh does not exist"
    fi
}

# Test: lock_acquire function exists
test_acquire_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if declare -f lock_acquire > /dev/null 2>&1; then
        pass "lock_acquire function exists"
    else
        fail "lock_acquire not defined"
    fi
}

# Test: lock_release function exists
test_release_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if declare -f lock_release > /dev/null 2>&1; then
        pass "lock_release function exists"
    else
        fail "lock_release not defined"
    fi
}

# Test: with_lock function exists
test_with_lock_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if declare -f with_lock > /dev/null 2>&1; then
        pass "with_lock function exists"
    else
        fail "with_lock not defined"
    fi
}

# Test: lock_status function exists
test_status_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if declare -f lock_status > /dev/null 2>&1; then
        pass "lock_status function exists"
    else
        fail "lock_status not defined"
    fi
}

# Test: lock_cleanup function exists
test_cleanup_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if declare -f lock_cleanup > /dev/null 2>&1; then
        pass "lock_cleanup function exists"
    else
        fail "lock_cleanup not defined"
    fi
}

# Test: Acquire creates lock file
test_acquire_creates_lock() {
    TESTS_RUN=$((TESTS_RUN + 1))
    reset_test

    local target_file="$TEST_TMP/.session/test.log"

    if lock_acquire "$target_file"; then
        if [[ -f "$TEST_TMP/.session/.locks/.test.log.lock" ]]; then
            pass "lock_acquire creates lock file"
        else
            fail "lock file not created"
        fi
        lock_release "$target_file"
    else
        fail "lock_acquire failed"
    fi
}

# Test: Lock file contains PID
test_lock_contains_pid() {
    TESTS_RUN=$((TESTS_RUN + 1))
    reset_test

    local target_file="$TEST_TMP/.session/pidtest.log"

    lock_acquire "$target_file"
    local lock_content
    lock_content=$(cat "$TEST_TMP/.session/.locks/.pidtest.log.lock" 2>/dev/null)

    if [[ "$lock_content" == "$$" ]]; then
        pass "lock file contains correct PID"
    else
        fail "Expected PID $$, got '$lock_content'"
    fi

    lock_release "$target_file"
}

# Test: Release removes lock
test_release_removes_lock() {
    TESTS_RUN=$((TESTS_RUN + 1))
    reset_test

    local target_file="$TEST_TMP/.session/release.log"

    lock_acquire "$target_file"
    lock_release "$target_file"

    if [[ ! -f "$TEST_TMP/.session/.locks/.release.log.lock" ]]; then
        pass "lock_release removes lock file"
    else
        fail "lock file not removed"
    fi
}

# Test: Lock status returns 0 when locked
test_status_when_locked() {
    TESTS_RUN=$((TESTS_RUN + 1))
    reset_test

    local target_file="$TEST_TMP/.session/status.log"

    lock_acquire "$target_file"

    if lock_status "$target_file" >/dev/null 2>&1; then
        pass "lock_status returns 0 when locked"
    else
        fail "lock_status returned non-zero for locked file"
    fi

    lock_release "$target_file"
}

# Test: Lock status returns 1 when not locked
test_status_when_unlocked() {
    TESTS_RUN=$((TESTS_RUN + 1))
    reset_test

    local target_file="$TEST_TMP/.session/unlocked.log"

    if ! lock_status "$target_file" >/dev/null 2>&1; then
        pass "lock_status returns 1 when not locked"
    else
        fail "lock_status returned 0 for unlocked file"
    fi
}

# Test: with_lock executes command
test_with_lock_executes() {
    TESTS_RUN=$((TESTS_RUN + 1))
    reset_test

    local target_file="$TEST_TMP/.session/withlock.log"
    local output_file="$TEST_TMP/output.txt"

    with_lock "$target_file" "exclusive" bash -c "echo 'executed' > '$output_file'"

    if [[ -f "$output_file" ]] && grep -q "executed" "$output_file"; then
        pass "with_lock executes command"
    else
        fail "command was not executed"
    fi
}

# Test: with_lock releases lock after command
test_with_lock_releases() {
    TESTS_RUN=$((TESTS_RUN + 1))
    reset_test

    local target_file="$TEST_TMP/.session/withlockrel.log"

    with_lock "$target_file" "exclusive" true

    if ! lock_status "$target_file" >/dev/null 2>&1; then
        pass "with_lock releases lock after command"
    else
        fail "lock not released after command"
    fi
}

# Test: Lock timeout works
test_lock_timeout() {
    TESTS_RUN=$((TESTS_RUN + 1))
    reset_test

    local target_file="$TEST_TMP/.session/timeout.log"

    # Create a lock manually (simulating another process)
    mkdir -p "$TEST_TMP/.session/.locks"
    echo "99999" > "$TEST_TMP/.session/.locks/.timeout.log.lock"

    # Try to acquire with 1 second timeout
    local start_time end_time elapsed
    start_time=$(date +%s)

    if ! lock_acquire "$target_file" "exclusive" 1 2>/dev/null; then
        end_time=$(date +%s)
        elapsed=$((end_time - start_time))

        if ((elapsed >= 1 && elapsed <= 3)); then
            pass "lock timeout works (took ${elapsed}s)"
        else
            fail "timeout duration incorrect (took ${elapsed}s)"
        fi
    else
        fail "lock_acquire should have failed due to timeout"
        lock_release "$target_file"
    fi

    # Cleanup
    rm -f "$TEST_TMP/.session/.locks/.timeout.log.lock"
}

# Test: Stale lock detection
test_stale_lock_removed() {
    TESTS_RUN=$((TESTS_RUN + 1))
    reset_test

    local target_file="$TEST_TMP/.session/stale.log"
    local lockfile="$TEST_TMP/.session/.locks/.stale.log.lock"

    # Create a lock file
    mkdir -p "$TEST_TMP/.session/.locks"
    echo "99999" > "$lockfile"

    # Make it appear old (touch with old timestamp)
    # macOS: touch -t YYYYMMDDhhmm
    touch -t 202001010000 "$lockfile"

    # Override threshold for testing (set to 1 second)
    STALE_LOCK_THRESHOLD=1

    # Try to acquire - should succeed after removing stale lock
    if lock_acquire "$target_file" "exclusive" 2 2>/dev/null; then
        pass "stale lock was removed and new lock acquired"
        lock_release "$target_file"
    else
        fail "could not acquire lock after stale lock"
    fi
}

main() {
    echo "=== File Lock Utility Tests ==="
    echo ""

    setup

    test_script_exists
    test_acquire_exists
    test_release_exists
    test_with_lock_exists
    test_status_exists
    test_cleanup_exists
    test_acquire_creates_lock
    test_lock_contains_pid
    test_release_removes_lock
    test_status_when_locked
    test_status_when_unlocked
    test_with_lock_executes
    test_with_lock_releases
    test_lock_timeout
    test_stale_lock_removed

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
