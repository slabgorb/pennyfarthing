#!/bin/bash
# Display available stories grouped by epic with Jira context
# Usage: .pennyfarthing/scripts/core/run.sh sprint/available-stories.sh
#
# Shows backlog stories with epic context, points, and workflow

set -euo pipefail

# PROJECT_ROOT should be set by run.sh, but find it if not
if [[ -z "${PROJECT_ROOT:-}" ]]; then
  d="$PWD"
  while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do
    d="$(dirname "$d")"
  done
  PROJECT_ROOT="$d"
fi

SPRINT_FILE="$PROJECT_ROOT/sprint/current-sprint.yaml"

if [[ ! -f "$SPRINT_FILE" ]]; then
  echo "Error: Sprint file not found at $SPRINT_FILE"
  exit 1
fi

if ! command -v yq &> /dev/null; then
  echo "Error: yq is required but not installed"
  echo "Install with: brew install yq"
  exit 1
fi

if ! command -v jira &> /dev/null; then
  echo "Error: jira CLI is required but not installed"
  echo "Install with: brew install ankitpokhrel/jira/jira"
  exit 1
fi

# Extract sprint info
SPRINT_NAME=$(yq '.sprint.name' "$SPRINT_FILE")
echo "# Available Stories - $SPRINT_NAME"
echo ""

# Get all epic IDs from the sprint file
EPIC_IDS=$(yq '.epics[].id' "$SPRINT_FILE" | tr '\n' ' ')

# Batch fetch epic details from Jira
echo "Fetching epic details from Jira..."
echo ""

# Process each epic
for EPIC_ID in $EPIC_IDS; do
  # Get epic title from sprint YAML (faster than Jira for display)
  EPIC_TITLE=$(yq ".epics[] | select(.id == \"$EPIC_ID\") | .title" "$SPRINT_FILE")

  # Get stories for this epic that are available (backlog or ready)
  STORY_COUNT=$(yq ".epics[] | select(.id == \"$EPIC_ID\") | .stories[] | select(.status == \"backlog\" or .status == \"ready\") | .id" "$SPRINT_FILE" 2>/dev/null | wc -l | tr -d ' ')

  if [[ "$STORY_COUNT" -eq 0 ]]; then
    continue
  fi

  # Fetch epic description from Jira for context (if it's a valid Jira key)
  # Jira uses Atlassian Document Format - extract text content from paragraphs
  EPIC_DESCRIPTION=""
  if [[ "$EPIC_ID" =~ ^MSSCI-[0-9]+$ ]]; then
    EPIC_DESCRIPTION=$(jira issue view "$EPIC_ID" --raw 2>/dev/null | \
      jq -r '.fields.description.content[]? | select(.type == "paragraph") | .content[]? | select(.type == "text") | .text' 2>/dev/null | \
      head -3 | tr '\n' ' ' | cut -c1-200)
  fi

  echo "## $EPIC_TITLE"
  if [[ -n "$EPIC_DESCRIPTION" ]]; then
    echo "*$EPIC_DESCRIPTION*"
  fi
  echo ""
  echo "| ID | Title | Pts | Pri | Status | Workflow |"
  echo "|----|-------|-----|-----|--------|----------|"

  # Get available stories for this epic (backlog or ready)
  yq -o=json ".epics[] | select(.id == \"$EPIC_ID\") | .stories[] | select(.status == \"backlog\" or .status == \"ready\")" "$SPRINT_FILE" 2>/dev/null | \
    jq -r '[.id, .title, (.points | tostring), (.priority // "P2"), (.status // "backlog"), (.workflow // "tdd")] | @tsv' | \
    while IFS=$'\t' read -r story_id story_title story_points story_priority story_status story_workflow; do
      # Truncate title if too long
      if [[ ${#story_title} -gt 40 ]]; then
        story_title="${story_title:0:37}..."
      fi
      echo "| $story_id | $story_title | $story_points | $story_priority | $story_status | $story_workflow |"
    done

  echo ""
done

# Summary
TOTAL_BACKLOG=$(yq '[.epics[].stories[] | select(.status == "backlog" or .status == "ready")] | length' "$SPRINT_FILE")
TOTAL_POINTS=$(yq '.epics[].stories[] | select(.status == "backlog" or .status == "ready") | .points' "$SPRINT_FILE" | paste -sd+ - | bc 2>/dev/null || echo "0")

echo "---"
echo "**Total available:** $TOTAL_BACKLOG stories, $TOTAL_POINTS points"
