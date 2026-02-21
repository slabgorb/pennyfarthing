#!/usr/bin/env bash
#
# test_changelog_gate.sh - Verify changelog links validation is wired as a publish gate
#
# This integration test ensures the changelog links validation is actually
# integrated into the publish/release workflow, not just an orphaned script.
#
# Usage: ./tests/integration/test_changelog_gate.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS=0
FAIL=0

pass() {
    echo "PASS: $1"
    ((PASS++))
}

fail() {
    echo "FAIL: $1"
    ((FAIL++))
}

echo "=== Changelog Gate Integration Tests ==="
echo ""

# --- Test: changelog-links.sh exists and is executable ---

if [[ -x "$PROJECT_ROOT/pennyfarthing-dist/scripts/git/changelog-links.sh" ]]; then
    pass "changelog-links.sh exists and is executable"
else
    fail "changelog-links.sh missing or not executable"
fi

# --- Test: gate is wired into prepublishOnly ---

PREPUBLISH_HAS_GATE=0
if grep -q "changelog-links" "$PROJECT_ROOT/package.json" 2>/dev/null; then
    PREPUBLISH_HAS_GATE=1
fi

if [[ $PREPUBLISH_HAS_GATE -eq 1 ]]; then
    pass "Changelog gate wired into package.json prepublishOnly"
else
    fail "Changelog gate NOT found in prepublishOnly script"
fi

# --- Test: deploy.sh calls changelog-links.sh ---

DEPLOY_HAS_GATE=0
if [[ -f "$PROJECT_ROOT/scripts/deploy.sh" ]] && grep -q "changelog-links" "$PROJECT_ROOT/scripts/deploy.sh" 2>/dev/null; then
    DEPLOY_HAS_GATE=1
fi

if [[ $DEPLOY_HAS_GATE -eq 1 ]]; then
    pass "deploy.sh calls changelog-links.sh for link regeneration"
else
    fail "deploy.sh does not reference changelog-links.sh"
fi

# --- Test: running validation succeeds on current CHANGELOG ---

echo ""
echo "Running changelog links validation..."
if "$PROJECT_ROOT/pennyfarthing-dist/scripts/git/changelog-links.sh" --validate --changelog "$PROJECT_ROOT/CHANGELOG.md" > /dev/null 2>&1; then
    pass "Changelog links validation passes"
else
    fail "Changelog links validation FAILS — links may be out of sync"
fi

echo ""

# --- Summary ---

echo "========================================"
echo "  Changelog Gate Integration Summary"
echo "========================================"
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo ""

if [[ $FAIL -gt 0 ]]; then
    echo "FAILED: $FAIL assertion(s) failed"
    exit 1
else
    echo "PASSED: All changelog gate integration assertions passed"
    exit 0
fi
