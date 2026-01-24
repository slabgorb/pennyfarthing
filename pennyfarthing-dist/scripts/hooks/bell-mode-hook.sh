#!/bin/bash
#
# Bell Mode PostToolUse Hook (Story MSSCI-12275)
#
# This hook is called by Claude Code after each tool execution.
# When bell mode is enabled and there are queued messages, it returns
# the first queued message as additionalContext to be injected into
# Claude's next API call.
#
# Configuration files:
#   .pennyfarthing/bell-mode.json - { "enabled": true/false }
#   .pennyfarthing/bell-queue.json - [{ "text": "...", "images": [...] }, ...]
#
# Output format (when injecting):
#   {
#     "hookSpecificOutput": {
#       "hookEventName": "PostToolUse",
#       "additionalContext": "User feedback: <message>"
#     }
#   }
#
# Output when disabled or queue empty: (nothing - exit 0)

# Find project root (walk up to find .pennyfarthing)
PROJECT_ROOT="$PWD"
while [[ "$PROJECT_ROOT" != "/" ]]; do
  if [[ -d "$PROJECT_ROOT/.pennyfarthing" ]]; then
    break
  fi
  PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"
done

if [[ ! -d "$PROJECT_ROOT/.pennyfarthing" ]]; then
  # No .pennyfarthing directory found - exit silently
  exit 0
fi

BELL_MODE_CONFIG="$PROJECT_ROOT/.pennyfarthing/bell-mode.json"
BELL_QUEUE_FILE="$PROJECT_ROOT/.pennyfarthing/bell-queue.json"

# Check if bell mode is enabled
if [[ ! -f "$BELL_MODE_CONFIG" ]]; then
  exit 0
fi

ENABLED=$(cat "$BELL_MODE_CONFIG" 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*true' || true)
if [[ -z "$ENABLED" ]]; then
  exit 0
fi

# Check if queue file exists and has messages
if [[ ! -f "$BELL_QUEUE_FILE" ]]; then
  exit 0
fi

# Read queue and check if non-empty
QUEUE_CONTENT=$(cat "$BELL_QUEUE_FILE" 2>/dev/null)
if [[ -z "$QUEUE_CONTENT" ]] || [[ "$QUEUE_CONTENT" == "[]" ]]; then
  exit 0
fi

# Extract first message text using simple parsing
# The queue format is: [{"text":"...","images":[...]}, ...]
FIRST_MESSAGE_TEXT=$(echo "$QUEUE_CONTENT" | sed -n 's/.*"text"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)

if [[ -z "$FIRST_MESSAGE_TEXT" ]]; then
  exit 0
fi

# Get Cyclist port (if running)
CYCLIST_PORT=""
PORT_FILE="$PROJECT_ROOT/.cyclist-port"
if [[ -f "$PORT_FILE" ]]; then
  CYCLIST_PORT=$(cat "$PORT_FILE" 2>/dev/null)
fi

# Output the hook response JSON
cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "User feedback: $FIRST_MESSAGE_TEXT"
  }
}
EOF

# Remove the first message from the queue and notify Cyclist
# Run in background to avoid blocking hook response
(
  # Dequeue using jq if available
  if command -v jq &> /dev/null; then
    jq 'if length > 0 then .[1:] else [] end' "$BELL_QUEUE_FILE" > "$BELL_QUEUE_FILE.tmp" 2>/dev/null && mv "$BELL_QUEUE_FILE.tmp" "$BELL_QUEUE_FILE"
  fi

  # Notify Cyclist browser to dequeue and display the message
  if [[ -n "$CYCLIST_PORT" ]] && [[ "$CYCLIST_PORT" =~ ^[0-9]+$ ]]; then
    curl -s -X POST "http://localhost:$CYCLIST_PORT/api/bell-consumed" \
      -H "Content-Type: application/json" \
      -d "{\"text\": \"$FIRST_MESSAGE_TEXT\"}" \
      >/dev/null 2>&1 || true
  fi
) &

exit 0
