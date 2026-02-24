#!/usr/bin/env bash
#
# test_consumer_install.sh - Consumer install smoke test
#
# Packs @pennyfarthing/core, installs in a clean temp directory,
# and validates the installation with `pf doctor`.
#
# Every 11.x packaging bug would have been caught by this test.
#
# Usage: ./tests/integration/test_consumer_install.sh
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
INSTALL_DIR=""

pass() {
    echo -e "  ${GREEN}PASS${NC}: $1"
    ((PASS++))
}

fail() {
    echo -e "  ${RED}FAIL${NC}: $1"
    ((FAIL++))
}

warn() {
    echo -e "  ${YELLOW}WARN${NC}: $1"
}

cleanup() {
    if [[ -n "$INSTALL_DIR" && -d "$INSTALL_DIR" ]]; then
        rm -rf "$INSTALL_DIR"
    fi
}
trap cleanup EXIT

echo ""
echo "========================================"
echo "  Consumer Install Smoke Test"
echo "========================================"
echo ""

# --- AC1: Pack the package ---

echo -e "${BLUE}Step 1: Pack @pennyfarthing/core${NC}"

TARBALL=$(cd "$PROJECT_ROOT" && pnpm pack --pack-destination /tmp 2>/dev/null | tail -1)

if [[ -z "$TARBALL" || ! -f "$TARBALL" ]]; then
    fail "AC1: pnpm pack did not produce a tarball"
    echo ""
    echo "Results: $PASS passed, $FAIL failed"
    exit 1
fi

TARBALL_SIZE=$(wc -c < "$TARBALL" | tr -d ' ')
pass "AC1: Tarball created: $(basename "$TARBALL") ($TARBALL_SIZE bytes)"

# --- AC2: Install in isolated temp directory ---

echo ""
echo -e "${BLUE}Step 2: Install in isolated directory${NC}"

INSTALL_DIR=$(mktemp -d)
echo "  Install dir: $INSTALL_DIR"

# Initialize a minimal package.json (consumer project)
cat > "$INSTALL_DIR/package.json" << 'CONSUMER_PKG'
{
  "name": "test-consumer-project",
  "version": "1.0.0",
  "private": true,
  "description": "Smoke test consumer project"
}
CONSUMER_PKG

# Install the tarball
INSTALL_OUTPUT=$(cd "$INSTALL_DIR" && npm install "$TARBALL" 2>&1)
INSTALL_EXIT=$?

if [[ $INSTALL_EXIT -ne 0 ]]; then
    fail "AC2: npm install exited with code $INSTALL_EXIT"
    echo "  --- Install output ---"
    echo "$INSTALL_OUTPUT" | tail -20 | sed 's/^/  /'
    echo "  ----------------------"
else
    # Check for peer dependency warnings (non-fatal but worth noting)
    if echo "$INSTALL_OUTPUT" | grep -qi "peer dep"; then
        warn "Peer dependency warnings during install (non-fatal)"
    fi
    pass "AC2: Tarball installed cleanly (exit code 0)"
fi

# --- AC3: CLI binary is accessible ---

echo ""
echo -e "${BLUE}Step 3: Verify CLI binary${NC}"

PF_BIN="$INSTALL_DIR/node_modules/.bin/pennyfarthing"

if [[ ! -f "$PF_BIN" ]]; then
    fail "AC3: pennyfarthing binary not found at $PF_BIN"
else
    VERSION_OUTPUT=$("$PF_BIN" --version 2>&1)
    VERSION_EXIT=$?
    if [[ $VERSION_EXIT -ne 0 ]]; then
        fail "AC3: pennyfarthing --version exited with code $VERSION_EXIT"
        echo "  Output: $VERSION_OUTPUT"
    else
        pass "AC3: pennyfarthing --version reports: $VERSION_OUTPUT"
    fi
fi

# --- AC4: Run pf doctor ---

echo ""
echo -e "${BLUE}Step 4: Run pf doctor${NC}"

# First, initialize the project non-interactively
if [[ -f "$PF_BIN" ]]; then
    INIT_OUTPUT=$(cd "$INSTALL_DIR" && "$PF_BIN" setup --force 2>&1)
    INIT_EXIT=$?
    if [[ $INIT_EXIT -ne 0 ]]; then
        warn "pf setup exited with code $INIT_EXIT (may affect doctor results)"
    else
        pass "pf setup completed successfully"
    fi

    # Now run doctor
    DOCTOR_OUTPUT=$(cd "$INSTALL_DIR" && "$PF_BIN" doctor --json 2>&1)
    DOCTOR_EXIT=$?

    if [[ $DOCTOR_EXIT -ne 0 ]]; then
        fail "AC4: pf doctor exited with code $DOCTOR_EXIT"
        echo "  --- pf doctor output (last 30 lines) ---"
        echo "$DOCTOR_OUTPUT" | tail -30 | sed 's/^/  /'
        echo "  ----------------------------------------"
    else
        # pf doctor --json outputs header lines before the JSON array.
        # Extract JSON by finding the first '[' line.
        DOCTOR_JSON=$(echo "$DOCTOR_OUTPUT" | sed -n '/^\[/,$ p')

        CRITICAL_FAILS=$(echo "$DOCTOR_JSON" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    fails = [c for c in data if c.get('status') == 'fail']
    print(len(fails))
except (json.JSONDecodeError, KeyError):
    print('-1')
" 2>/dev/null)

        if [[ "$CRITICAL_FAILS" == "-1" ]]; then
            warn "Could not parse pf doctor JSON output"
            # Fall back to exit code — if 0, it passed
            pass "AC4: pf doctor exited cleanly (exit code 0)"
        elif [[ "$CRITICAL_FAILS" == "0" ]]; then
            pass "AC4: pf doctor reports 0 critical failures"
        else
            fail "AC4: pf doctor reports $CRITICAL_FAILS critical failure(s)"
            echo "$DOCTOR_JSON" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    for c in data:
        if c.get('status') == 'fail':
            print(f\"  FAIL: {c.get('name', 'unknown')}: {c.get('detail', '')}\")
except:
    pass
" 2>/dev/null
        fi
    fi
else
    fail "AC4: Skipped — pf binary not available"
fi

# --- AC5: Verify key installed files ---

echo ""
echo -e "${BLUE}Step 5: Verify key installed files${NC}"

PF_PKG="$INSTALL_DIR/node_modules/@pennyfarthing/core"

declare -a REQUIRED_PATHS=(
    "$PF_PKG/packages/core/bin/pennyfarthing.js"
    "$PF_PKG/pennyfarthing-dist/agents"
    "$PF_PKG/pennyfarthing-dist/scripts"
    "$PF_PKG/pennyfarthing-dist/skills"
    "$PF_PKG/pennyfarthing-dist/workflows"
    "$PF_PKG/pennyfarthing-dist/personas/themes"
    "$PF_PKG/pennyfarthing-dist/src/pf"
    "$PF_PKG/README.md"
)

for path in "${REQUIRED_PATHS[@]}"; do
    if [[ -e "$path" ]]; then
        pass "File exists: ${path#$PF_PKG/}"
    else
        fail "File MISSING: ${path#$PF_PKG/}"
    fi
done

# --- AC6: CI workflow includes smoke-test job ---

echo ""
echo -e "${BLUE}Step 6: Verify CI workflow integration${NC}"

CI_WORKFLOW="$PROJECT_ROOT/.github/workflows/ci.yml"

if [[ ! -f "$CI_WORKFLOW" ]]; then
    fail "AC6: CI workflow not found at .github/workflows/ci.yml"
else
    if grep -q "smoke-test" "$CI_WORKFLOW"; then
        pass "AC6: CI workflow contains smoke-test job"
    else
        fail "AC6: CI workflow missing smoke-test job"
    fi
fi

# --- Summary ---

echo ""
echo "========================================"
echo "  Consumer Install Smoke Test Summary"
echo "========================================"
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo ""

# Cleanup tarball
rm -f "$TARBALL"

if [[ $FAIL -gt 0 ]]; then
    echo -e "${RED}FAILED: $FAIL check(s) failed${NC}"
    exit 1
else
    echo -e "${GREEN}PASSED: All consumer install checks passed${NC}"
    exit 0
fi
