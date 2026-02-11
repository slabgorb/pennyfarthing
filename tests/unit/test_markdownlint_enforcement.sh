#!/usr/bin/env zsh
# Verify markdownlint enforcement in CI (Story 91-9)
#
# Tests:
#   1. markdownlint-cli2 is installed as devDependency
#   2. Root package.json has lint:md script
#   3. CI workflow has markdown-lint job
#   4. .markdownlint.yaml config exists
#   5. Redundant .markdownlint.json removed
#   6. markdownlint passes on pennyfarthing-dist/**/*.md

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

echo "=== Markdownlint Enforcement Verification (Story 91-9) ==="
echo ""

# --- AC1: markdownlint-cli2 is a devDependency ---
echo "--- AC1: markdownlint-cli2 devDependency ---"

ROOT_PKG="$PROJECT_ROOT/package.json"
if [ ! -f "$ROOT_PKG" ]; then
    fail "Root package.json not found"
else
    if node -e "const p = require('$ROOT_PKG'); process.exit(p.devDependencies && p.devDependencies['markdownlint-cli2'] ? 0 : 1)" 2>/dev/null; then
        pass "markdownlint-cli2 is a devDependency"
    else
        fail "markdownlint-cli2 not found in devDependencies"
    fi
fi
echo ""

# --- AC2: Root package.json has lint:md script ---
echo "--- AC2: lint:md script ---"

if [ ! -f "$ROOT_PKG" ]; then
    fail "Root package.json not found"
else
    LINT_MD_CMD=$(node -e "const p = require('$ROOT_PKG'); console.log(p.scripts && p.scripts['lint:md'] || '')" 2>/dev/null)
    if [ -z "$LINT_MD_CMD" ]; then
        fail "Root package.json has no lint:md script"
    elif echo "$LINT_MD_CMD" | grep -q 'markdownlint'; then
        pass "Root lint:md script uses markdownlint"
    else
        fail "Root lint:md script does not use markdownlint: $LINT_MD_CMD"
    fi
fi
echo ""

# --- AC3: CI workflow has markdown-lint job ---
echo "--- AC3: CI markdown-lint job ---"

CI_FILE="$PROJECT_ROOT/.github/workflows/ci.yml"
if [ ! -f "$CI_FILE" ]; then
    fail "CI workflow file not found: $CI_FILE"
else
    if grep -q 'markdown-lint:' "$CI_FILE"; then
        pass "CI workflow has markdown-lint job"
    else
        fail "CI workflow missing markdown-lint job"
    fi

    # Verify it does NOT have continue-on-error
    MD_SECTION=$(awk '/^  markdown-lint:/{found=1} found{print} found && /^  [a-z]/ && !/^  markdown-lint:/{exit}' "$CI_FILE")
    if echo "$MD_SECTION" | grep -q 'continue-on-error'; then
        fail "CI markdown-lint job has continue-on-error (should be enforced)"
    else
        pass "CI markdown-lint job does not have continue-on-error"
    fi
fi
echo ""

# --- AC4: .markdownlint.yaml config exists ---
echo "--- AC4: Markdownlint config ---"

if [ -f "$PROJECT_ROOT/.markdownlint.yaml" ]; then
    pass ".markdownlint.yaml config exists"
else
    fail ".markdownlint.yaml config not found"
fi
echo ""

# --- AC5: Redundant .markdownlint.json removed ---
echo "--- AC5: No redundant .markdownlint.json ---"

if [ -f "$PROJECT_ROOT/.markdownlint.json" ]; then
    fail ".markdownlint.json still exists (should be removed, YAML is canonical)"
else
    pass ".markdownlint.json removed (YAML is canonical config)"
fi
echo ""

# --- AC6: markdownlint passes on pennyfarthing-dist ---
echo "--- AC6: Lint passes on pennyfarthing-dist/**/*.md ---"

cd "$PROJECT_ROOT"
if pnpm run lint:md 2>&1; then
    pass "markdownlint passes on pennyfarthing-dist markdown files"
else
    fail "markdownlint found violations in pennyfarthing-dist (exit $?)"
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
