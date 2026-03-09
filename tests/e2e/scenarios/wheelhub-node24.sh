#!/usr/bin/env bash
# Scenario 3: Python WheelHub server is available via pf CLI
#
# Replaces the Node.js bundle test. The Python FastAPI server is now the
# sole WheelHub implementation (ADR-0022, Epic 48).

source /lib.sh 2>/dev/null || source "$(dirname "$0")/../lib.sh"
SCENARIO_NAME="WheelHub Python Server"
header

# --- Pre-flight ---
echo "Python version: $(python3 --version)"
echo "pf version: $(pf --version)"

# --- Check pf launch wheelhub works (dry-run) ---
echo ""
echo "Checking pf launch commands ..."
create_repo "$WORKSPACE/wheelhub-test"
cd "$WORKSPACE/wheelhub-test"
pf init --yes . 2>&1 | tail -1

assert_cmd "pf launch gui --dry-run" pf launch gui --project-dir "$WORKSPACE/wheelhub-test" --dry-run
assert_cmd "pf launch tui --dry-run" pf launch tui --project-dir "$WORKSPACE/wheelhub-test" --dry-run

# --- Check no Node.js bundle installed ---
echo ""
echo "Checking Node.js bundle removed ..."
if [[ ! -f "$WORKSPACE/wheelhub-test/.pennyfarthing/server/wheelhub.mjs" ]]; then
    pass "No Node.js WheelHub bundle in consumer project"
else
    fail "Stale Node.js WheelHub bundle found in .pennyfarthing/server/"
fi

if [[ ! -f /opt/pennyfarthing/pennyfarthing-dist/src/pf/_dist/server/wheelhub.mjs ]]; then
    pass "No Node.js WheelHub bundle in framework source"
else
    fail "Stale Node.js WheelHub bundle found in framework"
fi

summary
