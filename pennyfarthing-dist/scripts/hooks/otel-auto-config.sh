#!/bin/bash
# otel-auto-config.sh - Auto-configure OTEL for Cyclist web mode (Story 20-1)
#
# This hook checks for a .cyclist-port file in the project directory.
# If found, it sets the OTEL environment variables to connect Claude Code
# telemetry to the running Cyclist server.
#
# Usage: Source this script early in Claude Code startup to enable auto-config.
#   source /path/to/otel-auto-config.sh
#
# Prerequisites:
#   - Cyclist must be running in web mode (writes .cyclist-port file)
#   - CLAUDE_PROJECT_DIR must be set (standard in Claude Code environment)

# Determine project directory
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Check .cyclist-port first, then .bikerack-port as fallback
PORT=""
for PORT_FILE in "$PROJECT_DIR/.cyclist-port" "$PROJECT_DIR/.bikerack-port"; do
  if [[ -f "$PORT_FILE" ]]; then
    PORT=$(cat "$PORT_FILE" 2>/dev/null)
    # Validate port is a number
    if [[ "$PORT" =~ ^[0-9]+$ ]]; then
      break
    fi
    PORT=""
  fi
done

# Configure OTEL if a valid port was found
if [[ -n "$PORT" ]]; then
  export OTEL_EXPORTER_OTLP_PROTOCOL="http/json"
  export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:$PORT"

  # Optional: Log for debugging (can be silenced by setting CYCLIST_QUIET=1)
  if [[ -z "$CYCLIST_QUIET" ]]; then
    echo "[otel-auto-config] Configured OTEL to http://localhost:$PORT (from $PORT_FILE)" >&2
  fi
fi
