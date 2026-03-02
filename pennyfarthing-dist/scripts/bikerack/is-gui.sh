#!/bin/bash
# Check if running inside a GUI (BikeRack)
# Usage: .pennyfarthing/scripts/bikerack/is-gui.sh
#
# Exit codes:
#   0 - Running in GUI
#   1 - Not running in GUI
#
# Output (JSON):
#   {"gui": true/false}

set -euo pipefail

# Check PF_GUI (primary env var)
if [[ "${PF_GUI:-}" == "1" ]]; then
  echo '{"gui": true}'
  exit 0
else
  echo '{"gui": false}'
  exit 1
fi
