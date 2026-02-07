#!/bin/bash
# Output sprint info as JSON for Cyclist sidebar
# Usage: .pennyfarthing/scripts/sprint/sprint-info.sh
#
# Delegates to Python CLI: pennyfarthing_scripts.cli sprint info
# Returns: {"remaining": N, "inProgress": N, "endDate": "YYYY-MM-DD"}

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd -P)"
export PYTHONPATH="${PACKAGE_ROOT}:${PYTHONPATH:-}"

exec python3 -m pennyfarthing_scripts.cli sprint info
