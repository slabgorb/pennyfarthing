#!/usr/bin/env bash
# check.sh - Quality gate runner for pre-handoff verification
#
# Story 21-1: /check command with dev-handoff integration
#
# Usage: ./scripts/check.sh [OPTIONS]
#
# Options:
#   --skip-check       Skip all checks (emergency bypass)
#   --tests-only       Run only tests, skip lint and typecheck
#   --filter PATTERN   Filter tests by pattern (passed to test runner)
#   --repo REPO        Run checks in specific repo subdirectory
#   --no-lint          Skip lint check
#   --no-typecheck     Skip type check
#   --fast             Skip slow packages (cyclist/Electron) for rapid iteration
#
# Runs lint, type check, and tests. Reports pass/fail status.
# Returns exit code 0 on all passing, non-zero on any failure.

set -uo pipefail

# Parse arguments
SKIP_CHECK=false
TESTS_ONLY=false
TEST_FILTER=""
TARGET_REPO=""
NO_LINT=false
NO_TYPECHECK=false
FAST_MODE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-check)
            SKIP_CHECK=true
            shift
            ;;
        --tests-only)
            TESTS_ONLY=true
            shift
            ;;
        --filter)
            TEST_FILTER="$2"
            shift 2
            ;;
        --repo)
            TARGET_REPO="$2"
            shift 2
            ;;
        --no-lint)
            NO_LINT=true
            shift
            ;;
        --no-typecheck)
            NO_TYPECHECK=true
            shift
            ;;
        --fast)
            FAST_MODE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: check.sh [--skip-check] [--tests-only] [--filter PATTERN] [--repo REPO] [--no-lint] [--no-typecheck] [--fast]"
            exit 1
            ;;
    esac
done

# Handle --skip-check flag
if $SKIP_CHECK; then
    echo "Quality checks skipped by --skip-check flag"
    echo ""
    echo "WARNING: Skipping checks is for emergencies only."
    echo "Ensure checks pass before merging PR."
    exit 0
fi

# Handle --tests-only (implies no-lint and no-typecheck)
if $TESTS_ONLY; then
    NO_LINT=true
    NO_TYPECHECK=true
fi

# Colors (if terminal supports them)
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    CYAN='\033[0;36m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    CYAN=''
    NC=''
fi

# Counters
CHECKS_RUN=0
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_SKIPPED=0

# Find project root
find_project_root() {
    local dir="$PWD"
    while [[ ! -d "$dir/.claude" ]] && [[ "$dir" != "/" ]]; do
        dir="$(dirname "$dir")"
    done
    if [[ -d "$dir/.claude" ]]; then
        echo "$dir"
    else
        echo "$PWD"  # Fall back to current directory
    fi
}

PROJECT_ROOT="$(find_project_root)"

# Load repo configuration if available (repo-utils.sh is zsh, call via zsh subshell)
REPO_UTILS="$PROJECT_ROOT/.claude/scripts/repo-utils.sh"
REPO_CONFIG_AVAILABLE=false
if [[ -f "$REPO_UTILS" ]] && command -v zsh &>/dev/null; then
    REPO_CONFIG_AVAILABLE=true
fi

# Helper to call repo-utils functions via zsh
repo_util() {
    local func="$1"
    shift
    if $REPO_CONFIG_AVAILABLE; then
        zsh -c "source '$REPO_UTILS' && $func $*" 2>/dev/null || echo ""
    else
        echo ""
    fi
}

# Handle --repo: change to repo subdirectory and load config
if [[ -n "$TARGET_REPO" ]]; then
    if $REPO_CONFIG_AVAILABLE; then
        # Check if repo exists in config
        REPO_EXISTS=$(repo_util "repo_exists '$TARGET_REPO' && echo yes || echo no")
        if [[ "$REPO_EXISTS" == "yes" ]]; then
            # Use repo config for path
            REPO_PATH_FROM_CONFIG=$(repo_util "get_repo_path '$TARGET_REPO'")
            if [[ "$REPO_PATH_FROM_CONFIG" == "." ]]; then
                REPO_PATH="$PROJECT_ROOT"
            else
                REPO_PATH="$PROJECT_ROOT/$REPO_PATH_FROM_CONFIG"
            fi
            # Get commands from config
            REPO_LINT_CMD=$(repo_util "get_lint_command '$TARGET_REPO'")
            REPO_TEST_CMD=$(repo_util "get_test_command '$TARGET_REPO'")
            REPO_TEST_FILTER_FLAG=$(repo_util "get_test_filter_flag '$TARGET_REPO'")
            REPO_LANGUAGE=$(repo_util "get_repo_language '$TARGET_REPO'")
        else
            # Repo not in config, use directory-based approach
            REPO_PATH="$PROJECT_ROOT/$TARGET_REPO"
            REPO_LINT_CMD=""
            REPO_TEST_CMD=""
            REPO_TEST_FILTER_FLAG=""
            REPO_LANGUAGE=""
        fi
    else
        # No config available, use directory-based approach
        REPO_PATH="$PROJECT_ROOT/$TARGET_REPO"
        REPO_LINT_CMD=""
        REPO_TEST_CMD=""
        REPO_TEST_FILTER_FLAG=""
        REPO_LANGUAGE=""
    fi

    if [[ ! -d "$REPO_PATH" ]]; then
        echo "Error: Repo directory not found: $REPO_PATH"
        exit 1
    fi
    cd "$REPO_PATH"
    WORKING_DIR="$REPO_PATH"
else
    cd "$PROJECT_ROOT"
    WORKING_DIR="$PROJECT_ROOT"
    REPO_LINT_CMD=""
    REPO_TEST_CMD=""
    REPO_TEST_FILTER_FLAG=""
    REPO_LANGUAGE=""
fi

# Output helpers
pass() {
    echo -e "  ${GREEN}[PASS]${NC} $1"
    ((CHECKS_PASSED++))
    ((CHECKS_RUN++))
}

fail() {
    echo -e "  ${RED}[FAIL]${NC} $1"
    ((CHECKS_FAILED++))
    ((CHECKS_RUN++))
}

skip() {
    echo -e "  ${YELLOW}[SKIP]${NC} $1"
    ((CHECKS_SKIPPED++))
}

section() {
    echo ""
    echo -e "${CYAN}$1${NC}"
    echo "$(printf '=%.0s' {1..40})"
}

# Detect project type
detect_project_type() {
    # Check for actual source files first (not just build config)
    # This handles monorepos with multiple languages
    if [[ -f "package.json" ]]; then
        echo "node"
    elif find . -maxdepth 1 -name "*.go" -type f 2>/dev/null | grep -q .; then
        echo "go"
    elif [[ -f "go.mod" ]]; then
        echo "go"
    else
        echo "unknown"
    fi
}

# Check if justfile has a recipe
has_just_recipe() {
    local recipe="$1"
    if [[ -f "justfile" ]] && command -v just &>/dev/null; then
        just --list 2>/dev/null | grep -q "^$recipe " && return 0
    fi
    return 1
}

# Check if npm script exists
has_npm_script() {
    local script="$1"
    if [[ -f "package.json" ]]; then
        grep -q "\"$script\":" package.json && return 0
    fi
    return 1
}

# Run a check command and report result
run_check() {
    local name="$1"
    shift
    local cmd="$*"

    if eval "$cmd" >/dev/null 2>&1; then
        pass "$name"
        return 0
    else
        fail "$name"
        return 1
    fi
}

echo ""
echo "Quality Gate Check"
echo "=================="
echo "Project: $PROJECT_ROOT"
if [[ -n "$TARGET_REPO" ]]; then
    echo "Repo: $TARGET_REPO"
fi
echo "Working dir: $WORKING_DIR"
if $FAST_MODE; then
    echo -e "${YELLOW}Mode: FAST (skipping slow packages)${NC}"
fi

PROJECT_TYPE=$(detect_project_type)

# =============================================================================
# Lint Check
# =============================================================================
section "Lint"

LINT_RAN=false

if $NO_LINT; then
    skip "Lint - skipped by --no-lint or --tests-only"
    LINT_RAN=true  # Mark as "ran" to avoid double skip message
# Use repo config lint command if available
elif [[ -n "$REPO_LINT_CMD" ]]; then
    LINT_RAN=true
    if eval "$REPO_LINT_CMD" >/dev/null 2>&1; then
        pass "Lint ($REPO_LINT_CMD)"
    else
        fail "Lint ($REPO_LINT_CMD)"
    fi
# Prefer justfile recipes
elif has_just_recipe "lint"; then
    LINT_RAN=true
    if just lint >/dev/null 2>&1; then
        pass "Lint (just lint)"
    else
        fail "Lint (just lint)"
    fi
elif [[ "$PROJECT_TYPE" == "node" ]] && has_npm_script "lint"; then
    LINT_RAN=true
    if npm run lint >/dev/null 2>&1; then
        pass "Lint (npm run lint)"
    else
        fail "Lint (npm run lint)"
    fi
elif [[ "$PROJECT_TYPE" == "go" ]] && command -v golangci-lint &>/dev/null; then
    LINT_RAN=true
    if golangci-lint run >/dev/null 2>&1; then
        pass "Lint (golangci-lint)"
    else
        fail "Lint (golangci-lint)"
    fi
elif [[ -f "node_modules/.bin/eslint" ]]; then
    LINT_RAN=true
    if ./node_modules/.bin/eslint . >/dev/null 2>&1; then
        pass "Lint (eslint)"
    else
        fail "Lint (eslint)"
    fi
fi

if ! $LINT_RAN; then
    skip "Lint - no lint command configured"
fi

# =============================================================================
# Type Check
# =============================================================================
section "Type Check"

TYPECHECK_RAN=false

if $NO_TYPECHECK; then
    skip "Type Check - skipped by --no-typecheck or --tests-only"
    TYPECHECK_RAN=true  # Mark as "ran" to avoid double skip message
# Prefer justfile recipes
elif has_just_recipe "typecheck"; then
    TYPECHECK_RAN=true
    if just typecheck >/dev/null 2>&1; then
        pass "Type Check (just typecheck)"
    else
        fail "Type Check (just typecheck)"
    fi
elif [[ -f "tsconfig.json" ]] && has_npm_script "typecheck"; then
    TYPECHECK_RAN=true
    if npm run typecheck >/dev/null 2>&1; then
        pass "Type Check (npm run typecheck)"
    else
        fail "Type Check (npm run typecheck)"
    fi
elif [[ -f "tsconfig.json" ]] && command -v tsc &>/dev/null; then
    TYPECHECK_RAN=true
    if tsc --noEmit >/dev/null 2>&1; then
        pass "Type Check (tsc --noEmit)"
    else
        fail "Type Check (tsc --noEmit)"
    fi
elif [[ -f "tsconfig.json" ]] && [[ -f "node_modules/.bin/tsc" ]]; then
    TYPECHECK_RAN=true
    if ./node_modules/.bin/tsc --noEmit >/dev/null 2>&1; then
        pass "Type Check (./node_modules/.bin/tsc --noEmit)"
    else
        fail "Type Check (./node_modules/.bin/tsc --noEmit)"
    fi
fi

if ! $TYPECHECK_RAN; then
    if [[ -f "tsconfig.json" ]]; then
        skip "Type Check - TypeScript found but no typecheck command"
    else
        skip "Type Check - not a TypeScript project"
    fi
fi

# =============================================================================
# Tests
# =============================================================================
section "Tests"

TESTS_RAN=false

# Show filter if provided
if [[ -n "$TEST_FILTER" ]]; then
    echo "  Filter: $TEST_FILTER"
fi

# Use repo config test command if available
if [[ -n "$REPO_TEST_CMD" ]]; then
    TESTS_RAN=true
    TEST_CMD="$REPO_TEST_CMD"
    if [[ -n "$TEST_FILTER" ]] && [[ -n "$REPO_TEST_FILTER_FLAG" ]]; then
        TEST_CMD="$REPO_TEST_CMD $REPO_TEST_FILTER_FLAG \"$TEST_FILTER\""
    fi
    if eval "$TEST_CMD" >/dev/null 2>&1; then
        pass "Tests ($REPO_TEST_CMD${TEST_FILTER:+ $REPO_TEST_FILTER_FLAG $TEST_FILTER})"
    else
        fail "Tests ($REPO_TEST_CMD${TEST_FILTER:+ $REPO_TEST_FILTER_FLAG $TEST_FILTER})"
    fi
# Prefer justfile recipes
elif has_just_recipe "test"; then
    TESTS_RAN=true
    TEST_CMD="just test"
    if [[ -n "$TEST_FILTER" ]]; then
        # Pass filter to just test (assumes it accepts a pattern arg)
        TEST_CMD="just test $TEST_FILTER"
    fi
    if eval "$TEST_CMD" >/dev/null 2>&1; then
        pass "Tests (just test${TEST_FILTER:+ $TEST_FILTER})"
    else
        fail "Tests (just test${TEST_FILTER:+ $TEST_FILTER})"
    fi
elif [[ "$PROJECT_TYPE" == "node" ]] && has_npm_script "test"; then
    TESTS_RAN=true
    # Check for pnpm workspace (monorepo)
    if [[ -f "pnpm-workspace.yaml" ]] && command -v pnpm &>/dev/null; then
        if $FAST_MODE; then
            # Skip slow packages (cyclist has Electron dependencies)
            TEST_CMD="pnpm -r --filter '!@pennyfarthing/cyclist' test"
            TEST_LABEL="pnpm test (fast mode - skipping cyclist)"
        else
            TEST_CMD="pnpm -r test"
            TEST_LABEL="pnpm test"
        fi
    else
        TEST_CMD="npm test"
        TEST_LABEL="npm test"
    fi
    if [[ -n "$TEST_FILTER" ]]; then
        # Pass filter to test runner (vitest/jest use -t for pattern)
        TEST_CMD="$TEST_CMD -- -t \"$TEST_FILTER\""
        TEST_LABEL="$TEST_LABEL -t $TEST_FILTER"
    fi
    if eval "$TEST_CMD" >/dev/null 2>&1; then
        pass "Tests ($TEST_LABEL)"
    else
        fail "Tests ($TEST_LABEL)"
    fi
elif [[ "$PROJECT_TYPE" == "go" ]]; then
    TESTS_RAN=true
    TEST_CMD="go test ./..."
    if [[ -n "$TEST_FILTER" ]]; then
        # Go uses -run for pattern matching
        TEST_CMD="go test -run \"$TEST_FILTER\" ./..."
    fi
    if eval "$TEST_CMD" >/dev/null 2>&1; then
        pass "Tests (go test${TEST_FILTER:+ -run $TEST_FILTER} ./...)"
    else
        fail "Tests (go test${TEST_FILTER:+ -run $TEST_FILTER} ./...)"
    fi
elif [[ -f "node_modules/.bin/jest" ]]; then
    TESTS_RAN=true
    TEST_CMD="./node_modules/.bin/jest"
    if [[ -n "$TEST_FILTER" ]]; then
        TEST_CMD="./node_modules/.bin/jest -t \"$TEST_FILTER\""
    fi
    if eval "$TEST_CMD" >/dev/null 2>&1; then
        pass "Tests (jest${TEST_FILTER:+ -t $TEST_FILTER})"
    else
        fail "Tests (jest${TEST_FILTER:+ -t $TEST_FILTER})"
    fi
fi

if ! $TESTS_RAN; then
    skip "Tests - no test command configured"
fi

# =============================================================================
# Summary
# =============================================================================
section "Summary"

echo ""
echo "Checks run:    $CHECKS_RUN"
echo -e "Checks passed: ${GREEN}$CHECKS_PASSED${NC}"
if [[ $CHECKS_FAILED -gt 0 ]]; then
    echo -e "Checks failed: ${RED}$CHECKS_FAILED${NC}"
else
    echo "Checks failed: $CHECKS_FAILED"
fi
if [[ $CHECKS_SKIPPED -gt 0 ]]; then
    echo -e "Checks skipped: ${YELLOW}$CHECKS_SKIPPED${NC}"
fi
echo ""

if [[ $CHECKS_FAILED -gt 0 ]]; then
    echo -e "${RED}FAILED${NC} - $CHECKS_FAILED check(s) failed"
    echo "Fix issues before handoff to Reviewer."
    exit 1
elif [[ $CHECKS_RUN -eq 0 ]]; then
    echo -e "${YELLOW}WARNING${NC} - No checks ran (project type: $PROJECT_TYPE)"
    echo "Consider adding lint/test scripts to package.json or justfile."
    exit 0
else
    echo -e "${GREEN}PASSED${NC} - All checks passed"
    exit 0
fi
