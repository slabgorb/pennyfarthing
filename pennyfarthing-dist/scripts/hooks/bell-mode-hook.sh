#!/bin/bash
#
# PostToolUse Hook — Bell Mode + Tandem Injection
#
# Called by Claude Code after each tool execution. Handles two independent
# injection systems:
#
# 1. Bell queue (Cyclist only) — injects queued user messages when Cyclist
#    is running and bell_mode is enabled. In CLI sessions this is a no-op.
# 2. Tandem observations (always active) — injects backseat agent observations
#    when tandem observation files exist. No configuration required.
#
# Bell queue takes precedence: if a queued message exists, tandem is
# deferred to the next hook invocation.
#
# Output format (when injecting):
#   {
#     "hookSpecificOutput": {
#       "hookEventName": "PostToolUse",
#       "additionalContext": "<message>"
#     }
#   }
#
# Output when nothing to inject: (nothing - exit 0)

# Find project root (walk up to find .pennyfarthing)
PROJECT_ROOT="$PWD"
while [[ "$PROJECT_ROOT" != "/" ]]; do
  if [[ -d "$PROJECT_ROOT/.pennyfarthing" ]]; then
    break
  fi
  PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"
done

if [[ ! -d "$PROJECT_ROOT/.pennyfarthing" ]]; then
  exit 0
fi

CONFIG_LOCAL_YAML="$PROJECT_ROOT/.pennyfarthing/config.local.yaml"
BELL_QUEUE_FILE="$PROJECT_ROOT/.pennyfarthing/bell-queue.json"

# Detect Cyclist — bell queue is a Cyclist-only feature
IS_CYCLIST=false
CYCLIST_PORT=""
PORT_FILE="$PROJECT_ROOT/.wheelhub-port"
if [[ -f "$PORT_FILE" ]]; then
  CYCLIST_PORT=$(cat "$PORT_FILE" 2>/dev/null)
  if [[ -n "$CYCLIST_PORT" ]] && [[ "$CYCLIST_PORT" =~ ^[0-9]+$ ]]; then
    IS_CYCLIST=true
  fi
fi

# --- Bell queue check (Cyclist only, requires bell_mode: true) ---
# Takes precedence over tandem injection when active.

if [[ "$IS_CYCLIST" == "true" ]] && [[ -f "$CONFIG_LOCAL_YAML" ]]; then
  BELL_ENABLED=$(grep -E '^\s*bell_mode:\s*true' "$CONFIG_LOCAL_YAML" 2>/dev/null || true)

  if [[ -n "$BELL_ENABLED" ]] && [[ -f "$BELL_QUEUE_FILE" ]]; then
    QUEUE_CONTENT=$(cat "$BELL_QUEUE_FILE" 2>/dev/null)
    if [[ -n "$QUEUE_CONTENT" ]] && [[ "$QUEUE_CONTENT" != "[]" ]]; then
      FIRST_MESSAGE_TEXT=$(echo "$QUEUE_CONTENT" | sed -n 's/.*"text"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)

      if [[ -n "$FIRST_MESSAGE_TEXT" ]]; then
        cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "User feedback: $FIRST_MESSAGE_TEXT"
  }
}
EOF

        # Dequeue and notify Cyclist in background
        (
          if command -v jq &> /dev/null; then
            jq 'if length > 0 then .[1:] else [] end' "$BELL_QUEUE_FILE" > "$BELL_QUEUE_FILE.tmp" 2>/dev/null && mv "$BELL_QUEUE_FILE.tmp" "$BELL_QUEUE_FILE"
          fi

          curl -s -X POST "http://localhost:$CYCLIST_PORT/api/bell-consumed" \
            -H "Content-Type: application/json" \
            -d "{\"text\": \"$FIRST_MESSAGE_TEXT\"}" \
            >/dev/null 2>&1 || true
        ) &

        exit 0
      fi
    fi
  fi
fi

# --- Tandem observation injection ---
# Always active. No configuration required.
# Checks .session/*-tandem-*.md files for new observations via mtime comparison.

SESSION_DIR="$PROJECT_ROOT/.session"
if [[ ! -d "$SESSION_DIR" ]]; then
  exit 0
fi

# Find tandem observation files
TANDEM_FILES=$(find "$SESSION_DIR" -maxdepth 1 -name "*-tandem-*.md" 2>/dev/null)
if [[ -z "$TANDEM_FILES" ]]; then
  exit 0
fi

# Check each tandem file for new content
for TANDEM_FILE in $TANDEM_FILES; do
  # Extract agent name from filename: *-tandem-{agent}.md
  AGENT=$(echo "$TANDEM_FILE" | sed -n 's/.*-tandem-\([a-zA-Z_]*\)\.md$/\1/p')
  if [[ -z "$AGENT" ]]; then
    continue
  fi

  # Get file mtime (portable: stat -f %m on macOS, stat -c %Y on Linux)
  if [[ "$(uname)" == "Darwin" ]]; then
    FILE_MTIME=$(stat -f %m "$TANDEM_FILE" 2>/dev/null)
  else
    FILE_MTIME=$(stat -c %Y "$TANDEM_FILE" 2>/dev/null)
  fi
  if [[ -z "$FILE_MTIME" ]]; then
    continue
  fi

  # Compare with saved mtime sidecar
  MTIME_SIDECAR="$SESSION_DIR/.tandem-mtime-$AGENT"
  SAVED_MTIME="0"
  if [[ -f "$MTIME_SIDECAR" ]]; then
    SAVED_MTIME=$(cat "$MTIME_SIDECAR" 2>/dev/null)
  fi

  if [[ "$FILE_MTIME" == "$SAVED_MTIME" ]]; then
    continue
  fi

  # Read tandem file and extract latest observation
  CONTENT=$(cat "$TANDEM_FILE" 2>/dev/null)
  if [[ -z "$CONTENT" ]]; then
    continue
  fi

  # Extract persona from header: **Observer:** agent (Persona Name)
  PERSONA=$(echo "$CONTENT" | sed -n 's/.*\*\*Observer:\*\*[[:space:]]*[a-zA-Z_]*[[:space:]]*(\([^)]*\)).*/\1/p' | head -1)
  if [[ -z "$PERSONA" ]]; then
    PERSONA="Unknown"
  fi

  # Extract latest observation text (last ## [HH:MM] Observation block)
  # Get text between last observation header and trailing ---
  OBS_TEXT=$(echo "$CONTENT" | awk '
    /^## \[[0-9]+:[0-9]+\] Observation/ { found=1; text=""; next }
    found && /^---/ { next }
    found && /^\*\*Trigger:\*\*/ { next }
    found { text = text (text ? "\n" : "") $0 }
    END { if (text) print text }
  ' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

  if [[ -z "$OBS_TEXT" ]]; then
    # Update mtime even if no parseable observation
    echo "$FILE_MTIME" > "$MTIME_SIDECAR"
    continue
  fi

  # Format as [Tandem] prefix and output
  TANDEM_MSG="[Tandem] $PERSONA: $OBS_TEXT"

  cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "$TANDEM_MSG"
  }
}
EOF

  # Save mtime sidecar
  echo "$FILE_MTIME" > "$MTIME_SIDECAR"

  # Only inject one tandem observation per hook invocation
  exit 0
done

exit 0
