#!/usr/bin/env zsh
# Tests for scripts/utils/repo-scan.sh
# Story 1-4a: Split workflow-status-check.md subagent

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

REPO_SCAN_SCRIPT="$PROJECT_ROOT/scripts/utils/repo-scan.sh"

# =============================================================================
# Test: repo-scan.sh exists and is sourceable
# =============================================================================
test_script_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ -f "$REPO_SCAN_SCRIPT" ]]; then
        if source "$REPO_SCAN_SCRIPT" 2>/dev/null; then
            pass "repo-scan.sh exists and is sourceable"
        else
            fail "repo-scan.sh exists but cannot be sourced"
        fi
    else
        fail "repo-scan.sh does not exist at $REPO_SCAN_SCRIPT"
    fi
}

# =============================================================================
# Test: scan_repo_git_status function exists
# =============================================================================
test_scan_repo_git_status_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$REPO_SCAN_SCRIPT" 2>/dev/null || true
    if declare -f scan_repo_git_status > /dev/null 2>&1; then
        pass "scan_repo_git_status function exists"
    else
        fail "scan_repo_git_status function not defined"
    fi
}

# =============================================================================
# Test: scan_repo_git_status returns pipe-delimited format
# Expected format: repo|branch|uncommitted_count|ahead_count
# =============================================================================
test_scan_repo_git_status_format() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$REPO_SCAN_SCRIPT" 2>/dev/null || { fail "Cannot source repo-scan.sh"; return; }

    # Test with pennyfarthing repo (always exists)
    local result
    result=$(scan_repo_git_status "pennyfarthing" 2>/dev/null) || { fail "scan_repo_git_status failed"; return; }

    # Check pipe-delimited format (4 fields)
    local field_count
    field_count=$(echo "$result" | awk -F'|' '{print NF}')

    if [[ "$field_count" -eq 4 ]]; then
        pass "scan_repo_git_status returns 4 pipe-delimited fields"
    else
        fail "scan_repo_git_status returned $field_count fields, expected 4: $result"
    fi
}

# =============================================================================
# Test: scan_repo_git_status returns valid branch name
# =============================================================================
test_scan_repo_git_status_branch() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$REPO_SCAN_SCRIPT" 2>/dev/null || { fail "Cannot source repo-scan.sh"; return; }

    local result
    result=$(scan_repo_git_status "pennyfarthing" 2>/dev/null) || { fail "scan_repo_git_status failed"; return; }

    # Extract branch (second field)
    local branch
    branch=$(echo "$result" | cut -d'|' -f2)

    if [[ -n "$branch" ]]; then
        pass "scan_repo_git_status returns branch name: $branch"
    else
        fail "scan_repo_git_status returned empty branch"
    fi
}

# =============================================================================
# Test: scan_repo_git_status returns numeric counts
# =============================================================================
test_scan_repo_git_status_counts() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$REPO_SCAN_SCRIPT" 2>/dev/null || { fail "Cannot source repo-scan.sh"; return; }

    local result
    result=$(scan_repo_git_status "pennyfarthing" 2>/dev/null) || { fail "scan_repo_git_status failed"; return; }

    # Extract counts (third and fourth fields)
    local uncommitted ahead
    uncommitted=$(echo "$result" | cut -d'|' -f3)
    ahead=$(echo "$result" | cut -d'|' -f4)

    # Check they are numeric (or empty which we treat as 0)
    if [[ "$uncommitted" =~ ^[0-9]*$ ]] && [[ "$ahead" =~ ^[0-9]*$ ]]; then
        pass "scan_repo_git_status returns numeric counts: uncommitted=$uncommitted, ahead=$ahead"
    else
        fail "scan_repo_git_status returned non-numeric counts: uncommitted=$uncommitted, ahead=$ahead"
    fi
}

# =============================================================================
# Test: scan_all_repos_status function exists
# =============================================================================
test_scan_all_repos_status_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$REPO_SCAN_SCRIPT" 2>/dev/null || true
    if declare -f scan_all_repos_status > /dev/null 2>&1; then
        pass "scan_all_repos_status function exists"
    else
        fail "scan_all_repos_status function not defined"
    fi
}

# =============================================================================
# Test: scan_all_repos_status returns at least one line
# =============================================================================
test_scan_all_repos_status_output() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$REPO_SCAN_SCRIPT" 2>/dev/null || { fail "Cannot source repo-scan.sh"; return; }

    local result
    result=$(scan_all_repos_status 2>/dev/null) || { fail "scan_all_repos_status failed"; return; }

    local line_count
    line_count=$(echo "$result" | wc -l | tr -d ' ')

    if [[ "$line_count" -ge 1 ]]; then
        pass "scan_all_repos_status returns $line_count repo(s)"
    else
        fail "scan_all_repos_status returned no output"
    fi
}

# =============================================================================
# Test: check_repo_pr function exists
# =============================================================================
test_check_repo_pr_exists() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$REPO_SCAN_SCRIPT" 2>/dev/null || true
    if declare -f check_repo_pr > /dev/null 2>&1; then
        pass "check_repo_pr function exists"
    else
        fail "check_repo_pr function not defined"
    fi
}

# =============================================================================
# Test: check_repo_pr handles non-existent branch gracefully
# =============================================================================
test_check_repo_pr_no_branch() {
    TESTS_RUN=$((TESTS_RUN + 1))
    source "$REPO_SCAN_SCRIPT" 2>/dev/null || { fail "Cannot source repo-scan.sh"; return; }

    # Use a branch that definitely doesn't exist
    local result
    result=$(check_repo_pr "pennyfarthing" "nonexistent-branch-12345" 2>/dev/null)
    local exit_code=$?

    # Should return "none" or similar, not error
    if [[ $exit_code -eq 0 ]] && [[ "$result" == "none" || "$result" == "" ]]; then
        pass "check_repo_pr handles missing branch gracefully"
    else
        fail "check_repo_pr failed or returned unexpected: exit=$exit_code, result=$result"
    fi
}

# =============================================================================
# Run all tests
# =============================================================================
run_all_tests() {
    echo "========================================"
    echo "  Testing repo-scan.sh"
    echo "========================================"
    echo ""

    test_script_exists
    test_scan_repo_git_status_exists
    test_scan_repo_git_status_format
    test_scan_repo_git_status_branch
    test_scan_repo_git_status_counts
    test_scan_all_repos_status_exists
    test_scan_all_repos_status_output
    test_check_repo_pr_exists
    test_check_repo_pr_no_branch

    echo ""
    echo "=== Results ==="
    echo "Tests run: $TESTS_RUN"
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"

    if [[ $TESTS_FAILED -gt 0 ]]; then
        exit 1
    fi
}

run_all_tests
