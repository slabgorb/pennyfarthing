#!/bin/bash
# otel-auto-config.sh - Auto-configure OTEL for Cyclist web mode (Story 20-1)
#
# This hook checks for a .wheelhub-port file in the project directory.
# If found, it sets the OTEL environment variables to connect Claude Code
# telemetry to the running Cyclist server.
#
# Usage: Source this script early in Claude Code startup to enable auto-config.
#   source /path/to/otel-auto-config.sh
#
# Prerequisites:
#   - Cyclist must be running in web mode (writes .wheelhub-port file)
#   - CLAUDE_PROJECT_DIR must be set (standard in Claude Code environment)

# Determine project directory
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Read port from .wheelhub-port (used by both Cyclist and BikeRack)
PORT=""
PORT_FILE="$PROJECT_DIR/.wheelhub-port"
if [[ -f "$PORT_FILE" ]]; then
  PORT=$(cat "$PORT_FILE" 2>/dev/null)
  # Validate port is a number
  if [[ ! "$PORT" =~ ^[0-9]+$ ]]; then
    PORT=""
  fi
fi

# Configure OTEL if a valid port was found
if [[ -n "$PORT" ]]; then
  export OTEL_EXPORTER_OTLP_PROTOCOL="http/json"
  export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:$PORT"

  # Optional: Log for debugging (can be silenced by setting CYCLIST_QUIET=1)
  if [[ -z "$CYCLIST_QUIET" ]]; then
    echo "[otel-auto-config] Configured OTEL to http://localhost:$PORT (from $PORT_FILE)" >&2
  fi
fi
