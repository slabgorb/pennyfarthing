#!/usr/bin/env zsh
# check-context.sh - Check current Claude Code context usage
# Returns: percentage and recommendation for handoff
#
# Usage:
#   ./check-context.sh                    # Output env vars (most recent transcript)
#   ./check-context.sh --human            # Human-readable output
#   ./check-context.sh --session <id>     # Check specific session transcript
#   SESSION_ID=<id> ./check-context.sh    # Alternative: session via env var
#   eval $(./check-context.sh)            # Load vars into shell

# Parse command line arguments
HUMAN_MODE=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --human)
            HUMAN_MODE=true
            shift
            ;;
        --session)
            SESSION_ID="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# Derive Claude project path from current directory
# Claude Code stores transcripts at ~/.claude/projects/<path-with-dashes>
# The path format is: -Users-name-Projects-project (leading dash, all slashes become dashes)
PROJECT_DIR="${PROJECT_ROOT:-$(pwd)}"
CLAUDE_PROJECT_PATH="$HOME/.claude/projects/$(echo "$PROJECT_DIR" | tr '/' '-')"

# Default thresholds (can be overridden by settings.local.json)
DEFAULT_IMMINENT_THRESHOLD=65
DEFAULT_WARNING_THRESHOLD=60
DEFAULT_CRITICAL_THRESHOLD=85
DEFAULT_MAX_TOKENS=200000

# Load thresholds and permission_mode from .pennyfarthing/config.local.yaml (preferred) or settings.local.json (fallback)
PENNYFARTHING_CONFIG="${CLAUDE_PROJECT_DIR:-$PROJECT_DIR}/.pennyfarthing/config.local.yaml"
SETTINGS_FILE="${CLAUDE_PROJECT_DIR:-$PROJECT_DIR}/.claude/settings.local.json"
CONFIG=$(python3 -c "
import json
import sys

imminent_threshold = $DEFAULT_IMMINENT_THRESHOLD
warning_threshold = $DEFAULT_WARNING_THRESHOLD
critical_threshold = $DEFAULT_CRITICAL_THRESHOLD
max_tokens = $DEFAULT_MAX_TOKENS
permission_mode = 'manual'  # Default to manual

# First try .pennyfarthing/config.local.yaml (preferred location)
try:
    import yaml
    with open('$PENNYFARTHING_CONFIG', 'r') as f:
        config = yaml.safe_load(f)
        if config:
            if 'context_budget' in config:
                cb = config['context_budget']
                imminent_threshold = cb.get('imminent_threshold', imminent_threshold)
                warning_threshold = cb.get('warning_threshold', warning_threshold)
                critical_threshold = cb.get('critical_threshold', critical_threshold)
                max_tokens = cb.get('max_tokens', max_tokens)
            # Read permission_mode from workflow section
            if 'workflow' in config and 'permission_mode' in config['workflow']:
                permission_mode = config['workflow']['permission_mode']
except:
    # Fallback to settings.local.json (legacy location)
    try:
        with open('$SETTINGS_FILE', 'r') as f:
            settings = json.load(f)
            if 'context_budget' in settings:
                cb = settings['context_budget']
                imminent_threshold = cb.get('imminent_threshold', imminent_threshold)
                warning_threshold = cb.get('warning_threshold', warning_threshold)
                critical_threshold = cb.get('critical_threshold', critical_threshold)
                max_tokens = cb.get('max_tokens', max_tokens)
            if 'workflow' in settings and 'permission_mode' in settings['workflow']:
                permission_mode = settings['workflow']['permission_mode']
    except:
        pass

print(f'IMMINENT_THRESHOLD={imminent_threshold}')
print(f'WARNING_THRESHOLD={warning_threshold}')
print(f'CRITICAL_THRESHOLD={critical_threshold}')
print(f'MAX_TOKENS={max_tokens}')
print(f'PERMISSION_MODE={permission_mode}')
" 2>/dev/null)

# Apply config or use defaults
eval "$CONFIG" 2>/dev/null || {
    IMMINENT_THRESHOLD=$DEFAULT_IMMINENT_THRESHOLD
    WARNING_THRESHOLD=$DEFAULT_WARNING_THRESHOLD
    CRITICAL_THRESHOLD=$DEFAULT_CRITICAL_THRESHOLD
    MAX_TOKENS=$DEFAULT_MAX_TOKENS
}

# Find transcript - either specific session or most recent
if [ -n "$SESSION_ID" ]; then
    # Session-specific: look for transcript with matching session ID
    TRANSCRIPT="$CLAUDE_PROJECT_PATH/${SESSION_ID}.jsonl"
    if [ ! -f "$TRANSCRIPT" ]; then
        if [ "$HUMAN_MODE" = "true" ]; then
            echo "⚠️  Context: unknown (session transcript not found: $SESSION_ID)"
        else
            echo "CONTEXT_ERROR=session_not_found"
            echo "CONTEXT_SESSION=$SESSION_ID"
        fi
        exit 1
    fi
else
    # Default: find most recent transcript (current session)
    TRANSCRIPT=$(ls -t "$CLAUDE_PROJECT_PATH"/*.jsonl 2>/dev/null | grep -v "agent-" | head -1)
    if [ -z "$TRANSCRIPT" ]; then
        if [ "$HUMAN_MODE" = "true" ]; then
            echo "⚠️  Context: unknown (no transcript found)"
        else
            echo "CONTEXT_ERROR=no_transcript"
        fi
        exit 1
    fi
fi

# Parse transcript for baseline (first turn) and current (last turn) usage data
# Baseline = system prompt overhead, cached per session
# Usable = current - baseline (what the user's conversation has consumed)
RESULT=$(python3 -c "
import sys
import json

warning_threshold = $WARNING_THRESHOLD
max_tokens = $MAX_TOKENS
permission_mode = '$PERMISSION_MODE'
tirepump_threshold = 60  # Threshold for TirePump auto-handoff

with open('$TRANSCRIPT', 'r') as f:
    lines = f.readlines()

# Find first and last lines with usage data
first_total = None
last_total = None

for line in lines:
    try:
        data = json.loads(line.strip())
        if 'message' in data and 'usage' in data['message']:
            usage = data['message']['usage']
            input_t = usage.get('input_tokens', 0)
            cache_read = usage.get('cache_read_input_tokens', 0)
            cache_create = usage.get('cache_creation_input_tokens', 0)
            total = cache_read + cache_create + input_t

            if first_total is None:
                first_total = total
            last_total = total
    except:
        continue

if last_total is not None:
    # Baseline is first turn's total (system prompt + tools + CLAUDE.md etc)
    baseline = first_total if first_total is not None else 0

    # Usable tokens = what user's conversation has consumed
    usable_tokens = last_total - baseline

    # Available capacity = max minus baseline overhead
    available_capacity = max_tokens - baseline

    # Usable percent = conversation usage as % of available capacity
    usable_pct = (usable_tokens / available_capacity * 100) if available_capacity > 0 else 0

    # Total percent (for backwards compatibility)
    total_pct = (last_total / max_tokens) * 100

    # Output all values
    print(f'CONTEXT_TOKENS={last_total}')
    print(f'CONTEXT_PERCENT={total_pct:.0f}')
    print(f'CONTEXT_BASELINE={baseline}')
    print(f'CONTEXT_USABLE_TOKENS={usable_tokens}')
    print(f'CONTEXT_USABLE_PERCENT={usable_pct:.0f}')
    print(f'CONTEXT_AVAILABLE={available_capacity}')
    print(f'PERMISSION_MODE={permission_mode}')

    # Use usable percent for status decisions (more accurate for user)
    if usable_pct > warning_threshold:
        print('CONTEXT_STATUS=HIGH')
        print('HANDOFF_MODE=auto')
    else:
        print('CONTEXT_STATUS=OK')
        print('HANDOFF_MODE=ask')

    # TirePump: Use CONTEXT_CLEAR (clear + load next agent) when:
    # 1. permission_mode is 'turbo' (auto-handoff enabled)
    # 2. context > 60% (tirepump_threshold)
    # This enables continuous autonomous runs without manual intervention
    use_tirepump = permission_mode == 'turbo' and usable_pct > tirepump_threshold
    print(f'USE_TIREPUMP={str(use_tirepump).lower()}')
" 2>/dev/null)

if [ "$HUMAN_MODE" = "true" ]; then
    eval "$RESULT"
    if [ "$USE_TIREPUMP" = "true" ]; then
        echo "🔄 Context: ${CONTEXT_USABLE_PERCENT}% used (${CONTEXT_USABLE_TOKENS} of ${CONTEXT_AVAILABLE} available) - TIREPUMP (clear + next agent)"
    elif [ "$CONTEXT_STATUS" = "HIGH" ]; then
        echo "⚠️  Context: ${CONTEXT_USABLE_PERCENT}% used (${CONTEXT_USABLE_TOKENS} of ${CONTEXT_AVAILABLE} available) - AUTO-HANDOFF"
    else
        echo "✅ Context: ${CONTEXT_USABLE_PERCENT}% used (${CONTEXT_USABLE_TOKENS} of ${CONTEXT_AVAILABLE} available)"
    fi
    echo "   Overhead: ${CONTEXT_BASELINE} tokens (system prompt + tools)"
    echo "   Mode: ${PERMISSION_MODE}"

    # Output warning messages at configurable thresholds (use usable percent)
    if [ -n "$CONTEXT_USABLE_PERCENT" ]; then
        if [ "$CONTEXT_USABLE_PERCENT" -ge "$CRITICAL_THRESHOLD" ] 2>/dev/null; then
            echo "CONTEXT_WARNING: Critical (${CONTEXT_USABLE_PERCENT}%) - checkpoint and handoff recommended"
        elif [ "$CONTEXT_USABLE_PERCENT" -ge "$WARNING_THRESHOLD" ] 2>/dev/null; then
            echo "CONTEXT_WARNING: High (${CONTEXT_USABLE_PERCENT}%) - consider handoff soon"
        fi
    fi
else
    echo "$RESULT"

    # Also output warnings in non-human mode for scripting (use usable percent)
    eval "$RESULT" 2>/dev/null || true
    if [ -n "$CONTEXT_USABLE_PERCENT" ]; then
        if [ "$CONTEXT_USABLE_PERCENT" -ge "$CRITICAL_THRESHOLD" ] 2>/dev/null; then
            echo "CONTEXT_WARNING=Critical"
            echo "CONTEXT_RECOMMENDATION=checkpoint and handoff recommended"
        elif [ "$CONTEXT_USABLE_PERCENT" -ge "$WARNING_THRESHOLD" ] 2>/dev/null; then
            echo "CONTEXT_WARNING=High"
            echo "CONTEXT_RECOMMENDATION=consider handoff soon"
        fi
    fi
fi
