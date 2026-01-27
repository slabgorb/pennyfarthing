#!/usr/bin/env bash
# get-workflow-type.sh - Determine if a workflow is phased or stepped
#
# Usage: .pennyfarthing/scripts/core/run.sh workflow/get-workflow-type.sh <workflow-name>
#
# Returns: "phased" or "stepped"
# Exit 1 if workflow not found

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec python3 "$SCRIPT_DIR/get-workflow-type.py" "$@"
