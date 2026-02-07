#!/bin/bash
# Display available stories grouped by epic with Jira context
# Usage: .pennyfarthing/scripts/sprint/available-stories.sh
#
# Delegates to Python CLI: pennyfarthing_scripts.cli sprint backlog

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd -P)"
export PYTHONPATH="${PACKAGE_ROOT}:${PYTHONPATH:-}"

exec python3 -m pennyfarthing_scripts.cli sprint backlog
