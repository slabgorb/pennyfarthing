#!/bin/bash
# Agent session management script
# Usage: agent-session.sh <action> [agent-name] [options]
#   start "agent-name"  - Register agent session and output persona
#   stop                - Remove current session
#   status              - Output for Claude Code statusLine (reads JSON from stdin)

# Use fixed home directory location - works regardless of which repo we're in
AGENT_FILE="$HOME/.claude-current-agent"

# Find project root (script is in $PROJECT_ROOT/scripts/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Function to output persona for an agent
output_persona() {
  local agent_name="$1"
  local config_file=""
  local theme=""
  local theme_file=""

  # Check for local config first, then default
  if [ -f "$PROJECT_ROOT/.claude/persona-config.local.yaml" ]; then
    config_file="$PROJECT_ROOT/.claude/persona-config.local.yaml"
  elif [ -f "$PROJECT_ROOT/.claude/persona-config.yaml" ]; then
    config_file="$PROJECT_ROOT/.claude/persona-config.yaml"
  else
    echo "<!-- No persona config found -->" >&2
    return 1
  fi

  # Get theme from config
  theme=$(yq '.theme' "$config_file" 2>/dev/null)
  if [ -z "$theme" ] || [ "$theme" = "null" ]; then
    echo "<!-- No theme configured -->" >&2
    return 1
  fi

  # Find theme file (check both .claude/personas and personas/)
  if [ -f "$PROJECT_ROOT/.claude/personas/themes/${theme}.yaml" ]; then
    theme_file="$PROJECT_ROOT/.claude/personas/themes/${theme}.yaml"
  elif [ -f "$PROJECT_ROOT/personas/themes/${theme}.yaml" ]; then
    theme_file="$PROJECT_ROOT/personas/themes/${theme}.yaml"
  else
    echo "<!-- Theme file not found: ${theme}.yaml -->" >&2
    return 1
  fi

  # Extract agent persona
  local persona=$(yq ".agents.${agent_name}" "$theme_file" 2>/dev/null)
  if [ -z "$persona" ] || [ "$persona" = "null" ]; then
    echo "<!-- No persona found for agent: ${agent_name} -->" >&2
    return 1
  fi

  # Output persona in a format Claude can use
  echo ""
  echo "<persona agent=\"${agent_name}\" theme=\"${theme}\">"
  echo "Character: $(yq ".agents.${agent_name}.character" "$theme_file")"
  echo "Style: $(yq ".agents.${agent_name}.style" "$theme_file")"
  echo "Role: $(yq ".agents.${agent_name}.role" "$theme_file")"

  # Optional fields
  local trait=$(yq ".agents.${agent_name}.trait // \"\"" "$theme_file")
  [ -n "$trait" ] && [ "$trait" != "null" ] && [ "$trait" != "" ] && echo "Trait: $trait"

  local quirk=$(yq ".agents.${agent_name}.quirk // \"\"" "$theme_file")
  [ -n "$quirk" ] && [ "$quirk" != "null" ] && [ "$quirk" != "" ] && echo "Quirk: $quirk"

  local motto=$(yq ".agents.${agent_name}.motto // \"\"" "$theme_file")
  [ -n "$motto" ] && [ "$motto" != "null" ] && [ "$motto" != "" ] && echo "Motto: $motto"

  local quote=$(yq ".agents.${agent_name}.quote // \"\"" "$theme_file")
  [ -n "$quote" ] && [ "$quote" != "null" ] && [ "$quote" != "" ] && echo "Quote: $quote"

  # Helper info
  local helper_name=$(yq ".agents.${agent_name}.helper.name // \"\"" "$theme_file")
  local helper_style=$(yq ".agents.${agent_name}.helper.style // \"\"" "$theme_file")
  if [ -n "$helper_name" ] && [ "$helper_name" != "null" ] && [ "$helper_name" != "" ]; then
    echo "Helper: ${helper_name} - ${helper_style}"
  fi

  echo "</persona>"
}

case "$1" in
  start)
    if [ -z "$2" ]; then
      echo "Usage: agent-session.sh start \"agent-name\"" >&2
      exit 1
    fi
    echo "$2" > "$AGENT_FILE"
    echo "Session: $(basename "$AGENT_FILE")"

    # Always output persona on start
    output_persona "$2"
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
