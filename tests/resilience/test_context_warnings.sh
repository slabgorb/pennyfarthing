#!/usr/bin/env zsh
# Tests for context warning functionality in scripts/check-context.sh

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

CHECK_SCRIPT="$PROJECT_ROOT/scripts/check-context.sh"
SETTINGS_TEMPLATE="$PROJECT_ROOT/pennyfarthing-dist/templates/settings.local.json.template"

# Temp directory for test config files
TEST_TMP=""

setup_test_config() {
    TEST_TMP=$(mktemp -d)
    mkdir -p "$TEST_TMP/.claude"
}

cleanup_test_config() {
    if [[ -n "$TEST_TMP" && -d "$TEST_TMP" ]]; then
        rm -rf "$TEST_TMP"
    fi
}

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

# ============================================================================
# Configuration Tests (Story 4-2)
# ============================================================================

# Test: Settings template contains context_budget section
test_template_has_context_budget() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if grep -q '"context_budget"' "$SETTINGS_TEMPLATE"; then
        pass "Template has context_budget section"
    else
        fail "Template lacks context_budget section"
    fi
}

# Test: context_budget has warning_threshold field
test_template_has_warning_threshold() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if grep -q '"warning_threshold"' "$SETTINGS_TEMPLATE"; then
        pass "Template has warning_threshold field"
    else
        fail "Template lacks warning_threshold field"
    fi
}

# Test: context_budget has critical_threshold field
test_template_has_critical_threshold() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if grep -q '"critical_threshold"' "$SETTINGS_TEMPLATE"; then
        pass "Template has critical_threshold field"
    else
        fail "Template lacks critical_threshold field"
    fi
}

# Test: context_budget has max_tokens field
test_template_has_max_tokens() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if grep -q '"max_tokens"' "$SETTINGS_TEMPLATE"; then
        pass "Template has max_tokens field"
    else
        fail "Template lacks max_tokens field"
    fi
}

# Test: Script can read config from CLAUDE_PROJECT_DIR
test_script_reads_config_path() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # Script should reference settings.local.json for config
    if grep -qE 'settings\.local\.json|CLAUDE_PROJECT_DIR.*settings' "$CHECK_SCRIPT"; then
        pass "Script reads config from settings.local.json"
    else
        fail "Script does not reference settings.local.json config"
    fi
}

# Test: Script has fallback default for warning threshold
test_script_has_warning_default() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # Script should have a default warning threshold (70) for fallback
    if grep -qE 'warning.*=.*70|warning_threshold.*70|DEFAULT.*WARN.*70' "$CHECK_SCRIPT"; then
        pass "Script has default warning threshold (70)"
    else
        fail "Script lacks default warning threshold fallback"
    fi
}

# Test: Script has fallback default for critical threshold
test_script_has_critical_default() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # Script should have a default critical threshold (85) for fallback
    if grep -qE 'critical.*=.*85|critical_threshold.*85|DEFAULT.*CRIT.*85' "$CHECK_SCRIPT"; then
        pass "Script has default critical threshold (85)"
    else
        fail "Script lacks default critical threshold fallback"
    fi
}

# Test: Script uses configurable threshold for status (not hardcoded comparison)
test_script_uses_configurable_warning() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # Script should use a variable for warning comparison, not hardcoded 70
    # Look for pattern like: pct > warning_threshold or pct > $WARNING
    if grep -qE 'pct\s*>\s*warning|pct\s*>\s*\$|CONTEXT_PERCENT.*-ge.*\$' "$CHECK_SCRIPT"; then
        pass "Script uses configurable warning threshold"
    else
        fail "Script does not use configurable warning threshold (still hardcoded)"
    fi
}

# Test: Script uses configurable threshold for critical (not hardcoded comparison)
test_script_uses_configurable_critical() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # Script should use a variable for critical comparison, not hardcoded 90
    if grep -qE 'pct\s*>\s*critical|pct\s*>=?\s*\$|CONTEXT_PERCENT.*-ge.*\$.*CRIT' "$CHECK_SCRIPT"; then
        pass "Script uses configurable critical threshold"
    else
        fail "Script does not use configurable critical threshold (still hardcoded)"
    fi
}

main() {
    echo "=== Context Warning Tests ==="
    echo ""

    # Core functionality tests
    echo "--- Core Functionality ---"
    test_script_exists
    test_script_executable
    test_human_flag
    test_warning_output
    test_recommendation
    test_clean_exit

    # Configuration tests (Story 4-2)
    echo ""
    echo "--- Configuration (Story 4-2) ---"
    test_template_has_context_budget
    test_template_has_warning_threshold
    test_template_has_critical_threshold
    test_template_has_max_tokens
    test_script_reads_config_path
    test_script_has_warning_default
    test_script_has_critical_default
    test_script_uses_configurable_warning
    test_script_uses_configurable_critical

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
