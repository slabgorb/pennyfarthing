#!/usr/bin/env zsh
# Tests for script isolation (Story 4-6)
# Verifies that Pennyfarthing scripts are namespaced under .claude/pennyfarthing/scripts/
# and don't squat on the project root /scripts/ directory

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

SETTINGS_TEMPLATE="$PROJECT_ROOT/pennyfarthing-dist/templates/settings.local.json.template"
RUN_SCRIPT="$PROJECT_ROOT/pennyfarthing-dist/scripts/run.sh"
INIT_TS="$PROJECT_ROOT/src/cli/commands/init.ts"
UPDATE_TS="$PROJECT_ROOT/src/cli/commands/update.ts"

# ============================================================================
# AC1 & AC2: Settings template uses namespaced script paths
# ============================================================================

# Test: SessionStart hook uses namespaced path
test_session_hook_namespaced() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # Hook should reference .claude/pennyfarthing/scripts/ not /scripts/
    if grep -qE '\.claude/pennyfarthing/scripts/hooks/session-start\.sh' "$SETTINGS_TEMPLATE"; then
        pass "SessionStart hook uses namespaced path"
    else
        fail "SessionStart hook does not use .claude/pennyfarthing/scripts/ path"
    fi
}

# Test: Template does NOT have hooks referencing bare /scripts/
test_no_bare_scripts_in_hooks() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # Should NOT have patterns like "/scripts/hooks/" without .claude/pennyfarthing prefix
    if grep -qE '"\$CLAUDE_PROJECT_DIR"/scripts/hooks/' "$SETTINGS_TEMPLATE"; then
        fail "Template still has hooks referencing bare /scripts/ directory"
    else
        pass "Template hooks don't reference bare /scripts/ directory"
    fi
}

# ============================================================================
# AC5: Existing functionality preserved - run.sh uses namespaced paths
# ============================================================================

# Test: run.sh looks for scripts in .claude/pennyfarthing/scripts/
test_run_sh_namespaced_lookup() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if grep -qE '\.claude/pennyfarthing/scripts/' "$RUN_SCRIPT"; then
        pass "run.sh looks for scripts in .claude/pennyfarthing/scripts/"
    else
        fail "run.sh does not use .claude/pennyfarthing/scripts/ lookup path"
    fi
}

# Test: run.sh does NOT use bare PROJECT_ROOT/scripts/ lookup
test_run_sh_no_bare_scripts() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # Should NOT have patterns like $PROJECT_ROOT/scripts/$SCRIPT_NAME
    if grep -qE '\$PROJECT_ROOT/scripts/\$SCRIPT_NAME' "$RUN_SCRIPT"; then
        fail "run.sh still uses bare \$PROJECT_ROOT/scripts/ lookup"
    else
        pass "run.sh doesn't use bare \$PROJECT_ROOT/scripts/ lookup"
    fi
}

# ============================================================================
# AC4: End users can use /scripts/ for their own project scripts
# ============================================================================

# Test: init.ts does NOT create scripts symlink at project root
test_init_no_scripts_symlink() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # init.ts should NOT have a symlink entry for { link: 'scripts' }
    if grep -qE "link:\s*['\"]scripts['\"]" "$INIT_TS"; then
        fail "init.ts still creates scripts symlink at project root"
    else
        pass "init.ts does not create scripts symlink at project root"
    fi
}

# ============================================================================
# AC3: pennyfarthing update removes legacy /scripts symlinks
# ============================================================================

# Test: update.ts has migration code for legacy scripts symlink
test_update_has_scripts_migration() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # update.ts should have code to remove/migrate the legacy scripts symlink
    if grep -qiE 'scripts.*symlink|legacy.*scripts|remove.*scripts' "$UPDATE_TS"; then
        pass "update.ts has scripts symlink migration code"
    else
        fail "update.ts lacks scripts symlink migration code"
    fi
}

# ============================================================================
# Additional: Verify scripts are installed to correct location
# ============================================================================

# Test: Scripts are installed to .claude/pennyfarthing/scripts/
test_scripts_install_location() {
    TESTS_RUN=$((TESTS_RUN + 1))
    # init.ts should copy scripts to .claude/pennyfarthing/scripts
    if grep -qE "dest:\s*['\"]\.claude/pennyfarthing/scripts['\"]" "$INIT_TS"; then
        pass "Scripts installed to .claude/pennyfarthing/scripts/"
    else
        fail "Scripts not installed to .claude/pennyfarthing/scripts/"
    fi
}

main() {
    echo "=== Script Isolation Tests (Story 4-6) ==="
    echo ""

    # AC1 & AC2: Settings template tests
    echo "--- Settings Template (AC1, AC2) ---"
    test_session_hook_namespaced
    test_no_bare_scripts_in_hooks

    # AC5: run.sh functionality
    echo ""
    echo "--- run.sh Script Lookup (AC5) ---"
    test_run_sh_namespaced_lookup
    test_run_sh_no_bare_scripts

    # AC4: No scripts symlink creation
    echo ""
    echo "--- init.ts Symlink (AC4) ---"
    test_init_no_scripts_symlink
    test_scripts_install_location

    # AC3: Update migration
    echo ""
    echo "--- update.ts Migration (AC3) ---"
    test_update_has_scripts_migration

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
