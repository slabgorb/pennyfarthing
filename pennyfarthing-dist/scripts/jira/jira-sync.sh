#!/usr/bin/env zsh
# Sync an epic and its stories to Jira
# Usage: jira-sync.sh <epic_number> [--dry-run] [--transition] [--points]
#
# Thin wrapper that delegates to Python CLI:
#   python -m pennyfarthing_scripts.jira sync <epic_number> [options]

set -e

# Source common functions for Python discovery
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
source "${PARENT_DIR}/lib/common.sh"

# Delegate to Python CLI
run_python_module jira sync "$@"
