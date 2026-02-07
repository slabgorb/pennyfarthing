#!/bin/bash
# Check if a story or epic exists and is available for work
# Usage: check-story.sh <id|next>
#
# Delegates to Python CLI: pennyfarthing_scripts.cli sprint check
# Returns JSON with story/epic details and availability

set -euo pipefail

ID="${1:-}"

if [[ -z "$ID" ]]; then
  echo '{"type": "error", "message": "No ID provided"}'
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd -P)"
export PYTHONPATH="${PACKAGE_ROOT}:${PYTHONPATH:-}"

exec python3 -m pennyfarthing_scripts.cli sprint check "$ID"
