#!/usr/bin/env zsh
# Create a Jira epic and its child stories from sprint YAML
# Usage: create-jira-epic.sh <epic-id> [--dry-run]
#
# Thin wrapper that delegates to Python CLI:
#   python -m pennyfarthing_scripts.jira create epic <epic-id> [--dry-run]

set -e

# Source common functions for Python discovery
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Navigate up from skills/sprint/scripts/ to pennyfarthing-dist/scripts/lib/
LIB_DIR="$(cd "$SCRIPT_DIR/../../../scripts/lib" 2>/dev/null && pwd || echo "")"

if [[ -n "$LIB_DIR" && -f "$LIB_DIR/common.sh" ]]; then
  source "$LIB_DIR/common.sh"
  run_python_module jira create epic "$@"
else
  # Fallback: set PYTHONPATH directly
  PACKAGE_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd -P)"
  export PYTHONPATH="${PACKAGE_ROOT}:${PYTHONPATH:-}"
  exec python3 -m pennyfarthing_scripts.jira create epic "$@"
fi
