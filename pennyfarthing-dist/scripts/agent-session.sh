#!/usr/bin/env zsh
# Agent session management script
# Usage: agent-session.sh <action> [agent-name] [session-id]
#   start "agent-name" "session-id"  - Register agent session and output persona
#   stop "session-id"                - Remove session for given ID
#   stop-all                         - Remove all agent sessions
#   status                           - Output for Claude Code statusLine (reads JSON from stdin)
#
# Session files stored in .session/agents/<session-id> for multi-session support

# Find project root (script is in $PROJECT_ROOT/scripts/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Agents directory for multi-session support
AGENTS_DIR="$PROJECT_ROOT/.session/agents"

# Get agent file path for a session
get_agent_file() {
    local session_id="$1"
    echo "$AGENTS_DIR/$session_id"
}

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
      echo "Usage: agent-session.sh start \"agent-name\" [session-id]" >&2
      exit 1
    fi
    # Use provided session ID, fall back to SESSION_ID env var
    session_id="${3:-$SESSION_ID}"
    if [ -z "$session_id" ]; then
      echo "Error: No session ID provided and SESSION_ID not set" >&2
      exit 1
    fi
    mkdir -p "$AGENTS_DIR"
    AGENT_FILE=$(get_agent_file "$session_id")
    echo "$2" > "$AGENT_FILE"
    echo "Session: $session_id -> $2"

    # Always output persona on start
    output_persona "$2"
    ;;
  stop)
    # Use provided session ID, fall back to SESSION_ID env var
    session_id="${2:-$SESSION_ID}"
    if [ -z "$session_id" ]; then
      echo "Usage: agent-session.sh stop [session-id]" >&2
      exit 1
    fi
    AGENT_FILE=$(get_agent_file "$session_id")
    rm -f "$AGENT_FILE" 2>/dev/null
    echo "Agent session closed: $session_id"
    ;;
  stop-all)
    rm -rf "$AGENTS_DIR" 2>/dev/null
    echo "All agent sessions closed."
    ;;
  status)
    # Read JSON from stdin (Claude Code statusLine passes context)
    input=$(cat)

    # Get session ID from input
    session_id=""
    if command -v jq &>/dev/null && [ -n "$input" ]; then
      session_id=$(echo "$input" | jq -r '.session_id // empty' 2>/dev/null)
    fi

    # Get agent name for this session
    if [ -n "$session_id" ]; then
      AGENT_FILE=$(get_agent_file "$session_id")
      if [ -f "$AGENT_FILE" ]; then
        AGENT=$(cat "$AGENT_FILE")
      else
        AGENT=""
      fi
    else
      AGENT=""
    fi

    # Output just the agent name (statusline.sh handles the rest)
    echo "$AGENT"
    ;;
  list)
    # List all active agent sessions
    if [ -d "$AGENTS_DIR" ]; then
      for f in "$AGENTS_DIR"/*; do
        [ -f "$f" ] && echo "$(basename "$f"): $(cat "$f")"
      done
    else
      echo "No active sessions"
    fi
    ;;
  *)
    echo "Usage: agent-session.sh <start|stop|stop-all|status|list> [args]" >&2
    echo "  start \"agent\" \"session-id\"  - Register agent for session" >&2
    echo "  stop \"session-id\"            - Remove agent for session" >&2
    echo "  stop-all                      - Remove all agent sessions" >&2
    echo "  status                        - Get agent for session (reads JSON stdin)" >&2
    echo "  list                          - List all active sessions" >&2
    exit 1
    ;;
esac
