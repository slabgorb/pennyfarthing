#!/usr/bin/env bash
# test_tmux_dev_wheelhub_resilience.sh
#
# Story 136-22: tmux-dev WheelHub launch crashes script — pipefail propagates non-zero exit
#
# Tests verify that tmux-dev continues creating a tmux session even when
# WheelHub fails to start. Written in RED phase — these tests will fail
# until the template is fixed to handle WheelHub failures gracefully.
#
# Run: ./tests/unit/test_tmux_dev_wheelhub_resilience.sh
# From: pennyfarthing/

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Script under test
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE="$SCRIPT_DIR/pennyfarthing-dist/templates/tmux-dev.template"

TEST_TMPDIR=""
MOCK_BIN=""
TMUX_LOG=""

# =============================================================================
# Test Framework
# =============================================================================

setup() {
    TEST_TMPDIR=$(mktemp -d)
    MOCK_BIN="$TEST_TMPDIR/bin"
    TMUX_LOG="$TEST_TMPDIR/tmux.log"
    mkdir -p "$MOCK_BIN"

    # Working directory that simulates a consumer project
    local work_dir="$TEST_TMPDIR/work"
    mkdir -p "$work_dir"

    # Copy template to work dir so SCRIPT_DIR-relative config lookup works
    cp "$TEMPLATE" "$work_dir/tmux-dev"
    chmod +x "$work_dir/tmux-dev"

    # Create the tmux config file the script needs (vert for default bottom layout)
    touch "$work_dir/tmux.conf.vert"

    # Mock tmux — record calls, simulate expected responses
    cat > "$MOCK_BIN/tmux" << 'MOCK'
#!/usr/bin/env bash
echo "tmux $*" >> "${TMUX_LOG}"
# has-session: no existing sessions
if [[ "${*}" == *"has-session"* ]]; then
    exit 1
fi
# attach: return immediately (don't block)
if [[ "${*}" == *"attach"* ]]; then
    exit 0
fi
# Everything else succeeds
exit 0
MOCK
    chmod +x "$MOCK_BIN/tmux"

    # Mock tput — return fixed terminal dimensions
    cat > "$MOCK_BIN/tput" << 'MOCK'
#!/usr/bin/env bash
case "$1" in
    cols) echo "120" ;;
    lines) echo "40" ;;
esac
MOCK
    chmod +x "$MOCK_BIN/tput"

    # Mock sleep — no-op for fast tests
    cat > "$MOCK_BIN/sleep" << 'MOCK'
#!/usr/bin/env bash
exit 0
MOCK
    chmod +x "$MOCK_BIN/sleep"

    export TMUX_LOG
}

teardown() {
    rm -rf "$TEST_TMPDIR"
    unset TMUX_LOG
}

# Create mock just where `just wheelhub` fails (no port file ever created)
create_failing_wheelhub() {
    cat > "$MOCK_BIN/just" << 'MOCK'
#!/usr/bin/env bash
if [[ "${1:-}" == "wheelhub" ]]; then
    exit 1
fi
exit 0
MOCK
    chmod +x "$MOCK_BIN/just"
}

# Create mock just where `just wheelhub` succeeds (creates port file immediately)
create_succeeding_wheelhub() {
    local project_dir="$1"
    cat > "$MOCK_BIN/just" << MOCK
#!/usr/bin/env bash
if [[ "\${1:-}" == "wheelhub" ]]; then
    echo "8080" > "$project_dir/.bikerack-port"
    exit 0
fi
exit 0
MOCK
    chmod +x "$MOCK_BIN/just"
}

run_tmux_dev() {
    local work_dir="$TEST_TMPDIR/work"
    # Run with mocked PATH, passing project dir as argument
    env PATH="$MOCK_BIN:$PATH" \
        TMUX_LOG="$TMUX_LOG" \
        bash "$work_dir/tmux-dev" bottom 50 "$work_dir" \
        >"$TEST_TMPDIR/stdout.log" 2>"$TEST_TMPDIR/stderr.log"
    return $?
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local message="${3:-Output should contain expected text}"
    if [[ "$haystack" == *"$needle"* ]]; then
        return 0
    else
        echo -e "${RED}FAIL${NC}: $message"
        echo "  Expected to contain: $needle"
        echo "  Actual: $haystack"
        return 1
    fi
}

assert_not_contains() {
    local haystack="$1"
    local needle="$2"
    local message="${3:-Output should not contain text}"
    if [[ "$haystack" != *"$needle"* ]]; then
        return 0
    else
        echo -e "${RED}FAIL${NC}: $message"
        echo "  Should not contain: $needle"
        echo "  Actual: $haystack"
        return 1
    fi
}

assert_exit_code() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Exit code should match}"
    if [[ "$expected" == "$actual" ]]; then
        return 0
    else
        echo -e "${RED}FAIL${NC}: $message"
        echo "  Expected exit code: $expected"
        echo "  Actual exit code:   $actual"
        return 1
    fi
}

run_test() {
    local test_name="$1"
    local test_func="$2"
    TESTS_RUN=$((TESTS_RUN + 1))
    echo -n "  $test_name... "
    setup
    if $test_func; then
        echo -e "${GREEN}PASS${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    teardown
}

# =============================================================================
# AC1: WheelHub launch failure does not kill tmux-dev script
# =============================================================================

test_ac1_exits_zero_on_wheelhub_failure() {
    create_failing_wheelhub

    run_tmux_dev
    local exit_code=$?

    assert_exit_code "0" "$exit_code" \
        "Script should exit 0 even when WheelHub fails to start"
}

test_ac1_does_not_exit_early() {
    create_failing_wheelhub

    run_tmux_dev || true

    # tmux attach is the last command — if it ran, script didn't exit early
    local tmux_log
    tmux_log=$(cat "$TMUX_LOG" 2>/dev/null || echo "")

    assert_contains "$tmux_log" "attach" \
        "Script should reach tmux attach even when WheelHub fails"
}

# =============================================================================
# AC2: Script continues to create tmux session even without WheelHub
# =============================================================================

test_ac2_creates_tmux_session_without_wheelhub() {
    create_failing_wheelhub

    run_tmux_dev || true

    local tmux_log
    tmux_log=$(cat "$TMUX_LOG" 2>/dev/null || echo "")

    assert_contains "$tmux_log" "new-session" \
        "tmux new-session should be called even when WheelHub fails"
}

test_ac2_sends_claude_command_without_wheelhub() {
    create_failing_wheelhub

    run_tmux_dev || true

    local tmux_log
    tmux_log=$(cat "$TMUX_LOG" 2>/dev/null || echo "")

    assert_contains "$tmux_log" "just claude" \
        "Should send 'just claude' to tmux pane even when WheelHub fails"
}

test_ac2_creates_tui_pane_without_wheelhub() {
    create_failing_wheelhub

    run_tmux_dev || true

    local tmux_log
    tmux_log=$(cat "$TMUX_LOG" 2>/dev/null || echo "")

    assert_contains "$tmux_log" "split-window" \
        "Should create split-window for TUI pane even when WheelHub fails"
}

# =============================================================================
# AC3: Warning message is shown when WheelHub fails to start
# =============================================================================

test_ac3_shows_warning_on_failure() {
    create_failing_wheelhub

    run_tmux_dev || true

    local stderr
    stderr=$(cat "$TEST_TMPDIR/stderr.log" 2>/dev/null || echo "")

    assert_contains "$stderr" "Warning" \
        "Should show Warning (not Error) when WheelHub fails to start"
}

test_ac3_warning_mentions_wheelhub() {
    create_failing_wheelhub

    run_tmux_dev || true

    local stderr
    stderr=$(cat "$TEST_TMPDIR/stderr.log" 2>/dev/null || echo "")

    assert_contains "$stderr" "WheelHub" \
        "Warning message should mention WheelHub"
}

test_ac3_no_warning_on_success() {
    local work_dir="$TEST_TMPDIR/work"
    create_succeeding_wheelhub "$work_dir"

    run_tmux_dev || true

    local stderr
    stderr=$(cat "$TEST_TMPDIR/stderr.log" 2>/dev/null || echo "")

    assert_not_contains "$stderr" "Warning" \
        "Should not show warning when WheelHub starts successfully"
}

# =============================================================================
# AC4: tmux-dev works from fresh terminal (basic sanity)
# =============================================================================

test_ac4_works_with_successful_wheelhub() {
    local work_dir="$TEST_TMPDIR/work"
    create_succeeding_wheelhub "$work_dir"

    run_tmux_dev
    local exit_code=$?

    assert_exit_code "0" "$exit_code" \
        "Script should exit 0 when WheelHub starts successfully"
}

test_ac4_creates_session_with_successful_wheelhub() {
    local work_dir="$TEST_TMPDIR/work"
    create_succeeding_wheelhub "$work_dir"

    run_tmux_dev || true

    local tmux_log
    tmux_log=$(cat "$TMUX_LOG" 2>/dev/null || echo "")

    assert_contains "$tmux_log" "new-session" \
        "tmux new-session should be called when WheelHub succeeds"
}

# =============================================================================
# Edge Cases
# =============================================================================

test_edge_cleans_up_background_process_on_failure() {
    create_failing_wheelhub

    run_tmux_dev || true

    # The background WheelHub process should not be left orphaned.
    # We verify by checking that no mock `just` processes are still running.
    # (In the mock environment this is trivially true since mock exits immediately,
    # but the test documents the expected behavior.)
    local orphans
    orphans="$(pgrep -f "just wheelhub" 2>/dev/null | wc -l | tr -d ' ')"
    orphans="${orphans:-0}"

    if [[ "$orphans" -eq 0 ]]; then
        return 0
    else
        echo -e "${RED}FAIL${NC}: WheelHub background process should be cleaned up"
        return 1
    fi
}

# =============================================================================
# Run All Tests
# =============================================================================

echo ""
echo "=============================================="
echo "Story 136-22: tmux-dev WheelHub Resilience"
echo "=============================================="
echo ""

echo "AC1: WheelHub launch failure does not kill tmux-dev script"
run_test "exits zero on WheelHub failure" test_ac1_exits_zero_on_wheelhub_failure
run_test "does not exit early" test_ac1_does_not_exit_early

echo ""
echo "AC2: Script continues to create tmux session even without WheelHub"
run_test "creates tmux session without WheelHub" test_ac2_creates_tmux_session_without_wheelhub
run_test "sends claude command without WheelHub" test_ac2_sends_claude_command_without_wheelhub
run_test "creates TUI pane without WheelHub" test_ac2_creates_tui_pane_without_wheelhub

echo ""
echo "AC3: Warning message is shown when WheelHub fails to start"
run_test "shows warning on failure" test_ac3_shows_warning_on_failure
run_test "warning mentions WheelHub" test_ac3_warning_mentions_wheelhub
run_test "no warning on success" test_ac3_no_warning_on_success

echo ""
echo "AC4: tmux-dev works with successful WheelHub"
run_test "exits zero with successful WheelHub" test_ac4_works_with_successful_wheelhub
run_test "creates session with successful WheelHub" test_ac4_creates_session_with_successful_wheelhub

echo ""
echo "Edge Cases"
run_test "cleans up background process on failure" test_edge_cleans_up_background_process_on_failure

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "=============================================="
echo "Test Summary"
echo "=============================================="
echo -e "Tests run:    $TESTS_RUN"
echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [[ $TESTS_FAILED -gt 0 ]]; then
    echo -e "${RED}FAILED${NC} - $TESTS_FAILED test(s) failed"
    exit 1
else
    echo -e "${GREEN}PASSED${NC} - All tests passed"
    exit 0
fi
