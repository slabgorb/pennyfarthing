#!/bin/bash
# Generate complete AGENT_COMMAND block with pre-rendered marker
# Usage: handoff-marker.sh <next-agent> [--error <message>]
#
# Outputs a complete AGENT_COMMAND block that subagents can emit verbatim.
# Handles IS_CYCLIST and USE_TIREPUMP detection automatically.
#
# Single source of truth for marker format - both agents and quick-actions.js
# should reference this script's output format.

set -euo pipefail

NEXT_AGENT=""
IS_ERROR=false
ERROR_MSG=""

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --error)
      IS_ERROR=true
      ERROR_MSG="${2:-Error occurred}"
      shift 2
      ;;
    *)
      if [[ -z "$NEXT_AGENT" ]]; then
        NEXT_AGENT="$1"
      fi
      shift
      ;;
  esac
done

if [[ -z "$NEXT_AGENT" && "$IS_ERROR" != "true" ]]; then
  echo "Usage: handoff-marker.sh <next-agent> [--error <message>]" >&2
  echo "" >&2
  echo "Examples:" >&2
  echo "  handoff-marker.sh dev               # Normal handoff to dev" >&2
  echo "  handoff-marker.sh tea               # Normal handoff to tea" >&2
  echo "  handoff-marker.sh --error 'Tests failing'  # Error case" >&2
  exit 1
fi

# Get environment from check-context.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
eval "$("$SCRIPT_DIR/check-context.sh" 2>/dev/null)" || true

# Default values if check-context.sh failed
IS_CYCLIST="${IS_CYCLIST:-false}"
USE_TIREPUMP="${USE_TIREPUMP:-false}"

# Generate marker based on environment
if [[ "$IS_ERROR" == "true" ]]; then
  # Error case - no marker
  cat <<EOF
---
AGENT_COMMAND:
  marker: ""
  fallback: "$ERROR_MSG"
  error: true
---
EOF
elif [[ "$IS_CYCLIST" != "true" ]]; then
  # Not in Cyclist - no marker
  cat <<EOF
---
AGENT_COMMAND:
  marker: ""
  fallback: "Run \`/${NEXT_AGENT}\` to continue"
---
EOF
elif [[ "$USE_TIREPUMP" == "true" ]]; then
  # Cyclist + TirePump - context clear marker
  cat <<EOF
---
AGENT_COMMAND:
  marker: "<!-- CYCLIST:CONTEXT_CLEAR:/${NEXT_AGENT} -->"
  fallback: "Run \`/${NEXT_AGENT}\` to continue"
---
EOF
else
  # Cyclist, no TirePump - handoff marker
  cat <<EOF
---
AGENT_COMMAND:
  marker: "<!-- CYCLIST:HANDOFF:/${NEXT_AGENT} -->"
  fallback: "Run \`/${NEXT_AGENT}\` to continue"
---
EOF
fi
