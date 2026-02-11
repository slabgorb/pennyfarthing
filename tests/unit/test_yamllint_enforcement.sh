#!/usr/bin/env zsh
# Verify yamllint enforcement in CI (Story 91-10)
#
# Tests:
#   1. yamllint is installed and available
#   2. .yamllint.yaml config exists at repo root
#   3. CI workflow has yaml-lint job
#   4. CI yaml-lint job does not have continue-on-error
#   5. yamllint passes on pennyfarthing-dist/**/*.yaml

set -euo pipefail

# Resolve PROJECT_ROOT from script location (works regardless of cwd)
if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
fi
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Verify we resolved to pennyfarthing repo root (has package.json with @pennyfarthing/core)
if [ ! -f "$PROJECT_ROOT/package.json" ] || ! node -e "const p = require('$PROJECT_ROOT/package.json'); process.exit(p.name === '@pennyfarthing/core' ? 0 : 1)" 2>/dev/null; then
    echo "ERROR: PROJECT_ROOT ($PROJECT_ROOT) does not appear to be the pennyfarthing repo root"
    exit 1
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

FAILURES=0
TESTS=0

pass() {
    ((TESTS++)) || true
    echo -e "${GREEN}✓${NC} $1"
}

fail() {
    ((TESTS++)) || true
    ((FAILURES++)) || true
    echo -e "${RED}✗${NC} $1"
}

echo "=== Yamllint Enforcement Verification (Story 91-10) ==="
echo ""

# --- AC1: yamllint is installed ---
echo "--- AC1: yamllint available ---"

if command -v yamllint &>/dev/null; then
    pass "yamllint is installed and available"
else
    fail "yamllint is not installed (pip install yamllint)"
fi
echo ""

# --- AC2: .yamllint.yaml config exists ---
echo "--- AC2: yamllint config ---"

if [ -f "$PROJECT_ROOT/.yamllint.yaml" ]; then
    pass ".yamllint.yaml config exists"
else
    fail ".yamllint.yaml config not found at repo root"
fi
echo ""

# --- AC3: CI workflow has yaml-lint job ---
echo "--- AC3: CI yaml-lint job ---"

CI_FILE="$PROJECT_ROOT/.github/workflows/ci.yml"
if [ ! -f "$CI_FILE" ]; then
    fail "CI workflow file not found: $CI_FILE"
else
    if grep -q 'yaml-lint:' "$CI_FILE"; then
        pass "CI workflow has yaml-lint job"
    else
        fail "CI workflow missing yaml-lint job"
    fi
fi
echo ""

# --- AC4: CI yaml-lint job does not have continue-on-error ---
echo "--- AC4: yaml-lint enforced (no continue-on-error) ---"

if [ -f "$CI_FILE" ]; then
    YAML_SECTION=$(awk '/^  yaml-lint:/{found=1} found{print} found && /^  [a-z]/ && !/^  yaml-lint:/{exit}' "$CI_FILE")
    if [ -z "$YAML_SECTION" ]; then
        fail "Cannot verify continue-on-error (yaml-lint job not found)"
    elif echo "$YAML_SECTION" | grep -q 'continue-on-error'; then
        fail "CI yaml-lint job has continue-on-error (should be enforced)"
    else
        pass "CI yaml-lint job does not have continue-on-error"
    fi
else
    fail "CI workflow file not found"
fi
echo ""

# --- AC5: yamllint passes on pennyfarthing-dist ---
echo "--- AC5: Lint passes on pennyfarthing-dist/**/*.yaml ---"

if ! command -v yamllint &>/dev/null; then
    fail "Cannot run yamllint (not installed)"
elif [ ! -f "$PROJECT_ROOT/.yamllint.yaml" ]; then
    fail "Cannot run yamllint (no config file)"
else
    cd "$PROJECT_ROOT"
    if yamllint -c .yamllint.yaml pennyfarthing-dist/ 2>&1; then
        pass "yamllint passes on pennyfarthing-dist YAML files"
    else
        fail "yamllint found violations in pennyfarthing-dist (exit $?)"
    fi
fi
echo ""

# --- Summary ---
echo "=== Summary ==="
PASSED=$((TESTS - FAILURES))
echo "$PASSED/$TESTS passed, $FAILURES failed"

if [ $FAILURES -gt 0 ]; then
    echo -e "${RED}FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}ALL PASSED${NC}"
    exit 0
fi
