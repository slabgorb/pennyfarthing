#!/usr/bin/env bash
# check-context.sh - Check current Claude Code context usage
# Returns: percentage and recommendation for handoff
#
# This is a thin wrapper around pennyfarthing_scripts/context.py
#
# Usage:
#   ./check-context.sh                    # Output env vars (most recent transcript)
#   ./check-context.sh --human            # Human-readable output
#   ./check-context.sh --session <id>     # Check specific session transcript
#   eval $(./check-context.sh)            # Load vars into shell

set -euo pipefail

echo "DEPRECATED: check-context.sh — use 'pf context' instead" >&2

# Find project root (where pennyfarthing_scripts lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

# Resolve symlinks to find actual location
REAL_SCRIPT="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
REAL_DIR="$(cd "$(dirname "$REAL_SCRIPT")" && pwd -P)"

# Determine if we're in pennyfarthing-dist (3 levels up to package root)
# or in node_modules (need to find project root differently)
if [[ "$REAL_DIR" == *"/pennyfarthing-dist/scripts/core" ]]; then
    # In pennyfarthing source or node_modules/@pennyfarthing/core
    PACKAGE_ROOT="${REAL_DIR%/pennyfarthing-dist/scripts/core}"
elif [[ "$REAL_DIR" == *"/node_modules/"* ]]; then
    # In node_modules, walk up to find project root
    PACKAGE_ROOT="${REAL_DIR}"
    while [[ "$PACKAGE_ROOT" != "/" ]] && [[ ! -d "$PACKAGE_ROOT/pennyfarthing_scripts" ]]; do
        PACKAGE_ROOT="$(dirname "$PACKAGE_ROOT")"
    done
fi

# Try to find pennyfarthing_scripts
PYTHON_MODULE=""
if [[ -f "$PACKAGE_ROOT/pennyfarthing_scripts/context.py" ]]; then
    PYTHON_MODULE="$PACKAGE_ROOT/pennyfarthing_scripts/context.py"
elif [[ -f "${PROJECT_ROOT:-}/pennyfarthing_scripts/context.py" ]]; then
    PYTHON_MODULE="${PROJECT_ROOT}/pennyfarthing_scripts/context.py"
elif [[ -f "${PROJECT_ROOT:-}/pennyfarthing/pennyfarthing_scripts/context.py" ]]; then
    # Dogfood: orchestrator inlines framework at pennyfarthing/
    PYTHON_MODULE="${PROJECT_ROOT}/pennyfarthing/pennyfarthing_scripts/context.py"
fi

# If Python module exists, use it
if [[ -n "$PYTHON_MODULE" ]]; then
    exec python3 "$PYTHON_MODULE" "$@"
fi

# Fallback: inline implementation for environments without the Python module
# This ensures backwards compatibility

# Parse command line arguments
HUMAN_MODE=false
EXPLICIT_SESSION=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --human)
            HUMAN_MODE=true
            shift
            ;;
        --session)
            EXPLICIT_SESSION="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# Derive Claude project path from current directory
PROJECT_DIR="${PROJECT_ROOT:-$(pwd)}"
# Claude Code replaces slashes AND dots (e.g. in usernames) with dashes
CLAUDE_PROJECT_PATH="$HOME/.claude/projects/$(echo "$PROJECT_DIR" | tr '/.' '--')"

# Default config
WARNING_THRESHOLD=60
CRITICAL_THRESHOLD=85
MAX_TOKENS=200000
TIREPUMP_THRESHOLD=60
PERMISSION_MODE="manual"
RELAY_MODE="false"

# Load config from .pennyfarthing/config.local.yaml if available
CONFIG_FILE="${PROJECT_DIR}/.pennyfarthing/config.local.yaml"
if [[ -f "$CONFIG_FILE" ]] && command -v python3 &>/dev/null; then
    eval "$(python3 -c "
import yaml
try:
    with open('$CONFIG_FILE') as f:
        c = yaml.safe_load(f) or {}
    cb = c.get('context_budget', {})
    wf = c.get('workflow', {})
    print(f'WARNING_THRESHOLD={cb.get(\"warning_threshold\", 60)}')
    print(f'CRITICAL_THRESHOLD={cb.get(\"critical_threshold\", 85)}')
    print(f'MAX_TOKENS={cb.get(\"max_tokens\", 200000)}')
    print(f'TIREPUMP_THRESHOLD={cb.get(\"tirepump_threshold\", 60)}')
    print(f'PERMISSION_MODE={wf.get(\"permission_mode\", \"manual\")}')
    print(f'RELAY_MODE={str(wf.get(\"relay_mode\", False)).lower()}')
except: pass
" 2>/dev/null)" || true
fi

# Find transcript with stale SESSION_ID handling
find_most_recent() {
    ls -t "$CLAUDE_PROJECT_PATH"/*.jsonl 2>/dev/null | grep -v "agent-" | head -1
}

TRANSCRIPT=""
if [[ -n "$EXPLICIT_SESSION" ]]; then
    TRANSCRIPT="$CLAUDE_PROJECT_PATH/${EXPLICIT_SESSION}.jsonl"
    [[ ! -f "$TRANSCRIPT" ]] && { echo "CONTEXT_ERROR=session_not_found"; exit 1; }
elif [[ -n "${SESSION_ID:-}" ]]; then
    CANDIDATE="$CLAUDE_PROJECT_PATH/${SESSION_ID}.jsonl"
    if [[ -f "$CANDIDATE" ]]; then
        NOW=$(date +%s)
        MOD_TIME=$(stat -f %m "$CANDIDATE" 2>/dev/null || stat -c %Y "$CANDIDATE" 2>/dev/null || echo 0)
        AGE=$((NOW - MOD_TIME))
        if [[ "$AGE" -lt 60 ]]; then
            TRANSCRIPT="$CANDIDATE"
        else
            TRANSCRIPT=$(find_most_recent)
        fi
    else
        TRANSCRIPT=$(find_most_recent)
    fi
else
    TRANSCRIPT=$(find_most_recent)
fi

[[ -z "$TRANSCRIPT" ]] && { echo "CONTEXT_ERROR=no_transcript"; exit 1; }

# Parse transcript
RESULT=$(python3 -c "
import json, os
from pathlib import Path

with open('$TRANSCRIPT') as f:
    first_total = last_total = None
    for line in f:
        try:
            data = json.loads(line.strip())
            if 'message' in data and 'usage' in data['message']:
                u = data['message']['usage']
                total = u.get('input_tokens',0) + u.get('cache_read_input_tokens',0) + u.get('cache_creation_input_tokens',0)
                if first_total is None: first_total = total
                last_total = total
        except: continue

if last_total:
    baseline = first_total or 0
    usable = last_total - baseline
    available = $MAX_TOKENS - baseline
    usable_pct = int((usable / available * 100) if available > 0 else 0)
    total_pct = int((last_total / $MAX_TOKENS) * 100)
    status = 'HIGH' if usable_pct > $WARNING_THRESHOLD else 'OK'
    relay = '$RELAY_MODE' == 'true'
    tirepump = (relay or '$PERMISSION_MODE' == 'turbo') and usable_pct > $TIREPUMP_THRESHOLD
    is_cyclist = os.environ.get('CYCLIST') == '1' or Path('$PROJECT_DIR/packages/cyclist/.wheelhub-port').exists() or Path('$PROJECT_DIR/.bikerack-port').exists()

    print(f'CONTEXT_TOKENS={last_total}')
    print(f'CONTEXT_PERCENT={total_pct}')
    print(f'CONTEXT_BASELINE={baseline}')
    print(f'CONTEXT_USABLE_TOKENS={usable}')
    print(f'CONTEXT_USABLE_PERCENT={usable_pct}')
    print(f'CONTEXT_AVAILABLE={available}')
    print(f'CONTEXT_STATUS={status}')
    print(f'PERMISSION_MODE=$PERMISSION_MODE')
    print(f'RELAY_MODE=$RELAY_MODE')
    print(f'HANDOFF_MODE={\"auto\" if relay else \"ask\"}')
    print(f'USE_TIREPUMP={str(tirepump).lower()}')
    print(f'IS_CYCLIST={str(is_cyclist).lower()}')
    if usable_pct >= $CRITICAL_THRESHOLD:
        print('CONTEXT_WARNING=Critical')
        print(\"CONTEXT_RECOMMENDATION='checkpoint and handoff recommended'\")
    elif usable_pct >= $WARNING_THRESHOLD:
        print('CONTEXT_WARNING=High')
        print(\"CONTEXT_RECOMMENDATION='consider handoff soon'\")
" 2>/dev/null)

if [[ "$HUMAN_MODE" == "true" ]]; then
    eval "$RESULT"
    if [[ "${USE_TIREPUMP:-}" == "true" ]]; then
        echo "🔄 Context: ${CONTEXT_USABLE_PERCENT}% used (${CONTEXT_USABLE_TOKENS} of ${CONTEXT_AVAILABLE} available) - TIREPUMP"
    elif [[ "${CONTEXT_STATUS:-}" == "HIGH" ]]; then
        echo "⚠️  Context: ${CONTEXT_USABLE_PERCENT}% used (${CONTEXT_USABLE_TOKENS} of ${CONTEXT_AVAILABLE} available) - HIGH"
    else
        echo "✅ Context: ${CONTEXT_USABLE_PERCENT:-?}% used (${CONTEXT_USABLE_TOKENS:-?} of ${CONTEXT_AVAILABLE:-?} available)"
    fi
    echo "   Overhead: ${CONTEXT_BASELINE:-?} tokens (system prompt + tools)"
    echo "   Mode: ${PERMISSION_MODE:-manual}"
    [[ "${CONTEXT_WARNING:-}" == "Critical" ]] && echo "CONTEXT_WARNING: Critical - checkpoint and handoff recommended"
    [[ "${CONTEXT_WARNING:-}" == "High" ]] && echo "CONTEXT_WARNING: High - consider handoff soon"
else
    echo "$RESULT"
fi
