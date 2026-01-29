#!/bin/bash
# Promote an epic from future.yaml to current-sprint.yaml
# Usage: .pennyfarthing/scripts/core/run.sh sprint/promote-epic.sh <epic-id>
#
# Example: .pennyfarthing/scripts/core/run.sh sprint/promote-epic.sh epic-41
#
# Features:
# - Detects ID collisions and assigns new ID if needed
# - Uses yq for proper YAML array insertion
# - Automatically removes from future.yaml after successful promotion

set -euo pipefail

EPIC_ID="${1:-}"

if [[ -z "$EPIC_ID" ]]; then
  echo "Usage: promote-epic.sh <epic-id>"
  echo "Example: promote-epic.sh epic-41"
  echo ""
  echo "Moves an epic and its stories from future.yaml to current-sprint.yaml"
  exit 1
fi

# PROJECT_ROOT should be set by run.sh, but find it if not
if [[ -z "${PROJECT_ROOT:-}" ]]; then
  d="$PWD"
  while [[ ! -d "$d/.pennyfarthing" ]] && [[ "$d" != "/" ]]; do
    d="$(dirname "$d")"
  done
  PROJECT_ROOT="$d"
fi

FUTURE_FILE="$PROJECT_ROOT/sprint/future.yaml"
SPRINT_FILE="$PROJECT_ROOT/sprint/current-sprint.yaml"

if [[ ! -f "$FUTURE_FILE" ]]; then
  echo "Error: Future file not found at $FUTURE_FILE"
  exit 1
fi

if [[ ! -f "$SPRINT_FILE" ]]; then
  echo "Error: Sprint file not found at $SPRINT_FILE"
  exit 1
fi

if ! command -v yq &> /dev/null; then
  echo "Error: yq is required but not installed"
  echo "Install with: brew install yq"
  exit 1
fi

# Find the epic in future.yaml
# Epics are nested under future.initiatives[].epics[]
EPIC_DATA=$(yq -o json ".future.initiatives[].epics[] | select(.id == \"$EPIC_ID\")" "$FUTURE_FILE" 2>/dev/null || echo "")

if [[ -z "$EPIC_DATA" || "$EPIC_DATA" == "null" ]]; then
  echo "Error: Epic $EPIC_ID not found in $FUTURE_FILE"
  echo ""
  echo "Available epics:"
  yq '.future.initiatives[].epics[].id' "$FUTURE_FILE" 2>/dev/null || echo "  None found"
  exit 1
fi

# Check for ID collision in current-sprint.yaml
EXISTING_ID=$(yq ".epics[] | select(.id == \"$EPIC_ID\") | .id" "$SPRINT_FILE" 2>/dev/null || echo "")

NEW_EPIC_ID="$EPIC_ID"
if [[ -n "$EXISTING_ID" && "$EXISTING_ID" != "null" ]]; then
  echo "Warning: Epic ID $EPIC_ID already exists in current sprint."

  # Find the highest epic-N ID and increment
  MAX_EPIC_NUM=$(yq '.epics[].id' "$SPRINT_FILE" 2>/dev/null | grep -oE 'epic-[0-9]+' | sed 's/epic-//' | sort -n | tail -1 || echo "0")
  if [[ -z "$MAX_EPIC_NUM" ]]; then
    MAX_EPIC_NUM=0
  fi
  NEW_EPIC_NUM=$((MAX_EPIC_NUM + 1))
  NEW_EPIC_ID="epic-$NEW_EPIC_NUM"

  echo "Assigning new ID: $NEW_EPIC_ID"
  echo ""
fi

# Extract epic fields
EPIC_TITLE=$(echo "$EPIC_DATA" | yq -r '.title // "Unknown"')
EPIC_DESCRIPTION=$(echo "$EPIC_DATA" | yq -r '.description // ""')
EPIC_POINTS=$(echo "$EPIC_DATA" | yq -r '.points // 0')
EPIC_PRIORITY=$(echo "$EPIC_DATA" | yq -r '.priority // "P2"')
EPIC_REPOS=$(echo "$EPIC_DATA" | yq -r '.repos // "pennyfarthing"')
STORY_COUNT=$(echo "$EPIC_DATA" | yq '[.stories[]] | length')

echo ""
echo "Promoting epic to current sprint:"
echo "  Original ID: $EPIC_ID"
if [[ "$NEW_EPIC_ID" != "$EPIC_ID" ]]; then
  echo "  New ID: $NEW_EPIC_ID"
fi
echo "  Title: $EPIC_TITLE"
echo "  Points: $EPIC_POINTS"
echo "  Priority: $EPIC_PRIORITY"
echo "  Stories: $STORY_COUNT"
echo ""

# Build the new epic object as JSON, then use yq to append it properly
# This ensures valid YAML structure

# Extract old epic ID prefix for updating story IDs (e.g., "64" from "epic-64")
OLD_ID_NUM=$(echo "$EPIC_ID" | sed 's/epic-//')
NEW_ID_NUM=$(echo "$NEW_EPIC_ID" | sed 's/epic-//')

# Create a temp file for the new epic
TEMP_EPIC=$(mktemp)
trap "rm -f $TEMP_EPIC" EXIT

# Transform the epic data: update IDs, add required fields, format for current-sprint.yaml
# Note: Using -o yaml for Go yq (not -y which is Python yq)
echo "$EPIC_DATA" | yq -o yaml "
  .id = \"$NEW_EPIC_ID\" |
  .type = \"epic\" |
  .title = \"Epic: \" + .title |
  .status = \"backlog\" |
  .stories = [.stories[] |
    .id = ((.id | tostring) | sub(\"^${OLD_ID_NUM}-\"; \"${NEW_ID_NUM}-\")) |
    .status = \"backlog\" |
    .repos = (.repos // \"pennyfarthing\") |
    .workflow = (.workflow // \"tdd\") |
    .priority = (.priority // \"P2\") |
    .acceptance_criteria = (.acceptance_criteria // [])
  ]
" > "$TEMP_EPIC"

echo "Epic to add:"
echo "---"
cat "$TEMP_EPIC"
echo "---"
echo ""

# Use yq to properly append the epic to the epics array
yq eval -i ".epics += [$(cat "$TEMP_EPIC" | yq -o json)]" "$SPRINT_FILE"

echo "Successfully added epic to $SPRINT_FILE"

# Remove from future.yaml
echo ""
echo "Removing from future.yaml..."
yq eval -i "del(.future.initiatives[].epics[] | select(.id == \"$EPIC_ID\"))" "$FUTURE_FILE"
echo "Removed $EPIC_ID from future.yaml"

echo ""
echo "Promotion complete!"
echo ""
echo "Next steps:"
echo "  1. Review the epic in $SPRINT_FILE"
echo "  2. Create Jira epic: .pennyfarthing/scripts/core/run.sh jira/create-jira-epic.sh $NEW_EPIC_ID"
echo "  3. Start work: /sprint work ${NEW_ID_NUM}-1"
