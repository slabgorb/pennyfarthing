#!/bin/bash
# Claude Code statusline - fixed-width segments
# Format: Agent- Character | repo | branch | model >>>> pct%

input=$(cat)

# Validate JSON
if ! echo "$input" | jq -e . >/dev/null 2>&1; then
    echo "⚠ invalid input"
    exit 0
fi

# Extract fields
cwd=$(echo "$input" | jq -r '.workspace.current_dir // empty' 2>/dev/null)
dir_name=$(basename "$cwd" 2>/dev/null || echo "?")
session_id=$(echo "$input" | jq -r '.session_id // empty' 2>/dev/null)

# Model name - clean up
model=$(echo "$input" | jq -r '
  if .model | type == "object" then .model.id // .model.name // "claude"
  elif .model | type == "string" then .model
  else "claude"
  end
' 2>/dev/null)
[ -z "$model" ] || [ "$model" = "null" ] && model="claude"
model=$(echo "$model" | sed 's/claude-//' | sed 's/-[0-9]*$//' | cut -c1-10)

# Git branch
branch=""
branch_dirty=""
if git -C "$cwd" rev-parse --git-dir > /dev/null 2>&1; then
    branch=$(git -C "$cwd" branch --show-current 2>/dev/null)
    [ -z "$branch" ] && branch=$(git -C "$cwd" rev-parse --short HEAD 2>/dev/null)

    # Check if dirty
    if [ -n "$(git -C "$cwd" status --porcelain 2>/dev/null)" ]; then
        branch_dirty="*"
    fi
fi

# Context percentage
pct="--"
usage=$(echo "$input" | jq '.context_window.current_usage // empty' 2>/dev/null)
if [ -n "$usage" ] && [ "$usage" != "null" ]; then
    current=$(echo "$usage" | jq '.input_tokens + .cache_creation_input_tokens + .cache_read_input_tokens' 2>/dev/null)
    size=$(echo "$input" | jq '.context_window.context_window_size // 0' 2>/dev/null)
    if [ -n "$current" ] && [ "$current" != "null" ] && [ -n "$size" ] && [ "$size" != "null" ] && [ "$size" -gt 0 ] 2>/dev/null; then
        pct=$((current * 100 / size))
    fi
fi

# Agent and character from session
agent_display=""
if [ -n "$session_id" ]; then
    AGENT_FILE="$cwd/.session/agents/${session_id}"
    if [ -f "$AGENT_FILE" ]; then
        agent_name=$(cat "$AGENT_FILE")
        # Capitalize first letter
        agent_cap="$(echo "${agent_name:0:1}" | tr '[:lower:]' '[:upper:]')${agent_name:1}"

        # Get character name from persona config
        PROJECT_ROOT="$cwd"
        config_file=""
        if [ -f "$PROJECT_ROOT/.claude/persona-config.local.yaml" ]; then
            config_file="$PROJECT_ROOT/.claude/persona-config.local.yaml"
        elif [ -f "$PROJECT_ROOT/.claude/persona-config.yaml" ]; then
            config_file="$PROJECT_ROOT/.claude/persona-config.yaml"
        fi

        if [ -n "$config_file" ]; then
            theme=$(yq '.theme' "$config_file" 2>/dev/null)
            if [ -n "$theme" ] && [ "$theme" != "null" ]; then
                theme_file=""
                if [ -f "$PROJECT_ROOT/.claude/personas/themes/${theme}.yaml" ]; then
                    theme_file="$PROJECT_ROOT/.claude/personas/themes/${theme}.yaml"
                elif [ -f "$PROJECT_ROOT/personas/themes/${theme}.yaml" ]; then
                    theme_file="$PROJECT_ROOT/personas/themes/${theme}.yaml"
                fi

                if [ -n "$theme_file" ]; then
                    char_full=$(yq ".agents.${agent_name}.character" "$theme_file" 2>/dev/null)
                    # Try to extract nickname in quotes first (e.g., "Scotty" from Montgomery "Scotty" Scott)
                    char_name=$(echo "$char_full" | grep -o '"[^"]*"' | head -1 | tr -d '"')
                    # Fallback to first name if no nickname
                    if [ -z "$char_name" ] || [ "$char_name" = "null" ]; then
                        char_name=$(echo "$char_full" | awk '{print $1}')
                    fi
                    if [ -n "$char_name" ] && [ "$char_name" != "null" ]; then
                        agent_display="${agent_cap}- ${char_name}"
                    fi
                fi
            fi
        fi

        # Fallback if no character found
        [ -z "$agent_display" ] && agent_display="${agent_cap}"
    fi
fi

# ANSI colors
RESET=$'\033[0m'
DIM=$'\033[2m'
BOLD=$'\033[1m'
FG_CYAN=$'\033[36m'
FG_GREEN=$'\033[32m'
FG_YELLOW=$'\033[33m'
FG_RED=$'\033[31m'
FG_MAGENTA=$'\033[35m'
FG_BLUE=$'\033[34m'
FG_WHITE=$'\033[97m'
FG_GRAY=$'\033[38;5;245m'
FG_ORANGE=$'\033[38;5;208m'
FG_PINK=$'\033[38;5;213m'
FG_TEAL=$'\033[38;5;43m'
FG_PURPLE=$'\033[38;5;141m'
FG_LIME=$'\033[38;5;154m'

# Agent color map
get_agent_color() {
    case "$1" in
        pm)         echo "${FG_PURPLE}${BOLD}" ;;   # Purple - strategic
        sm)         echo "${FG_BLUE}${BOLD}" ;;     # Blue - coordination
        dev)        echo "${FG_GREEN}${BOLD}" ;;    # Green - building
        tea)        echo "${FG_TEAL}${BOLD}" ;;     # Teal - testing
        reviewer)   echo "${FG_RED}${BOLD}" ;;      # Red - critical eye
        architect)  echo "${FG_ORANGE}${BOLD}" ;;   # Orange - design
        devops)     echo "${FG_CYAN}${BOLD}" ;;     # Cyan - infrastructure
        ux-designer) echo "${FG_PINK}${BOLD}" ;;    # Pink - design
        tech-writer) echo "${FG_WHITE}${BOLD}" ;;   # White - documentation
        orchestrator) echo "${FG_MAGENTA}${BOLD}" ;;# Magenta - coordination
        *)          echo "${FG_MAGENTA}${BOLD}" ;;  # Default
    esac
}

# Build progress bar (10 segments)
bar_width=10
if [ "$pct" != "--" ]; then
    filled=$((pct * bar_width / 100))
    [ "$filled" -gt "$bar_width" ] && filled=$bar_width
    [ "$filled" -lt 0 ] && filled=0

    # Color based on level
    if [ "$pct" -gt 95 ]; then
        bar_color="${FG_RED}${BOLD}"
    elif [ "$pct" -gt 85 ]; then
        bar_color="${FG_RED}"
    elif [ "$pct" -gt 70 ]; then
        bar_color="${FG_YELLOW}"
    else
        bar_color="${FG_GREEN}"
    fi

    # Build bar: filled portion with ▓, empty with ░
    bar_filled=""
    bar_empty=""
    for ((i=0; i<filled; i++)); do bar_filled+="▓"; done
    for ((i=filled; i<bar_width; i++)); do bar_empty+="░"; done

    progress_bar="${bar_color}${bar_filled}${RESET}${DIM}${bar_empty}${RESET}"
    pct_display="${bar_color}${pct}%${RESET}"
else
    progress_bar="${DIM}░░░░░░░░░░${RESET}"
    pct_display="${FG_GRAY}--%${RESET}"
fi

# Branch color (yellow if dirty, green if clean)
if [ -n "$branch_dirty" ]; then
    branch_color="${FG_YELLOW}"
else
    branch_color="${FG_GREEN}"
fi

# Fixed-width formatting using printf
# Agent: 20 chars, Repo: 14 chars, Branch: 12 chars, Model: 10 chars
if [ -n "$agent_display" ]; then
    agent_fmt=$(printf "%-20s" "$agent_display")
    agent_color=$(get_agent_color "$agent_name")
else
    agent_fmt=$(printf "%-20s" "No Agent")
    agent_color="${FG_GRAY}${DIM}"
fi
repo_fmt=$(printf "%-14s" "$dir_name")
branch_fmt=$(printf "%-12s" "${branch}${branch_dirty}")
model_fmt=$(printf "%-10s" "$model")

# Build output: Agent | repo | branch | model [progress] pct%
echo -n "${agent_color}${agent_fmt}${RESET}"
echo -n "${DIM}│${RESET} "
echo -n "${FG_CYAN}${repo_fmt}${RESET}"
echo -n "${DIM}│${RESET} "
echo -n "${branch_color}${branch_fmt}${RESET}"
echo -n "${DIM}│${RESET} "
echo -n "${FG_GRAY}${model_fmt}${RESET}"
echo -n "${progress_bar} "
echo -n "${pct_display}"
