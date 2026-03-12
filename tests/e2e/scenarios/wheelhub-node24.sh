#!/usr/bin/env bash
# Scenario 3: WheelHub starts via Python uvicorn
#
# Tests that the Python FastAPI WheelHub server starts and responds to
# health checks. Replaces the old Node.js CJS compatibility test now
# that WheelHub runs on Python/uvicorn (ADR-0034).

source /lib.sh 2>/dev/null || source "$(dirname "$0")/../lib.sh"
SCENARIO_NAME="WheelHub Python Startup"
header

# --- Pre-flight ---
echo "Python version: $(python3 --version)"
echo "Node version: $(node --version)"

# Check pf CLI is available
assert_cmd "pf CLI available" pf --version

# Check uvicorn is importable inside pf's environment
# Consumer repos install pf via pipx — uvicorn lives in that venv, not system python.
# Use pf's own python to verify.
PF_PYTHON="$(dirname "$(readlink -f "$(which pf)")")/../lib/python*/site-packages" 2>/dev/null
if pf --help >/dev/null 2>&1 && python3 -c "
import subprocess, sys, os
# Find pf's actual interpreter by checking the shebang
pf_bin = subprocess.check_output(['which', 'pf']).decode().strip()
with open(pf_bin) as f:
    shebang = f.readline().strip()
if shebang.startswith('#!'):
    pf_python = shebang[2:].strip()
    result = subprocess.run([pf_python, '-c', 'import uvicorn; import fastapi'], capture_output=True)
    sys.exit(result.returncode)
else:
    sys.exit(1)
" 2>/dev/null; then
    pass "uvicorn + fastapi available in pf's venv"
else
    fail "uvicorn or fastapi not available in pf's venv"
    summary
fi

# Check FastAPI app can be imported via pf's python
PF_BIN="$(which pf)"
PF_PYTHON="$(head -1 "$PF_BIN" | sed 's/^#!//')"
if $PF_PYTHON -c "from pf.wheelhub.app import create_app; app = create_app(); print('ok')" 2>/dev/null; then
    pass "WheelHub FastAPI app imports successfully"
else
    fail "WheelHub FastAPI app import failed"
    summary
fi

# --- Create a minimal project dir ---
echo ""
echo "Setting up test project ..."
create_repo "$WORKSPACE/wheelhub-test"
cd "$WORKSPACE/wheelhub-test"
pf init --yes . 2>&1 | tail -1

# --- Start WheelHub via uvicorn ---
echo ""
echo "Starting WheelHub (5 second timeout) ..."

WHEELHUB_LOG="/tmp/wheelhub-test.log"
WHEELHUB_PORT=18980

# Start uvicorn using pf's python (same as launcher.py which uses sys.executable)
$PF_PYTHON -m uvicorn pf.wheelhub.app:create_app \
    --factory --host 127.0.0.1 --port "$WHEELHUB_PORT" \
    > "$WHEELHUB_LOG" 2>&1 &
WHEELHUB_PID=$!

# Wait for startup (up to 5 seconds)
set +e
STARTED=false
for i in $(seq 1 50); do
    sleep 0.1
    if curl -sf "http://127.0.0.1:${WHEELHUB_PORT}/health" 2>/dev/null | grep -q "ok"; then
        STARTED=true
        break
    fi
    # Check if process died
    if ! kill -0 "$WHEELHUB_PID" 2>/dev/null; then
        break
    fi
done

if [[ "$STARTED" == true ]]; then
    pass "WheelHub started and /health returns ok"
else
    if ! kill -0 "$WHEELHUB_PID" 2>/dev/null; then
        wait "$WHEELHUB_PID" 2>/dev/null
        EXIT_CODE=$?
        fail "WheelHub process died (exit $EXIT_CODE)"
        echo "  --- Log output ---"
        head -30 "$WHEELHUB_LOG" | sed 's/^/  /'
        echo "  ------------------"
    else
        fail "WheelHub process alive but /health not responding"
        echo "  --- Log output ---"
        head -30 "$WHEELHUB_LOG" | sed 's/^/  /'
        echo "  ------------------"
    fi
fi

# --- Test OTLP endpoint accepts data ---
if [[ "$STARTED" == true ]]; then
    echo ""
    echo "Testing OTLP trace endpoint ..."
    HTTP_CODE=$(curl -sf -o /dev/null -w '%{http_code}' \
        -X POST "http://127.0.0.1:${WHEELHUB_PORT}/v1/traces" \
        -H "Content-Type: application/json" \
        -d '{"resourceSpans":[]}' 2>/dev/null)
    if [[ "$HTTP_CODE" == "200" ]]; then
        pass "POST /v1/traces returns 200"
    else
        fail "POST /v1/traces returned $HTTP_CODE (expected 200)"
    fi
fi

# --- Test WebSocket endpoint is routable ---
if [[ "$STARTED" == true ]] && command -v python3 &>/dev/null; then
    echo ""
    echo "Testing WebSocket endpoint ..."
    # Just check the upgrade request doesn't 404
    WS_CODE=$(curl -sf -o /dev/null -w '%{http_code}' \
        "http://127.0.0.1:${WHEELHUB_PORT}/ws/sprint" 2>/dev/null || echo "000")
    # WebSocket endpoints return 403 for non-upgrade HTTP requests in FastAPI
    if [[ "$WS_CODE" == "403" || "$WS_CODE" == "426" ]]; then
        pass "WebSocket endpoint /ws/sprint routable (HTTP $WS_CODE without upgrade)"
    elif [[ "$WS_CODE" == "200" ]]; then
        pass "WebSocket endpoint /ws/sprint exists"
    else
        warn "WebSocket endpoint /ws/sprint returned HTTP $WS_CODE"
    fi
fi

# Cleanup
kill "$WHEELHUB_PID" 2>/dev/null
wait "$WHEELHUB_PID" 2>/dev/null
set -e

summary
