#!/bin/bash
# Get a field value from an epic in sprint YAML
# Usage: .pennyfarthing/scripts/sprint/get-epic-field.sh <epic-id> <field>
#
# Delegates to Python CLI: pennyfarthing_scripts.cli sprint epic field
# Returns the field value or "null" if not found

set -euo pipefail

EPIC_ID="${1:-}"
FIELD="${2:-}"

if [[ -z "$EPIC_ID" || -z "$FIELD" ]]; then
  echo "Usage: get-epic-field.sh <epic-id> <field>"
  echo ""
  echo "Examples:"
  echo "  get-epic-field.sh epic-35 jira     # Returns: MSSCI-11234"
  echo "  get-epic-field.sh epic-35 title    # Returns: Epic title"
  echo "  get-epic-field.sh 35 jira          # Also works without 'epic-' prefix"
  echo ""
  echo "Common fields: jira, title, description, status"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd -P)"
export PYTHONPATH="${PACKAGE_ROOT}:${PYTHONPATH:-}"

exec python3 -m pennyfarthing_scripts.cli sprint epic field "$EPIC_ID" "$FIELD"
