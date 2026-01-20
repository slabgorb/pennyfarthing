#!/bin/bash
# Promote an epic from planning.yaml to current-sprint.yaml
# Usage: .pennyfarthing/scripts/run.sh promote-epic.sh <epic-id>
#
# Example: .pennyfarthing/scripts/run.sh promote-epic.sh epic-41

set -euo pipefail

EPIC_ID="${1:-}"

if [[ -z "$EPIC_ID" ]]; then
  echo "Usage: promote-epic.sh <epic-id>"
  echo "Example: promote-epic.sh epic-41"
  echo ""
  echo "Moves an epic and its stories from planning.yaml to current-sprint.yaml"
  exit 1
fi

# PROJECT_ROOT should be set by run.sh, but find it if not
if [[ -z "${PROJECT_ROOT:-}" ]]; then
  d="$PWD"
  while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do
    d="$(dirname "$d")"
  done
  PROJECT_ROOT="$d"
fi

PLANNING_FILE="$PROJECT_ROOT/sprint/planning.yaml"
SPRINT_FILE="$PROJECT_ROOT/sprint/current-sprint.yaml"

if [[ ! -f "$PLANNING_FILE" ]]; then
  echo "Error: Planning file not found at $PLANNING_FILE"
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

# Find the epic in planning.yaml
# Epics are nested under planning.initiatives[].epics[]
EPIC_DATA=$(yq -o json ".planning.initiatives[].epics[] | select(.id == \"$EPIC_ID\")" "$PLANNING_FILE" 2>/dev/null || echo "")

if [[ -z "$EPIC_DATA" || "$EPIC_DATA" == "null" ]]; then
  echo "Error: Epic $EPIC_ID not found in $PLANNING_FILE"
  echo ""
  echo "Available epics:"
  yq '.planning.initiatives[].epics[].id' "$PLANNING_FILE" 2>/dev/null || echo "  None found"
  exit 1
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
echo "  ID: $EPIC_ID"
echo "  Title: $EPIC_TITLE"
echo "  Points: $EPIC_POINTS"
echo "  Priority: $EPIC_PRIORITY"
echo "  Stories: $STORY_COUNT"
echo ""

# Generate the epic YAML block for current-sprint.yaml
# The format must match existing epics in current-sprint.yaml
EPIC_YAML=$(cat <<EOF
  - id: $EPIC_ID
    type: epic
    title: "Epic: $EPIC_TITLE"
    description: |
$(echo "$EPIC_DESCRIPTION" | sed 's/^/      /')
    priority: $EPIC_PRIORITY
    status: backlog
    repos: $EPIC_REPOS
    stories:
EOF
)

# Get stories and format them
STORIES_YAML=$(echo "$EPIC_DATA" | yq -r '.stories[] |
  "      - id: " + .id + "\n" +
  "        title: \"" + .title + "\"\n" +
  "        description: |\n" + (.description // "" | split("\n") | map("          " + .) | join("\n")) + "\n" +
  "        points: " + (.points | tostring) + "\n" +
  "        priority: " + (.priority // "P2") + "\n" +
  "        status: backlog\n" +
  "        repos: " + (.repos // "pennyfarthing") + "\n" +
  "        workflow: " + (.workflow // "tdd") + "\n" +
  "        acceptance_criteria:" + (if .acceptance_criteria then "\n" + (.acceptance_criteria | map("          - " + .) | join("\n")) else " []" end)
')

# Combine epic and stories
FULL_EPIC_YAML="$EPIC_YAML
$STORIES_YAML"

echo "Epic YAML to append:"
echo "---"
echo "$FULL_EPIC_YAML"
echo "---"
echo ""

# Append to current-sprint.yaml epics section
echo "$FULL_EPIC_YAML" >> "$SPRINT_FILE"

echo "Appended epic to $SPRINT_FILE"
echo ""
echo "To remove from planning.yaml, manually edit or use:"
echo "  yq eval -i 'del(.planning.initiatives[].epics[] | select(.id == \"$EPIC_ID\"))' $PLANNING_FILE"
echo ""
echo "Next steps:"
echo "  1. Review the appended YAML in $SPRINT_FILE"
echo "  2. Optionally create Jira epic: .pennyfarthing/scripts/run.sh create-jira-epic.sh $EPIC_ID"
echo "  3. Remove from planning.yaml if desired"
