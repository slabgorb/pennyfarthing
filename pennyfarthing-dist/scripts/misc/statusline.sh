#!/usr/bin/env zsh
# Claude Code statusline - fixed-width segments
# Format: [ROLE] Theme | repo | branch | model [progress] pct%

input=$(cat)

# Validate JSON
if ! echo "$input" | jq -e . >/dev/null 2>&1; then
    echo "⚠ invalid input"
    exit 0
fi

# Extract fields - use cwd for display only, PROJECT_ROOT for file lookups
cwd=$(echo "$input" | jq -r '.workspace.current_dir // empty' 2>/dev/null)
dir_name=$(basename "$cwd" 2>/dev/null || echo "?")
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$cwd}"
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

    # Check if dirty using diff-index (doesn't lock the index like status does)
    # This avoids "index.lock: File exists" errors when multiple Claude sessions
    # run concurrent statusline updates during git operations
    if ! git -C "$cwd" diff-index --quiet HEAD -- 2>/dev/null || \
       [ -n "$(git -C "$cwd" ls-files --others --exclude-standard 2>/dev/null | head -1)" ]; then
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

# Agent abbreviation map
get_agent_abbrev() {
    case "$1" in
        pm)          echo "PM" ;;
        sm)          echo "SM" ;;
        dev)         echo "DEV" ;;
        tea)         echo "TEA" ;;
        reviewer)    echo "REV" ;;
        architect)   echo "ARC" ;;
        devops)      echo "OPS" ;;
        ux-designer) echo "UX" ;;
        tech-writer) echo "DOC" ;;
        orchestrator) echo "ORC" ;;
        *)           echo "???" ;;
    esac
}

# Agent and theme from session
agent_name=""
agent_abbrev=""
theme_display=""

# Try session_id match first, then fall back to most recent agent file
if [ -n "$session_id" ] && [ -f "$PROJECT_ROOT/.session/agents/${session_id}" ]; then
    # Exact session match (ideal case)
    agent_name=$(cat "$PROJECT_ROOT/.session/agents/${session_id}")
    agent_abbrev=$(get_agent_abbrev "$agent_name")
elif [ -d "$PROJECT_ROOT/.session/agents" ]; then
    # Fallback: use most recently modified agent file
    # This handles the session_id mismatch between hooks
    latest_file=$(ls -t "$PROJECT_ROOT/.session/agents/" 2>/dev/null | head -1)
    if [ -n "$latest_file" ] && [ -f "$PROJECT_ROOT/.session/agents/$latest_file" ]; then
        agent_name=$(cat "$PROJECT_ROOT/.session/agents/$latest_file")
        agent_abbrev=$(get_agent_abbrev "$agent_name")
    fi
fi

# Get character name from config for current agent
# Config now includes theme_characters baked in (no symlink chasing needed)
config_file=""
if [ -f "$PROJECT_ROOT/.pennyfarthing/config.local.yaml" ]; then
    config_file="$PROJECT_ROOT/.pennyfarthing/config.local.yaml"
elif [ -f "$PROJECT_ROOT/.claude/persona-config.yaml" ]; then
    config_file="$PROJECT_ROOT/.claude/persona-config.yaml"
fi

character_display=""
if [ -n "$config_file" ] && [ -n "$agent_name" ]; then
    # Try baked theme_characters first (self-contained, no symlinks)
    full_name=$(yq ".theme_characters.${agent_name}" "$config_file" 2>/dev/null)

    if [ -n "$full_name" ] && [ "$full_name" != "null" ]; then
        # Smart character name extraction:
        # 1. Remove parenthetical content: "Breq (Justice of Toren)" → "Breq"
        # 2. Strip common titles: "Captain Kirk" → "Kirk"
        # 3. If single word remains, use it; otherwise take last word
        clean_name=$(echo "$full_name" | sed 's/ *([^)]*)//g' | xargs)
        clean_name=$(echo "$clean_name" | sed -E 's/^(Captain|Lieutenant|Dr\.|Doc|Mr\.|Mrs\.|Ms\.|Admiral|Commander|Chief|Ensign|Translator|Agent|Colonel|Major|Sergeant|Professor|Lord|Lady|Sir|The) +//i')
        word_count=$(echo "$clean_name" | wc -w | tr -d ' ')
        if [ "$word_count" -eq 1 ]; then
            character_display="$clean_name"
        else
            character_display=$(echo "$clean_name" | awk '{print $NF}')
        fi
    fi

    # Fallback to theme name if no character found
    if [ -z "$character_display" ]; then
        theme=$(yq '.theme' "$config_file" 2>/dev/null)
        if [ -n "$theme" ] && [ "$theme" != "null" ]; then
            character_display="$(echo "${theme:0:1}" | tr '[:lower:]' '[:upper:]')${theme:1}"
        fi
    fi
fi
theme_display="$character_display"

# ANSI colors
RESET=$'\033[0m'
DIM=$'\033[2m'
BOLD=$'\033[1m'
REVERSE=$'\033[7m'
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
# Agent+Theme: ~20 chars, Repo: 14 chars, Branch: 12 chars, Model: 10 chars
repo_fmt=$(printf "%-14s" "$dir_name")
branch_fmt=$(printf "%-12s" "${branch}${branch_dirty}")
model_fmt=$(printf "%-10s" "$model")

# Build agent display: [ROLE] Theme (role in reverse text with color)
if [ -n "$agent_abbrev" ]; then
    agent_color=$(get_agent_color "$agent_name")
    # Role in reverse text with color, then theme
    if [ -n "$theme_display" ]; then
        agent_section="${agent_color}${REVERSE} ${agent_abbrev} ${RESET} ${DIM}${theme_display}${RESET}"
        # Pad to ~20 chars visual width (abbrev ~3 + spaces ~2 + theme ~10 = ~15, pad to 20)
        pad_len=$((18 - ${#agent_abbrev} - ${#theme_display}))
        [ "$pad_len" -lt 0 ] && pad_len=0
        padding=$(printf "%${pad_len}s" "")
        agent_section="${agent_section}${padding}"
    else
        agent_section="${agent_color}${REVERSE} ${agent_abbrev} ${RESET}"
        pad_len=$((17 - ${#agent_abbrev}))
        [ "$pad_len" -lt 0 ] && pad_len=0
        padding=$(printf "%${pad_len}s" "")
        agent_section="${agent_section}${padding}"
    fi
else
    # No agent - just show theme if available
    if [ -n "$theme_display" ]; then
        agent_section="${DIM}${theme_display}${RESET}"
        pad_len=$((20 - ${#theme_display}))
        [ "$pad_len" -lt 0 ] && pad_len=0
        padding=$(printf "%${pad_len}s" "")
        agent_section="${agent_section}${padding}"
    else
        agent_section=$(printf "%-20s" "")
    fi
fi

# Build output: [ROLE] Theme | repo | branch | model [progress] pct%
echo -n "${agent_section}"
echo -n "${DIM}│${RESET} "
echo -n "${FG_CYAN}${repo_fmt}${RESET}"
echo -n "${DIM}│${RESET} "
echo -n "${branch_color}${branch_fmt}${RESET}"
echo -n "${DIM}│${RESET} "
echo -n "${FG_GRAY}${model_fmt}${RESET}"
echo -n "${progress_bar} "
echo -n "${pct_display}"
