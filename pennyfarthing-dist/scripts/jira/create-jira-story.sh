#!/bin/bash
# Create a single Jira story from sprint YAML
# Usage: create-jira-story.sh <epic-jira-key> <story-id>
#
# Example: create-jira-story.sh MSSCI-12077 MSSCI-12066

set -euo pipefail

EPIC_JIRA_KEY="${1:-}"
STORY_ID="${2:-}"

if [[ -z "$EPIC_JIRA_KEY" || -z "$STORY_ID" ]]; then
  echo "Usage: create-jira-story.sh <epic-jira-key> <story-id>"
  exit 1
fi

# Find project root
source "$(dirname "${BASH_SOURCE[0]}")/../lib/find-root.sh"

SPRINT_FILE="$PROJECT_ROOT/sprint/current-sprint.yaml"
JIRA_PROJECT="${JIRA_PROJECT_KEY:-MSSCI}"
PROJECT_LABEL="${PROJECT_LABEL:-${PROJECT_NAME:-pennyfarthing}}"
SPRINT_JIRA_ID=$(yq '.sprint.jira_sprint_id' "$SPRINT_FILE" 2>/dev/null || echo "")

# Get story data
STORY_DATA=$(yq -o json "(.epics[] | select(.jira == \"$EPIC_JIRA_KEY\")).stories[] | select(.id == \"$STORY_ID\")" "$SPRINT_FILE" 2>/dev/null || echo "")

if [[ -z "$STORY_DATA" || "$STORY_DATA" == "null" ]]; then
  echo "Error: Story $STORY_ID not found under epic $EPIC_JIRA_KEY"
  exit 1
fi

STORY_TITLE=$(echo "$STORY_DATA" | yq -r '.title // "Untitled"')
STORY_DESCRIPTION=$(echo "$STORY_DATA" | yq -r '.description // ""')
STORY_POINTS=$(echo "$STORY_DATA" | yq -r '.points // 0')
STORY_PRIORITY=$(echo "$STORY_DATA" | yq -r '.priority // "P2"')
STORY_JIRA=$(echo "$STORY_DATA" | yq -r '.jira // ""')

# Check if already has Jira key
if [[ -n "$STORY_JIRA" && "$STORY_JIRA" != "null" ]]; then
  echo "SKIP: $STORY_ID already has Jira key: $STORY_JIRA"
  exit 0
fi

# Map priority
case "$STORY_PRIORITY" in
  P0) JIRA_PRIORITY="Highest" ;;
  P1) JIRA_PRIORITY="High" ;;
  P2) JIRA_PRIORITY="Medium" ;;
  P3) JIRA_PRIORITY="Low" ;;
  *) JIRA_PRIORITY="Medium" ;;
esac

# Create story
STORY_OUTPUT=$(echo "" | jira issue create \
  --project "$JIRA_PROJECT" \
  --type Story \
  --summary "$STORY_TITLE" \
  --body "$STORY_DESCRIPTION" \
  --parent "$EPIC_JIRA_KEY" \
  --priority "$JIRA_PRIORITY" \
  --label "$PROJECT_LABEL" \
  --no-input 2>&1) || {
    echo "Error creating story: $STORY_OUTPUT"
    exit 1
  }

STORY_JIRA_KEY=$(echo "$STORY_OUTPUT" | grep -oE 'MSSCI-[0-9]+' | head -1)

if [[ -z "$STORY_JIRA_KEY" ]]; then
  echo "Error: Could not extract Jira key from output"
  exit 1
fi

echo "Created: $STORY_JIRA_KEY ($STORY_TITLE)"

# Update story points
if [[ "$STORY_POINTS" -gt 0 ]]; then
  jira issue edit "$STORY_JIRA_KEY" --custom "customfield_10031=$STORY_POINTS" --no-input 2>/dev/null || true
fi

# Add to sprint
if [[ -n "$SPRINT_JIRA_ID" && "$SPRINT_JIRA_ID" != "null" ]]; then
  jira sprint add "$SPRINT_JIRA_ID" "$STORY_JIRA_KEY" 2>/dev/null || true
fi

# Update sprint YAML
yq eval -i "((.epics[] | select(.jira == \"$EPIC_JIRA_KEY\")).stories[] | select(.id == \"$STORY_ID\")).id = \"$STORY_JIRA_KEY\"" "$SPRINT_FILE"
yq eval -i "((.epics[] | select(.jira == \"$EPIC_JIRA_KEY\")).stories[] | select(.id == \"$STORY_JIRA_KEY\")).jira = \"$STORY_JIRA_KEY\"" "$SPRINT_FILE"

echo "Updated sprint YAML"
