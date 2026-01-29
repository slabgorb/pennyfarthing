#!/bin/bash
# Check if running inside Cyclist visual terminal
# Usage: .pennyfarthing/scripts/cyclist/is-cyclist.sh
#
# Exit codes:
#   0 - Running in Cyclist
#   1 - Not running in Cyclist
#
# Output (JSON):
#   {"cyclist": true/false}

set -euo pipefail

# Check the CYCLIST environment variable (set by ClaudeService.ensureProcess)
if [[ "${CYCLIST:-}" == "1" ]]; then
  echo '{"cyclist": true}'
  exit 0
else
  echo '{"cyclist": false}'
  exit 1
fi
