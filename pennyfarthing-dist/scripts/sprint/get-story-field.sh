#!/bin/bash
# Get a field value from a story in sprint YAML
# Usage: .pennyfarthing/scripts/core/run.sh sprint/get-story-field.sh <story-id> <field>
#
# Examples:
#   .pennyfarthing/scripts/core/run.sh sprint/get-story-field.sh 35-2 workflow
#   .pennyfarthing/scripts/core/run.sh sprint/get-story-field.sh 35-2 jira
#   .pennyfarthing/scripts/core/run.sh sprint/get-story-field.sh 35-2 status
#
# Common fields: workflow, status, jira, points, title, repos, priority
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

# PROJECT_ROOT should be set by run.sh
if [[ -z "${PROJECT_ROOT:-}" ]]; then
  d="$PWD"
  while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do
    d="$(dirname "$d")"
  done
  PROJECT_ROOT="$d"
fi

SPRINT_FILE="$PROJECT_ROOT/sprint/current-sprint.yaml"

if [[ ! -f "$SPRINT_FILE" ]]; then
  echo "null"
  exit 1
fi

# Extract field value using yq
# Handle default values for common fields
case "$FIELD" in
  workflow)
    DEFAULT="tdd"
    ;;
  status)
    DEFAULT="backlog"
    ;;
  repos)
    DEFAULT="pennyfarthing"
    ;;
  *)
    DEFAULT="null"
    ;;
esac

VALUE=$(yq eval ".epics[].stories[] | select(.id == \"$STORY_ID\") | .$FIELD // \"$DEFAULT\"" "$SPRINT_FILE" 2>/dev/null | head -1)

if [[ -z "$VALUE" ]]; then
  echo "null"
else
  echo "$VALUE"
fi
