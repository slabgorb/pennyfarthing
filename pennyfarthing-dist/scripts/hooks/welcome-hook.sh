#!/usr/bin/env bash
# Welcome Hook: Display a friendly welcome message on session start
#
# For CLI: Displays ASCII art of a penny-farthing bicycle
# For Cyclist: Sends WebSocket message to display logo and welcome
#
# Called by Claude Code SessionStart hook

set -euo pipefail

# Read and discard stdin (required by hook protocol)
cat > /dev/null

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

# Once-per-session guard: only show welcome on first invocation
# Use session ID from environment or generate a unique one
SESSION_ID="${CLAUDE_SESSION_ID:-$$}"
WELCOME_LOCK="$PROJECT_ROOT/.session/.welcome-shown-$SESSION_ID"

# Ensure .session directory exists
mkdir -p "$PROJECT_ROOT/.session"

# Check if welcome was already shown for this session
if [[ -f "$WELCOME_LOCK" ]]; then
    exit 0
fi

# Mark welcome as shown for this session
touch "$WELCOME_LOCK"

# Check if running in Cyclist (port file exists)
PORT_FILE="$PROJECT_ROOT/.wheelhub-port"
IN_CYCLIST=false
if [[ -f "$PORT_FILE" ]]; then
    CYCLIST_PORT=$(cat "$PORT_FILE" 2>/dev/null)
    if [[ "$CYCLIST_PORT" =~ ^[0-9]+$ ]]; then
        IN_CYCLIST=true
    fi
fi

# Get project name from package.json or directory name
PROJECT_NAME=""
if [[ -f "$PROJECT_ROOT/package.json" ]]; then
    PROJECT_NAME=$(jq -r '.name // empty' "$PROJECT_ROOT/package.json" 2>/dev/null || echo "")
fi
if [[ -z "$PROJECT_NAME" ]]; then
    PROJECT_NAME=$(basename "$PROJECT_ROOT")
fi

# Get current theme from config
THEME=""
if [[ -f "$PROJECT_ROOT/.pennyfarthing/config.local.yaml" ]]; then
    THEME=$(grep -E '^theme:' "$PROJECT_ROOT/.pennyfarthing/config.local.yaml" 2>/dev/null | sed 's/theme:[[:space:]]*//' | tr -d '"' || echo "")
fi

if [[ "$IN_CYCLIST" == "true" ]]; then
    # Send welcome message via WebSocket API for Cyclist to display
    # Cyclist will show the pennyfarthing logo image and welcome text
    curl -s -X POST "http://localhost:$CYCLIST_PORT/api/welcome" \
        -H "Content-Type: application/json" \
        -d "{\"project\": \"$PROJECT_NAME\", \"theme\": \"$THEME\"}" \
        >/dev/null 2>&1 || true
else
    # CLI mode: Display ASCII art welcome
    cat << 'EOF'

       ___
      /   \
     |     |     Welcome to
     |     |    ╔═══════════════════════════════════╗
      \___/     ║   ╔═╗╔═╗╔╗╔╔╗╔╦═╗╔═╗╔═╗╔═╗╦╔═╗   ║
        ║       ║   ╠═╝║╣ ║║║║║║ ╠╣ ╠═╣╠╦╝ ║ ╠═╣   ║
        ║       ║   ╩  ╚═╝╝╚╝╝╚╝╩  ╩ ╩╩╚═ ╩ ╩ ╩   ║
      ╔═╩═╗     ╚═══════════════════════════════════╝
     /     \
    │   O   │   Agent-powered development with style
     \     /
      ╚═══╝

EOF

    # Add project-specific info
    if [[ -n "$PROJECT_NAME" ]]; then
        echo "    Project: $PROJECT_NAME"
    fi
    if [[ -n "$THEME" ]]; then
        echo "    Theme:   $THEME"
    fi
    echo ""
fi

exit 0
