#!/bin/bash
# Get a field value from a story in sprint YAML
# Usage: .pennyfarthing/scripts/sprint/get-story-field.sh <story-id> <field>
#
# Delegates to Python CLI: pennyfarthing_scripts.cli sprint story field
# Returns the field value or "null" if not found

set -euo pipefail

STORY_ID="${1:-}"
FIELD="${2:-}"

if [[ -z "$STORY_ID" || -z "$FIELD" ]]; then
  echo "Usage: get-story-field.sh <story-id> <field>"
  echo ""
  echo "Examples:"
  echo "  get-story-field.sh 35-2 workflow    # Returns: tdd"
  echo "  get-story-field.sh 35-2 jira        # Returns: MSSCI-12345"
  echo "  get-story-field.sh 35-2 status      # Returns: in_progress"
  echo ""
  echo "Common fields: workflow, status, jira, points, title, repos, priority"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd -P)"
export PYTHONPATH="${PACKAGE_ROOT}:${PYTHONPATH:-}"

exec python3 -m pennyfarthing_scripts.cli sprint story field "$STORY_ID" "$FIELD"
