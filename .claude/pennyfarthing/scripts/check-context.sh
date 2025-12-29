#!/usr/bin/env zsh
# check-context.sh - Check current Claude Code context usage
# Returns: percentage and recommendation for handoff
#
# Usage:
#   ./check-context.sh          # Output env vars
#   ./check-context.sh --human  # Human-readable output
#   eval $(./check-context.sh)  # Load vars into shell

# Derive Claude project path from current directory
# Claude Code stores transcripts at ~/.claude/projects/<path-with-dashes>
# The path format is: -Users-name-Projects-project (leading dash, all slashes become dashes)
PROJECT_DIR="${PROJECT_ROOT:-$(pwd)}"
CLAUDE_PROJECT_PATH="$HOME/.claude/projects/$(echo "$PROJECT_DIR" | tr '/' '-')"

# Find most recent transcript (current session)
TRANSCRIPT=$(ls -t "$CLAUDE_PROJECT_PATH"/*.jsonl 2>/dev/null | grep -v "agent-" | head -1)

if [ -z "$TRANSCRIPT" ]; then
    if [ "$1" = "--human" ]; then
        echo "⚠️  Context: unknown (no transcript found)"
    else
        echo "CONTEXT_ERROR=no_transcript"
    fi
    exit 1
fi

# Parse last message for usage data
RESULT=$(python3 -c "
import sys
import json

with open('$TRANSCRIPT', 'r') as f:
    lines = f.readlines()

# Find last line with usage data
for line in reversed(lines):
    try:
        data = json.loads(line.strip())
        if 'message' in data and 'usage' in data['message']:
            usage = data['message']['usage']
            input_t = usage.get('input_tokens', 0)
            cache_read = usage.get('cache_read_input_tokens', 0)
            cache_create = usage.get('cache_creation_input_tokens', 0)

            total = cache_read + cache_create + input_t
            pct = (total / 200000) * 100

            print(f'CONTEXT_TOKENS={total}')
            print(f'CONTEXT_PERCENT={pct:.0f}')
            # Leave 30% buffer: 70% threshold + 25% buffer before auto-compact (95%)
            if pct > 70:
                print('CONTEXT_STATUS=HIGH')
                print('HANDOFF_MODE=auto')
            else:
                print('CONTEXT_STATUS=OK')
                print('HANDOFF_MODE=ask')
            break
    except:
        continue
" 2>/dev/null)

if [ "$1" = "--human" ]; then
    eval "$RESULT"
    if [ "$CONTEXT_STATUS" = "HIGH" ]; then
        echo "⚠️  Context: ${CONTEXT_PERCENT}% (${CONTEXT_TOKENS} tokens) - AUTO-HANDOFF"
    else
        echo "✅ Context: ${CONTEXT_PERCENT}% (${CONTEXT_TOKENS} tokens) - OK to continue"
    fi

    # Output warning messages at thresholds
    if [ -n "$CONTEXT_PERCENT" ]; then
        if [ "$CONTEXT_PERCENT" -ge 90 ] 2>/dev/null; then
            echo "CONTEXT_WARNING: Critical (${CONTEXT_PERCENT}%) - checkpoint and handoff recommended"
        elif [ "$CONTEXT_PERCENT" -ge 70 ] 2>/dev/null; then
            echo "CONTEXT_WARNING: High (${CONTEXT_PERCENT}%) - consider handoff soon"
        fi
    fi
else
    echo "$RESULT"

    # Also output warnings in non-human mode for scripting
    eval "$RESULT" 2>/dev/null || true
    if [ -n "$CONTEXT_PERCENT" ]; then
        if [ "$CONTEXT_PERCENT" -ge 90 ] 2>/dev/null; then
            echo "CONTEXT_WARNING=Critical"
            echo "CONTEXT_RECOMMENDATION=checkpoint and handoff recommended"
        elif [ "$CONTEXT_PERCENT" -ge 70 ] 2>/dev/null; then
            echo "CONTEXT_WARNING=High"
            echo "CONTEXT_RECOMMENDATION=consider handoff soon"
        fi
    fi
fi
