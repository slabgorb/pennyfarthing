#!/bin/bash
# otel-auto-config.sh - Auto-configure OTEL for Cyclist/BikeRack
#
# DEPRECATED: Prefer `pf hooks session-start` which handles WheelHub auto-start
# AND OTEL configuration together. This script is a fallback that only sets
# env vars when WheelHub is already running.
#
# Prerequisites:
#   - WheelHub or BikeRack must be running (.wheelhub-port file exists)
#   - CLAUDE_ENV_FILE must be set (standard in Claude Code hook environment)

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
PORT_FILE="$PROJECT_DIR/.wheelhub-port"

if [[ ! -f "$PORT_FILE" ]]; then
  exit 0
fi

PORT=$(cat "$PORT_FILE" 2>/dev/null)

if [[ ! "$PORT" =~ ^[0-9]+$ ]]; then
  exit 0
fi

# Write all 5 required OTEL env vars to CLAUDE_ENV_FILE
if [[ -n "$CLAUDE_ENV_FILE" ]]; then
  cat >> "$CLAUDE_ENV_FILE" <<EOF
# OTEL auto-configuration (otel-auto-config.sh fallback)
export CLAUDE_CODE_ENABLE_TELEMETRY="1"
export OTEL_LOGS_EXPORTER="otlp"
export OTEL_METRICS_EXPORTER="otlp"
export OTEL_EXPORTER_OTLP_PROTOCOL="http/json"
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:$PORT"
EOF
fi

if [[ -z "$CYCLIST_QUIET" ]]; then
  echo "[otel-auto-config] Configured OTEL to http://localhost:$PORT" >&2
fi
