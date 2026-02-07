#!/usr/bin/env zsh
# Sync an epic and its stories to Jira
# Usage: sync-epic-jira.sh <epic-id> [--dry-run] [--transition] [--points] [--all]
#
# Thin wrapper that delegates to Python CLI:
#   python -m pennyfarthing_scripts.jira sync <epic-id> [options]

set -e

# Source common functions for Python discovery
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Navigate up from skills/sprint/scripts/ to pennyfarthing-dist/scripts/lib/
LIB_DIR="$(cd "$SCRIPT_DIR/../../../scripts/lib" 2>/dev/null && pwd || echo "")"

if [[ -n "$LIB_DIR" && -f "$LIB_DIR/common.sh" ]]; then
  source "$LIB_DIR/common.sh"
  run_python_module jira sync "$@"
else
  # Fallback: set PYTHONPATH directly
  PACKAGE_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd -P)"
  export PYTHONPATH="${PACKAGE_ROOT}:${PYTHONPATH:-}"
  exec python3 -m pennyfarthing_scripts.jira sync "$@"
fi
