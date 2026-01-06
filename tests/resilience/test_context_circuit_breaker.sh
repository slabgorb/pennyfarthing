#!/usr/bin/env zsh
# Tests for context circuit breaker (Story 3-3)
# Tests that the hook blocks tool execution at 85% context usage

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

CIRCUIT_BREAKER_HOOK="$PROJECT_ROOT/pennyfarthing-dist/scripts/hooks/context-circuit-breaker.sh"
SETTINGS_TEMPLATE="$PROJECT_ROOT/pennyfarthing-dist/templates/settings.local.json.template"

# ============================================================================
# AC1: Circuit breaker triggers at 85% context usage
# ============================================================================

# Test: Hook script exists
test_hook_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ -f "$CIRCUIT_BREAKER_HOOK" ]]; then
        pass "context-circuit-breaker.sh exists"
    else
        fail "context-circuit-breaker.sh does not exist at $CIRCUIT_BREAKER_HOOK"
    fi
}

# Test: Hook is executable
test_hook_executable() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ -x "$CIRCUIT_BREAKER_HOOK" ]]; then
        pass "context-circuit-breaker.sh is executable"
    else
        fail "context-circuit-breaker.sh is not executable"
    fi
}

# Test: Hook registered in settings template
test_hook_registered_in_template() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if grep -q 'context-circuit-breaker.sh' "$SETTINGS_TEMPLATE"; then
        pass "Hook registered in settings template"
    else
        fail "Hook not registered in settings.local.json.template"
    fi
}

# Test: Hook uses Edit|Write|Bash|Task matcher
test_hook_has_correct_matcher() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # The circuit breaker should be registered with same matcher as context-warning.sh
    # Check that a PreToolUse entry with circuit-breaker uses the Edit|Write|Bash|Task pattern
    if grep -B5 'context-circuit-breaker.sh' "$SETTINGS_TEMPLATE" | grep -q 'Edit|Write|Bash|Task'; then
        pass "Hook registered with Edit|Write|Bash|Task matcher"
    else
        fail "Hook not registered with correct matcher (Edit|Write|Bash|Task)"
    fi
}

# Test: Hook exits 2 when should block (>=85%)
test_hook_exits_2_when_blocking() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # We look for the exit 2 pattern in the hook
    if [[ -f "$CIRCUIT_BREAKER_HOOK" ]] && grep -q 'exit 2' "$CIRCUIT_BREAKER_HOOK"; then
        pass "Hook can exit 2 to block tool execution"
    else
        fail "Hook lacks 'exit 2' for blocking behavior"
    fi
}

# Test: Hook exits 0 when should allow (<85%)
test_hook_exits_0_when_allowing() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # We look for exit 0 pattern in the hook (allow path)
    if [[ -f "$CIRCUIT_BREAKER_HOOK" ]] && grep -q 'exit 0' "$CIRCUIT_BREAKER_HOOK"; then
        pass "Hook can exit 0 to allow tool execution"
    else
        fail "Hook lacks 'exit 0' for allowing behavior"
    fi
}

# Test: Hook checks for 85% threshold
test_hook_checks_85_threshold() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # Hook should reference 85 or CRITICAL_THRESHOLD
    if [[ -f "$CIRCUIT_BREAKER_HOOK" ]] && grep -qE '85|CRITICAL_THRESHOLD' "$CIRCUIT_BREAKER_HOOK"; then
        pass "Hook checks 85% or CRITICAL_THRESHOLD"
    else
        fail "Hook does not reference 85% threshold"
    fi
}

# Test: Hook calls check-context.sh
test_hook_calls_check_context() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ -f "$CIRCUIT_BREAKER_HOOK" ]] && grep -q 'check-context.sh' "$CIRCUIT_BREAKER_HOOK"; then
        pass "Hook calls check-context.sh"
    else
        fail "Hook does not call check-context.sh"
    fi
}

# ============================================================================
# AC2: Checkpoint saved before break
# ============================================================================

# Test: Error message instructs to run checkpoint_save
test_message_has_checkpoint_save() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ -f "$CIRCUIT_BREAKER_HOOK" ]] && grep -q 'checkpoint_save' "$CIRCUIT_BREAKER_HOOK"; then
        pass "Error message instructs to run checkpoint_save"
    else
        fail "Error message lacks checkpoint_save instruction"
    fi
}

# Test: Checkpoint instruction includes phase placeholder
test_message_has_phase_placeholder() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # Should have checkpoint_save "{phase}" or similar
    if [[ -f "$CIRCUIT_BREAKER_HOOK" ]] && grep -qE 'checkpoint_save.*phase' "$CIRCUIT_BREAKER_HOOK"; then
        pass "Checkpoint instruction includes phase"
    else
        fail "Checkpoint instruction lacks phase placeholder"
    fi
}

# Test: Checkpoint instruction includes work_summary placeholder
test_message_has_summary_placeholder() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # Should have checkpoint_save that mentions summary
    if [[ -f "$CIRCUIT_BREAKER_HOOK" ]] && grep -qE 'checkpoint_save.*summary|work_summary' "$CIRCUIT_BREAKER_HOOK"; then
        pass "Checkpoint instruction includes summary"
    else
        fail "Checkpoint instruction lacks summary placeholder"
    fi
}

# ============================================================================
# AC3: Clear instructions for resumption
# ============================================================================

# Test: Error message has circuit breaker header
test_message_has_header() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ -f "$CIRCUIT_BREAKER_HOOK" ]] && grep -q 'CONTEXT CIRCUIT BREAKER TRIGGERED' "$CIRCUIT_BREAKER_HOOK"; then
        pass "Error message has CONTEXT CIRCUIT BREAKER TRIGGERED header"
    else
        fail "Error message lacks header"
    fi
}

# Test: Error message lists required actions
test_message_has_required_actions() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ -f "$CIRCUIT_BREAKER_HOOK" ]] && grep -qE 'Required actions|Required:|1\.' "$CIRCUIT_BREAKER_HOOK"; then
        pass "Error message lists required actions"
    else
        fail "Error message lacks required actions list"
    fi
}

# Test: Error message mentions /continue-session
test_message_mentions_continue_session() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ -f "$CIRCUIT_BREAKER_HOOK" ]] && grep -q 'continue-session' "$CIRCUIT_BREAKER_HOOK"; then
        pass "Error message references /continue-session"
    else
        fail "Error message lacks /continue-session reference"
    fi
}

# Test: Error message says DO NOT attempt further tool calls
test_message_has_hard_stop() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ -f "$CIRCUIT_BREAKER_HOOK" ]] && grep -qE 'DO NOT|hard stop|BLOCKED' "$CIRCUIT_BREAKER_HOOK"; then
        pass "Error message emphasizes hard stop"
    else
        fail "Error message lacks hard stop emphasis"
    fi
}

# Test: Error message mentions session file update
test_message_mentions_session_update() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ -f "$CIRCUIT_BREAKER_HOOK" ]] && grep -qE 'session file|Update session' "$CIRCUIT_BREAKER_HOOK"; then
        pass "Error message mentions session file update"
    else
        fail "Error message lacks session file update instruction"
    fi
}

# Test: Error message mentions commit pending changes
test_message_mentions_commit() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ -f "$CIRCUIT_BREAKER_HOOK" ]] && grep -qE 'commit|Commit' "$CIRCUIT_BREAKER_HOOK"; then
        pass "Error message mentions commit"
    else
        fail "Error message lacks commit instruction"
    fi
}

# Test: Error message shows current percentage
test_message_shows_percentage() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # Should show ${PERCENT} or similar variable for percentage
    if [[ -f "$CIRCUIT_BREAKER_HOOK" ]] && grep -qE '\$.*PERCENT|Context usage' "$CIRCUIT_BREAKER_HOOK"; then
        pass "Error message shows context percentage"
    else
        fail "Error message lacks percentage display"
    fi
}

# ============================================================================
# Edge Case Tests
# ============================================================================

# Test: Hook handles check-context.sh failure gracefully
test_graceful_degradation() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # If check-context.sh fails, hook should exit 0 (allow) not crash
    if [[ -f "$CIRCUIT_BREAKER_HOOK" ]] && grep -qE 'exit 0.*#.*fail|fail.*exit 0|graceful|fallback' "$CIRCUIT_BREAKER_HOOK"; then
        pass "Hook has graceful degradation on check-context.sh failure"
    else
        fail "Hook lacks graceful degradation pattern"
    fi
}

# Test: Hook consumes stdin (required by hook protocol)
test_consumes_stdin() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # PreToolUse hooks receive JSON on stdin and must consume it
    if [[ -f "$CIRCUIT_BREAKER_HOOK" ]] && grep -qE 'cat|read.*stdin|< /dev/null' "$CIRCUIT_BREAKER_HOOK"; then
        pass "Hook consumes stdin"
    else
        fail "Hook does not consume stdin (required by hook protocol)"
    fi
}

# ============================================================================
# Main
# ============================================================================

main() {
    echo "=== Context Circuit Breaker Tests (Story 3-3) ==="
    echo ""

    echo "--- AC1: Circuit Breaker Triggers at 85% ---"
    test_hook_exists
    test_hook_executable
    test_hook_registered_in_template
    test_hook_has_correct_matcher
    test_hook_exits_2_when_blocking
    test_hook_exits_0_when_allowing
    test_hook_checks_85_threshold
    test_hook_calls_check_context

    echo ""
    echo "--- AC2: Checkpoint Saved Before Break ---"
    test_message_has_checkpoint_save
    test_message_has_phase_placeholder
    test_message_has_summary_placeholder

    echo ""
    echo "--- AC3: Clear Instructions for Resumption ---"
    test_message_has_header
    test_message_has_required_actions
    test_message_mentions_continue_session
    test_message_has_hard_stop
    test_message_mentions_session_update
    test_message_mentions_commit
    test_message_shows_percentage

    echo ""
    echo "--- Edge Cases ---"
    test_graceful_degradation
    test_consumes_stdin

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
