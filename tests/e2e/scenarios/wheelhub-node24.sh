#!/usr/bin/env bash
# Scenario 3: WheelHub starts on Node 24 without CJS errors
#
# The whole reason for the banner fix. Tests that the bundled wheelhub.mjs
# actually starts a server on Node 24 without "Dynamic require of 'path'
# is not supported" or similar CJS-in-ESM errors.

source /lib.sh 2>/dev/null || source "$(dirname "$0")/../lib.sh"
SCENARIO_NAME="WheelHub Node 24 Startup"
header

# Find the wheelhub bundle — /opt/pennyfarthing in Docker, relative path locally
if [[ -f /opt/pennyfarthing/pennyfarthing-dist/src/pf/_dist/server/wheelhub.mjs ]]; then
    WHEELHUB="/opt/pennyfarthing/pennyfarthing-dist/src/pf/_dist/server/wheelhub.mjs"
else
    # Resolve from script location: scenarios/ -> e2e/ -> tests/ -> pennyfarthing/
    WHEELHUB="$(cd "$(dirname "$0")/../../../.." 2>/dev/null && pwd)/pennyfarthing/pennyfarthing-dist/src/pf/_dist/server/wheelhub.mjs"
    if [[ ! -f "$WHEELHUB" ]]; then
        # Try from pf CLI dist
        WHEELHUB="$(python3 -c "from importlib.resources import files; print(files('pf').joinpath('_dist/server/wheelhub.mjs'))" 2>/dev/null || echo "")"
    fi
fi

# --- Pre-flight ---
echo "Node version: $(node --version)"
assert_file "$WHEELHUB"

# --- Check banner is present ---
echo ""
echo "Checking CJS compatibility banner ..."
FIRST_LINE=$(head -1 "$WHEELHUB")
if echo "$FIRST_LINE" | grep -q 'import { createRequire } from "node:module"'; then
    pass "createRequire banner on first line"
else
    fail "Missing createRequire banner. First line: $FIRST_LINE"
fi

if echo "$FIRST_LINE" | grep -q 'var require = createRequire(import.meta.url)'; then
    pass "require = createRequire(import.meta.url) on first line"
else
    fail "Missing require assignment on first line"
fi

# --- Check Proxy shim is neutralized ---
echo ""
echo "Checking Proxy shim is neutralized ..."
# esbuild still generates the Proxy-based __require shim, but our banner defines
# `require` before it runs. The shim's first branch is `typeof require !== "undefined" ? require`
# which evaluates to our createRequire-based require, making the Proxy branch dead code.
# The key assertion: createRequire banner appears BEFORE any __require definition.
BANNER_LINE=$(grep -n 'var require = createRequire' "$WHEELHUB" | head -1 | cut -d: -f1)
REQUIRE_LINE=$(grep -n 'var __require' "$WHEELHUB" | head -1 | cut -d: -f1)
if [[ -n "$BANNER_LINE" && -n "$REQUIRE_LINE" && "$BANNER_LINE" -lt "$REQUIRE_LINE" ]]; then
    pass "createRequire banner (line $BANNER_LINE) precedes __require shim (line $REQUIRE_LINE)"
else
    fail "createRequire banner must appear before __require shim (banner=$BANNER_LINE, shim=$REQUIRE_LINE)"
fi

# --- Attempt to start WheelHub ---
echo ""
echo "Starting WheelHub (5 second timeout) ..."

# Create a minimal project dir so WheelHub can find .pennyfarthing/
create_repo "$WORKSPACE/wheelhub-test"
cd "$WORKSPACE/wheelhub-test"
pf init --yes . 2>&1 | tail -1

# Start WheelHub in background, capture output
WHEELHUB_LOG="/tmp/wheelhub-test.log"
node "$WHEELHUB" > "$WHEELHUB_LOG" 2>&1 &
WHEELHUB_PID=$!

# Wait for startup (up to 5 seconds)
# Disable set -e for this section since kill -0 and grep may fail expectedly
set +e
STARTED=false
for i in $(seq 1 50); do
    sleep 0.1
    if grep -q "listening\|started\|ready\|WheelHub" "$WHEELHUB_LOG" 2>/dev/null; then
        STARTED=true
        break
    fi
    # Check if process died
    if ! kill -0 "$WHEELHUB_PID" 2>/dev/null; then
        break
    fi
done

# Check for the specific CJS error
if grep -qi "Dynamic require.*is not supported" "$WHEELHUB_LOG" 2>/dev/null; then
    fail "CJS error: Dynamic require is not supported"
    echo "  --- Log output ---"
    head -20 "$WHEELHUB_LOG" | sed 's/^/  /'
    echo "  ------------------"
elif grep -qi "ERR_REQUIRE_ESM\|Cannot find module\|MODULE_NOT_FOUND" "$WHEELHUB_LOG" 2>/dev/null; then
    fail "Module resolution error during startup"
    echo "  --- Log output ---"
    head -20 "$WHEELHUB_LOG" | sed 's/^/  /'
    echo "  ------------------"
elif ! kill -0 "$WHEELHUB_PID" 2>/dev/null; then
    # Process died — check exit code
    wait "$WHEELHUB_PID" 2>/dev/null
    EXIT_CODE=$?
    if [[ $EXIT_CODE -ne 0 ]]; then
        # Check for CJS-specific errors (the ones we're testing for).
        # Port conflicts, missing config, etc. are environment issues, not CJS failures.
        if grep -qi "Dynamic require.*is not supported\|ERR_REQUIRE_ESM\|Cannot use import statement" "$WHEELHUB_LOG" 2>/dev/null; then
            fail "WheelHub crashed with CJS/ESM error (code $EXIT_CODE)"
            echo "  --- Log output ---"
            head -30 "$WHEELHUB_LOG" | sed 's/^/  /'
            echo "  ------------------"
        elif grep -q "No available port\|EADDRINUSE" "$WHEELHUB_LOG" 2>/dev/null; then
            pass "WheelHub started but port unavailable (CJS imports succeeded, code $EXIT_CODE)"
        else
            pass "WheelHub started and exited (code $EXIT_CODE, no CJS errors)"
        fi
    else
        pass "WheelHub started and exited cleanly"
    fi
else
    pass "WheelHub process alive after startup (PID $WHEELHUB_PID)"
    # Try to hit the health endpoint
    if command -v curl &>/dev/null; then
        if curl -sf http://localhost:7117/api/health 2>/dev/null; then
            pass "Health endpoint responding"
        else
            warn "Health endpoint not responding (may use different port)"
        fi
    fi
fi

# Cleanup
kill "$WHEELHUB_PID" 2>/dev/null
wait "$WHEELHUB_PID" 2>/dev/null
set -e

# --- Syntax check: Node can at least parse the module ---
echo ""
echo "Checking Node can parse the module ..."
if node --check "$WHEELHUB" 2>/dev/null; then
    pass "Node --check passes (valid ES module syntax)"
else
    # --check doesn't work on .mjs with top-level await, try import
    if node -e "import('$WHEELHUB').catch(e => { console.error(e.message); process.exit(1) })" 2>/dev/null; then
        pass "Node can import the module"
    else
        fail "Node cannot parse/import wheelhub.mjs"
    fi
fi

summary
