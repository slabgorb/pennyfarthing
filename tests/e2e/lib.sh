#!/usr/bin/env bash
# Shared test utilities for E2E scenarios.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
SCENARIO_NAME="${SCENARIO_NAME:-unknown}"

# Workspace directory — /workspace in Docker, temp dir locally
if [[ -d /workspace && -w /workspace ]]; then
    WORKSPACE="/workspace"
else
    WORKSPACE="$(mktemp -d)"
    _E2E_CLEANUP_WORKSPACE=true
fi

_cleanup_workspace() {
    if [[ "${_E2E_CLEANUP_WORKSPACE:-false}" == true && -n "${WORKSPACE:-}" ]]; then
        rm -rf "$WORKSPACE"
    fi
}
trap _cleanup_workspace EXIT

pass() {
    echo -e "  ${GREEN}PASS${NC}: $1"
    PASS=$((PASS + 1))
}

fail() {
    echo -e "  ${RED}FAIL${NC}: $1"
    FAIL=$((FAIL + 1))
}

warn() {
    echo -e "  ${YELLOW}WARN${NC}: $1"
}

header() {
    echo ""
    echo -e "${BLUE}=== $SCENARIO_NAME ===${NC}"
    echo ""
}

# Assert a file exists
assert_file() {
    if [[ -f "$1" ]]; then
        pass "File exists: $1"
    else
        fail "File missing: $1"
    fi
}

# Assert a directory exists
assert_dir() {
    if [[ -d "$1" ]]; then
        pass "Dir exists: $1"
    else
        fail "Dir missing: $1"
    fi
}

# Assert a file contains a string
assert_contains() {
    local file="$1" pattern="$2" label="${3:-$2}"
    if grep -q "$pattern" "$file" 2>/dev/null; then
        pass "Contains '$label' in $(basename "$file")"
    else
        fail "Missing '$label' in $(basename "$file")"
    fi
}

# Assert a file does NOT contain a string
assert_not_contains() {
    local file="$1" pattern="$2" label="${3:-$2}"
    if grep -q "$pattern" "$file" 2>/dev/null; then
        fail "Unwanted '$label' in $(basename "$file")"
    else
        pass "No '$label' in $(basename "$file")"
    fi
}

# Assert a command succeeds
assert_cmd() {
    local label="$1"
    shift
    if "$@" >/dev/null 2>&1; then
        pass "$label"
    else
        fail "$label (exit $?)"
    fi
}

# Assert a command fails
assert_cmd_fails() {
    local label="$1"
    shift
    if "$@" >/dev/null 2>&1; then
        fail "$label (expected failure, got success)"
    else
        pass "$label"
    fi
}

# Assert file count in a directory matches expected
assert_file_count() {
    local dir="$1" pattern="$2" expected="$3" label="${4:-files}"
    local actual
    actual=$(find "$dir" -maxdepth 1 -name "$pattern" 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$actual" -eq "$expected" ]]; then
        pass "$label: $actual files (expected $expected)"
    else
        fail "$label: $actual files (expected $expected)"
    fi
}

# Assert file count is >= minimum
assert_min_file_count() {
    local dir="$1" pattern="$2" minimum="$3" label="${4:-files}"
    local actual
    actual=$(find "$dir" -maxdepth 1 -name "$pattern" 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$actual" -ge "$minimum" ]]; then
        pass "$label: $actual files (>= $minimum)"
    else
        fail "$label: $actual files (expected >= $minimum)"
    fi
}

# Create a minimal git repo
create_repo() {
    local dir="$1"
    mkdir -p "$dir"
    cd "$dir"
    git init
    echo "# Test project" > README.md
    git add README.md
    git commit -m "Initial commit"
}

summary() {
    echo ""
    echo "========================================"
    echo "  $SCENARIO_NAME"
    echo "========================================"
    echo "Passed: $PASS"
    echo "Failed: $FAIL"
    echo ""

    if [[ $FAIL -gt 0 ]]; then
        echo -e "${RED}FAILED: $FAIL check(s) failed${NC}"
        exit 1
    else
        echo -e "${GREEN}PASSED: All checks passed${NC}"
        exit 0
    fi
}
