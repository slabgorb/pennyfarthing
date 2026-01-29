#!/bin/bash
# test-solo-command.sh - Tests for story 12-1: Copy /solo Command to Pennyfarthing
# Verifies the solo benchmark command is properly adapted from thunderdome
#
# RED STATE: These tests will FAIL until Dev implements the feature

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd -P)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

pass() {
    echo -e "${GREEN}PASS${NC}: $1"
    ((TESTS_PASSED++))
    ((TESTS_RUN++))
}

fail() {
    echo -e "${RED}FAIL${NC}: $1"
    echo "  Expected: $2"
    echo "  Got: $3"
    ((TESTS_FAILED++))
    ((TESTS_RUN++))
}

echo "=== Story 12-1: Copy /solo Command to Pennyfarthing ==="
echo ""

# ==============================================================================
# AC1: /solo command works in Pennyfarthing
# ==============================================================================

echo "--- AC1: /solo command works in Pennyfarthing ---"
echo ""

# Test: solo.md command file exists
test_solo_command_exists() {
    local solo_file="$PROJECT_ROOT/.claude/project/commands/solo.md"

    if [[ -f "$solo_file" ]]; then
        pass "solo.md command file exists at .claude/project/commands/"
    else
        fail "solo.md command file exists" \
             "file at .claude/project/commands/solo.md" \
             "file not found"
    fi
}

# Test: solo.md has proper frontmatter
test_solo_has_frontmatter() {
    local solo_file="$PROJECT_ROOT/.claude/project/commands/solo.md"

    if [[ ! -f "$solo_file" ]]; then
        fail "solo.md has proper frontmatter" "file exists" "file not found"
        return
    fi

    if grep -q "^---" "$solo_file" && grep -q "description:" "$solo_file"; then
        pass "solo.md has proper frontmatter (YAML with description)"
    else
        fail "solo.md has proper frontmatter" \
             "YAML frontmatter with description" \
             "missing frontmatter"
    fi
}

# Test: solo.md accepts theme:agent and --scenario arguments
test_solo_accepts_arguments() {
    local solo_file="$PROJECT_ROOT/.claude/project/commands/solo.md"

    if [[ ! -f "$solo_file" ]]; then
        fail "solo.md accepts theme:agent and --scenario" "file exists" "file not found"
        return
    fi

    local has_theme_agent has_scenario
    has_theme_agent=$(grep -c "theme:agent\|<theme:agent>\|contestant" "$solo_file" 2>/dev/null || echo "0")
    has_scenario=$(grep -c "\-\-scenario" "$solo_file" 2>/dev/null || echo "0")

    if [[ "$has_theme_agent" -gt 0 ]] && [[ "$has_scenario" -gt 0 ]]; then
        pass "solo.md accepts theme:agent and --scenario arguments"
    else
        fail "solo.md accepts theme:agent and --scenario arguments" \
             "both theme:agent spec and --scenario flag documented" \
             "theme:agent: $has_theme_agent refs, --scenario: $has_scenario refs"
    fi
}

# Test: theme path points to pennyfarthing-dist (not thunderdome)
test_theme_path_adapted() {
    local solo_file="$PROJECT_ROOT/.claude/project/commands/solo.md"

    if [[ ! -f "$solo_file" ]]; then
        fail "theme path adapted for Pennyfarthing" "file exists" "file not found"
        return
    fi

    # Should use pennyfarthing-dist path, NOT .claude/pennyfarthing
    local has_correct_path has_wrong_path
    has_correct_path=$(grep -c "pennyfarthing-dist/personas/themes" "$solo_file" 2>/dev/null | tr -d '[:space:]') || has_correct_path=0
    has_wrong_path=$(grep -c "\.claude/pennyfarthing/personas/themes" "$solo_file" 2>/dev/null | tr -d '[:space:]') || has_wrong_path=0

    if [[ "$has_correct_path" -gt 0 ]] && [[ "$has_wrong_path" -eq 0 ]]; then
        pass "theme path adapted to pennyfarthing-dist/personas/themes/"
    else
        fail "theme path adapted for Pennyfarthing" \
             "pennyfarthing-dist/personas/themes/ (not .claude/pennyfarthing/)" \
             "correct: $has_correct_path, wrong: $has_wrong_path"
    fi
}

test_solo_command_exists
test_solo_has_frontmatter
test_solo_accepts_arguments
test_theme_path_adapted

echo ""

# ==============================================================================
# AC2: Executes agent with --tools "" flag (critical for valid results)
# ==============================================================================

echo "--- AC2: --tools \"\" flag (critical for valid results) ---"
echo ""

# Test: --tools "" flag present in CLI invocation
test_tools_empty_flag() {
    local solo_file="$PROJECT_ROOT/.claude/project/commands/solo.md"

    if [[ ! -f "$solo_file" ]]; then
        fail "--tools \"\" flag present" "file exists" "file not found"
        return
    fi

    # Look for --tools "" in the claude command
    if grep -q '\-\-tools ""' "$solo_file" 2>/dev/null; then
        pass "--tools \"\" flag present in CLI invocation"
    else
        fail "--tools \"\" flag present" \
             "--tools \"\" in claude -p command" \
             "flag not found"
    fi
}

# Test: Documentation explains why --tools "" is critical
test_tools_explanation() {
    local solo_file="$PROJECT_ROOT/.claude/project/commands/solo.md"

    if [[ ! -f "$solo_file" ]]; then
        fail "--tools \"\" explanation present" "file exists" "file not found"
        return
    fi

    # Look for explanation of why --tools "" is needed
    if grep -qi "mandatory\|critical\|must\|important" "$solo_file" && \
       grep -qi "tools" "$solo_file" 2>/dev/null; then
        pass "--tools \"\" explained as critical/mandatory"
    else
        fail "--tools \"\" explanation present" \
             "explanation of why --tools \"\" is mandatory" \
             "no critical/mandatory language around tools flag"
    fi
}

test_tools_empty_flag
test_tools_explanation

echo ""

# ==============================================================================
# AC3: Saves results to internal/results/solo/
# ==============================================================================

echo "--- AC3: Saves results to internal/results/solo/ ---"
echo ""

# Test: internal/results/solo directory exists
test_results_dir_exists() {
    local results_dir="$PROJECT_ROOT/internal/results/solo"

    if [[ -d "$results_dir" ]]; then
        pass "internal/results/solo/ directory exists"
    else
        fail "internal/results/solo/ directory exists" \
             "directory at internal/results/solo/" \
             "directory not found"
    fi
}

# Test: internal/results/solo has .gitkeep
test_results_has_gitkeep() {
    local gitkeep="$PROJECT_ROOT/internal/results/solo/.gitkeep"

    if [[ -f "$gitkeep" ]]; then
        pass "internal/results/solo/.gitkeep exists"
    else
        fail "internal/results/solo/.gitkeep exists" \
             ".gitkeep file present" \
             "file not found"
    fi
}

# Test: solo.md references internal/results/solo path
test_solo_saves_to_results() {
    local solo_file="$PROJECT_ROOT/.claude/project/commands/solo.md"

    if [[ ! -f "$solo_file" ]]; then
        fail "solo.md saves to internal/results/solo" "file exists" "file not found"
        return
    fi

    if grep -q "internal/results/solo" "$solo_file" 2>/dev/null; then
        pass "solo.md references internal/results/solo/ path"
    else
        fail "solo.md saves to internal/results/solo" \
             "internal/results/solo/ in save path" \
             "no internal/results/solo/ path found"
    fi
}

test_results_dir_exists
test_results_has_gitkeep
test_solo_saves_to_results

echo ""

# ==============================================================================
# AC4: Works with all 63 persona themes
# ==============================================================================

echo "--- AC4: Works with all 63 persona themes ---"
echo ""

# Test: solo.md loads themes from pennyfarthing-dist
test_loads_persona_themes() {
    local solo_file="$PROJECT_ROOT/.claude/project/commands/solo.md"

    if [[ ! -f "$solo_file" ]]; then
        fail "solo.md loads persona themes" "file exists" "file not found"
        return
    fi

    # Should have logic to load themes
    if grep -q "themes/.*\.yaml\|{theme}\.yaml" "$solo_file" 2>/dev/null; then
        pass "solo.md loads theme from .yaml file"
    else
        fail "solo.md loads persona themes" \
             "theme loading from {theme}.yaml" \
             "no theme loading pattern found"
    fi
}

# Test: theme files exist in pennyfarthing-dist
test_theme_files_exist() {
    local themes_dir="$PROJECT_ROOT/pennyfarthing-dist/personas/themes"
    local theme_count=0

    if [[ -d "$themes_dir" ]]; then
        theme_count=$(find "$themes_dir" -name "*.yaml" -type f 2>/dev/null | wc -l | tr -d ' ')
    fi

    if [[ "$theme_count" -gt 0 ]]; then
        pass "Theme files exist in pennyfarthing-dist/personas/themes/ ($theme_count found)"
    else
        fail "Theme files exist" \
             "at least 1 theme file" \
             "$theme_count theme files found"
    fi
}

# Test: solo.md handles theme:agent format
test_theme_agent_format() {
    local solo_file="$PROJECT_ROOT/.claude/project/commands/solo.md"

    if [[ ! -f "$solo_file" ]]; then
        fail "solo.md handles theme:agent format" "file exists" "file not found"
        return
    fi

    # Should parse theme:agent into theme and agent parts
    if grep -qi "theme.*:.*agent\|spec.*contains.*:\|parse.*:" "$solo_file" 2>/dev/null; then
        pass "solo.md parses theme:agent format"
    else
        fail "solo.md handles theme:agent format" \
             "theme:agent parsing logic" \
             "no parsing pattern found"
    fi
}

test_loads_persona_themes
test_theme_files_exist
test_theme_agent_format

echo ""

# ==============================================================================
# Summary
# ==============================================================================

echo "=== Test Summary ==="
echo "Tests run: $TESTS_RUN"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"

if [[ $TESTS_FAILED -gt 0 ]]; then
    echo ""
    echo -e "${YELLOW}Story 12-1 Status: RED (tests failing - ready for Dev)${NC}"
    echo ""
    echo "Dev should implement:"
    echo "  1. Create .claude/project/commands/solo.md (AC1)"
    echo "     - Adapt from thunderdome, update theme path"
    echo "  2. Ensure --tools \"\" flag in CLI invocation (AC2)"
    echo "     - CRITICAL: prevents multi-turn contamination"
    echo "  3. Create internal/results/solo/.gitkeep (AC3)"
    echo "  4. Theme path: pennyfarthing-dist/personas/themes/{theme}.yaml (AC4)"
    exit 1
else
    echo ""
    echo -e "${GREEN}ALL TESTS PASSED - Story 12-1 Complete${NC}"
    exit 0
fi
