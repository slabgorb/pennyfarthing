#!/bin/bash
# Get a field value from an epic in sprint YAML
# Usage: .pennyfarthing/scripts/sprint/get-epic-field.sh <epic-id> <field>
#
# Examples:
#   .pennyfarthing/scripts/sprint/get-epic-field.sh epic-35 jira
#   .pennyfarthing/scripts/sprint/get-epic-field.sh epic-35 title
#   .pennyfarthing/scripts/sprint/get-epic-field.sh 35 jira  # Also works without 'epic-' prefix
#
# Common fields: jira, title, description, status
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

# Normalize epic ID - add 'epic-' prefix if not present
if [[ ! "$EPIC_ID" =~ ^epic- ]]; then
  EPIC_ID="epic-$EPIC_ID"
fi

# Find project root
source "$(dirname "${BASH_SOURCE[0]}")/../lib/find-root.sh"

SPRINT_FILE="$PROJECT_ROOT/sprint/current-sprint.yaml"

if [[ ! -f "$SPRINT_FILE" ]]; then
  echo "null"
  exit 1
fi

# Extract field value using yq
VALUE=$(yq eval ".epics[] | select(.id == \"$EPIC_ID\") | .$FIELD // \"null\"" "$SPRINT_FILE" 2>/dev/null | head -1)

if [[ -z "$VALUE" ]]; then
  echo "null"
else
  echo "$VALUE"
fi
