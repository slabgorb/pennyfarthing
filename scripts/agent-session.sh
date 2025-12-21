#!/bin/bash
# Agent session management script
# Usage: agent-session.sh <action> [agent-name]
#   start "Agent Name"  - Register agent session
#   stop                - Remove current session
#   status              - Output for Claude Code statusLine (reads JSON from stdin)

# Use fixed home directory location - works regardless of which repo we're in
AGENT_FILE="$HOME/.claude-current-agent"

case "$1" in
  start)
    if [ -z "$2" ]; then
      echo "Usage: agent-session.sh start \"Agent Name\"" >&2
      exit 1
    fi
    echo "$2" > "$AGENT_FILE"
    echo "Session: $(basename "$AGENT_FILE")"
    ;;
  stop)
    rm -f "$AGENT_FILE" 2>/dev/null
    echo "Agent session closed."
    ;;
  status)
    # Read JSON from stdin (Claude Code statusLine passes context)
    input=$(cat)

    # Try to get transcript_path from stdin JSON
    TRANSCRIPT_PATH=""
    if command -v jq &>/dev/null && [ -n "$input" ]; then
      TRANSCRIPT_PATH=$(echo "$input" | jq -r '.transcript_path // empty' 2>/dev/null)
    fi

    # Fallback: find most recent transcript in project
    if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
      CLAUDE_PROJECT="$HOME/.claude/projects/$PROJECT_CLAUDE_PATH"
      if [ -d "$CLAUDE_PROJECT" ]; then
        TRANSCRIPT_PATH=$(ls -t "$CLAUDE_PROJECT"/*.jsonl 2>/dev/null | grep -v "agent-" | head -1)
      fi
    fi

    # Calculate context from transcript
    CONTEXT_INFO="--"
    if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
      RESULT=$(python3 -c "
import json
import sys

try:
    with open('$TRANSCRIPT_PATH', 'r') as f:
        lines = f.readlines()

    for line in reversed(lines):
        try:
            data = json.loads(line.strip())
            if 'message' in data and 'usage' in data['message']:
                usage = data['message']['usage']
                total = usage.get('cache_read_input_tokens', 0) + usage.get('cache_creation_input_tokens', 0) + usage.get('input_tokens', 0)
                pct = (total / 200000) * 100
                print(f'{pct:.0f}%')
                break
        except:
            continue
except:
    print('--')
" 2>/dev/null)
      if [ -n "$RESULT" ]; then
        CONTEXT_INFO="$RESULT"
      fi
    fi

    # Get agent name
    if [ -f "$AGENT_FILE" ]; then
      AGENT=$(cat "$AGENT_FILE")
    else
      AGENT="No agent"
    fi

    echo "[$CONTEXT_INFO] $AGENT"
    ;;
  *)
    echo "Usage: agent-session.sh <start|stop|status> [agent-name]" >&2
    exit 1
    ;;
esac
