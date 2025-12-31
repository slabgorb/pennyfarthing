#!/usr/bin/env zsh
# Agent session management script
# Usage: agent-session.sh <action> [agent-name] [session-id]
#   start "agent-name" "session-id"  - Register agent session and output persona
#   stop "session-id"                - Remove session for given ID
#   stop-all                         - Remove all agent sessions
#   status                           - Output for Claude Code statusLine (reads JSON from stdin)
#
# Session files stored in .session/agents/<session-id> for multi-session support

# Find project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/utils/find-root.sh"

# Agents directory for multi-session support
AGENTS_DIR="$PROJECT_ROOT/.session/agents"

# Check if character_voice preference is enabled
# Returns 0 (true) if enabled or not set, 1 (false) if explicitly disabled
is_character_voice_enabled() {
  local prefs_file=""

  # Check for local prefs first, then default
  if [ -f "$PROJECT_ROOT/.claude/pennyfarthing/preferences.local.yaml" ]; then
    prefs_file="$PROJECT_ROOT/.claude/pennyfarthing/preferences.local.yaml"
  elif [ -f "$PROJECT_ROOT/.claude/pennyfarthing/preferences.yaml" ]; then
    prefs_file="$PROJECT_ROOT/.claude/pennyfarthing/preferences.yaml"
  else
    # No preferences file = default to enabled
    return 0
  fi

  # Read character_voice setting (default to true if not set)
  local voice=$(yq '.character_voice' "$prefs_file" 2>/dev/null)
  # If null/empty, default to enabled
  if [ -z "$voice" ] || [ "$voice" = "null" ]; then
    return 0
  fi
  # If explicitly false, return disabled
  if [ "$voice" = "false" ]; then
    return 1
  fi
  return 0
}

# Get agent file path for a session
get_agent_file() {
    local session_id="$1"
    echo "$AGENTS_DIR/$session_id"
}

# Check if theme version matches current Pennyfarthing version
# Only warns on major/minor mismatch, not patch
# Arguments: theme_file, theme_name
check_theme_version() {
  local theme_file="$1"
  local theme_name="$2"

  # Only check custom themes (in .claude/pennyfarthing/themes/)
  if [[ ! "$theme_file" == *".claude/pennyfarthing/themes/"* ]]; then
    return 0
  fi

  # Get theme's pennyfarthing_version
  local theme_version=$(yq '.theme.pennyfarthing_version // ""' "$theme_file" 2>/dev/null)
  if [ -z "$theme_version" ] || [ "$theme_version" = "null" ] || [ "$theme_version" = "" ]; then
    # No version in theme - skip warning (legacy custom theme)
    return 0
  fi

  # Get current version from VERSION file
  local version_file="$PROJECT_ROOT/VERSION"
  if [ ! -f "$version_file" ]; then
    # No VERSION file - skip warning
    return 0
  fi
  local current_version=$(cat "$version_file" 2>/dev/null | tr -d '[:space:]')
  if [ -z "$current_version" ]; then
    return 0
  fi

  # Extract major.minor from both versions
  local theme_major_minor=$(echo "$theme_version" | cut -d. -f1,2)
  local current_major_minor=$(echo "$current_version" | cut -d. -f1,2)

  # Compare major.minor only
  if [ "$theme_major_minor" != "$current_major_minor" ]; then
    echo "" >&2
    echo "Warning: Theme '${theme_name}' was created with Pennyfarthing ${theme_version}" >&2
    echo "         Current version: ${current_version} - agent roles may have changed." >&2
    echo "         Run '/theme-maker --update ${theme_name}' to review." >&2
    echo "" >&2
  fi

  return 0
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

  # Find theme file (check custom themes first, then built-in locations)
  # Custom themes: .claude/pennyfarthing/themes/
  # Built-in: .claude/personas/themes/ and personas/themes/
  if [ -f "$PROJECT_ROOT/.claude/pennyfarthing/themes/${theme}.yaml" ]; then
    theme_file="$PROJECT_ROOT/.claude/pennyfarthing/themes/${theme}.yaml"
  elif [ -f "$PROJECT_ROOT/.claude/personas/themes/${theme}.yaml" ]; then
    theme_file="$PROJECT_ROOT/.claude/personas/themes/${theme}.yaml"
  elif [ -f "$PROJECT_ROOT/personas/themes/${theme}.yaml" ]; then
    theme_file="$PROJECT_ROOT/personas/themes/${theme}.yaml"
  else
    echo "<!-- Theme file not found: ${theme}.yaml -->" >&2
    return 1
  fi

  # Check theme version compatibility (warns on major/minor mismatch)
  check_theme_version "$theme_file" "$theme"

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

  # Output crew manifest so agents know other characters
  echo ""
  echo "<crew theme=\"${theme}\">"
  echo "When handing off to other agents, address them by character name:"
  for role in sm tea dev reviewer architect pm tech-writer ux-designer devops orchestrator; do
    local char=$(yq ".agents.${role}.character // \"\"" "$theme_file" 2>/dev/null)
    if [ -n "$char" ] && [ "$char" != "null" ] && [ "$char" != "" ]; then
      printf "  %-12s %s\n" "${role}:" "$char"
    fi
  done
  echo "</crew>"
}

case "$1" in
  start)
    if [ -z "$2" ]; then
      echo "Usage: agent-session.sh start \"agent-name\" [session-id]" >&2
      exit 1
    fi
    # Use provided session ID, fall back to SESSION_ID env var, then generate one
    session_id="${3:-$SESSION_ID}"
    if [ -z "$session_id" ]; then
      # Generate a session ID if not provided (for fresh sessions)
      session_id=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s)
    fi
    mkdir -p "$AGENTS_DIR"

    # Clean up old session files (older than 7 days) to prevent accumulation
    find "$AGENTS_DIR" -type f -mtime +7 -delete 2>/dev/null || true

    AGENT_FILE=$(get_agent_file "$session_id")
    echo "$2" > "$AGENT_FILE"
    echo "Session: $session_id -> $2"

    # Output persona on start (unless character_voice is disabled)
    if is_character_voice_enabled; then
      output_persona "$2"
    fi
    ;;
  stop)
    # Use provided session ID, fall back to SESSION_ID env var
    session_id="${2:-$SESSION_ID}"
    if [ -z "$session_id" ]; then
      echo "Usage: agent-session.sh stop [session-id]" >&2
      exit 1
    fi
    # Clear the agent file for this session
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
