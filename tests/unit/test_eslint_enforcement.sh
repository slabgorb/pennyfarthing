#!/usr/bin/env zsh
# Verify ESLint enforcement across all packages (Story 91-7)
#
# Tests:
#   1. CI lint job does NOT have continue-on-error
#   2. All TS packages have lint scripts in package.json
#   3. Root lint command covers all packages
#   4. pnpm run lint passes with --max-warnings 0

set -euo pipefail

# Resolve PROJECT_ROOT from script location (works regardless of cwd)
if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
fi
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

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

echo "=== ESLint Enforcement Verification (Story 91-7) ==="
echo ""

# --- AC1: continue-on-error removed from CI lint job ---
echo "--- AC1: CI lint job must NOT have continue-on-error ---"

CI_FILE="$PROJECT_ROOT/.github/workflows/ci.yml"
if [ ! -f "$CI_FILE" ]; then
    fail "CI workflow file not found: $CI_FILE"
else
    # Extract the lint job section and check for continue-on-error
    # Use awk to grab from "  lint:" to next job (2-space indented key + colon)
    LINT_SECTION=$(awk '/^  lint:/{found=1} found{print} found && /^  [a-z]/ && !/^  lint:/{exit}' "$CI_FILE")

    if echo "$LINT_SECTION" | grep -q 'continue-on-error'; then
        fail "CI lint job still has continue-on-error"
    else
        pass "CI lint job does not have continue-on-error"
    fi
fi
echo ""

# --- AC2: All TS packages have lint scripts ---
echo "--- AC2: Package lint scripts ---"

PACKAGES_WITH_TS=(core shared cyclist)
for pkg in "${PACKAGES_WITH_TS[@]}"; do
    PKG_JSON="$PROJECT_ROOT/packages/$pkg/package.json"
    if [ ! -f "$PKG_JSON" ]; then
        fail "packages/$pkg/package.json not found"
        continue
    fi

    if node -e "const p = require('$PKG_JSON'); process.exit(p.scripts && p.scripts.lint ? 0 : 1)" 2>/dev/null; then
        pass "packages/$pkg has lint script"
    else
        fail "packages/$pkg missing lint script"
    fi
done
echo ""

# --- AC3: Root lint command covers all packages ---
echo "--- AC3: Root lint command ---"

ROOT_PKG="$PROJECT_ROOT/package.json"
if [ ! -f "$ROOT_PKG" ]; then
    fail "Root package.json not found"
else
    LINT_CMD=$(node -e "const p = require('$ROOT_PKG'); console.log(p.scripts && p.scripts.lint || '')" 2>/dev/null)
    if [ -z "$LINT_CMD" ]; then
        fail "Root package.json has no lint script"
    elif echo "$LINT_CMD" | grep -q 'packages/\*/'; then
        pass "Root lint command uses packages/* glob"
    else
        fail "Root lint command does not cover all packages: $LINT_CMD"
    fi
fi
echo ""

# --- AC4: pnpm run lint passes ---
echo "--- AC4: Lint passes cleanly ---"

cd "$PROJECT_ROOT"
if pnpm run lint 2>&1; then
    pass "pnpm run lint passes"
else
    fail "pnpm run lint failed (exit $?)"
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
