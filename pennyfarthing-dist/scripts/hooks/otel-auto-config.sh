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
    CANDIDATE=$(cat "$PORT_FILE" 2>/dev/null)
    # Validate port is a number
    if [[ "$CANDIDATE" =~ ^[0-9]+$ ]]; then
      # Verify the port is actually listening before using it
      if (echo >/dev/tcp/localhost/"$CANDIDATE") 2>/dev/null; then
        PORT="$CANDIDATE"
        break
      else
        if [[ -z "$CYCLIST_QUIET" ]]; then
          echo "[otel-auto-config] Stale port file $PORT_FILE (port $CANDIDATE not listening), skipping" >&2
        fi
      fi
    fi
  fi
done

# Configure OTEL if a valid port was found (all 5 vars per build_otel_env)
if [[ -n "$PORT" ]]; then
  export CLAUDE_CODE_ENABLE_TELEMETRY="1"
  export OTEL_EXPORTER_OTLP_PROTOCOL="http/json"
  export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:$PORT"
  export OTEL_LOGS_EXPORTER="otlp"
  export OTEL_METRICS_EXPORTER="otlp"

  # Optional: Log for debugging (can be silenced by setting CYCLIST_QUIET=1)
  if [[ -z "$CYCLIST_QUIET" ]]; then
    echo "[otel-auto-config] Configured OTEL to http://localhost:$PORT (from $PORT_FILE)" >&2
  fi
fi
