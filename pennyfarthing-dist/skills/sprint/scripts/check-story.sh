#!/bin/bash
# Check if a story or epic exists and is available for work
# Usage: check-story.sh <id|next>
#
# Arguments:
#   <story-id>  - Check specific story availability
#   <epic-id>   - Get first available story in epic
#   next        - Get highest-priority available story across all epics
#
# Returns JSON with story/epic details and availability

set -euo pipefail

ID="${1:-}"

if [[ -z "$ID" ]]; then
  echo '{"type": "error", "message": "No ID provided"}'
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
  echo '{"type": "error", "message": "Sprint file not found"}'
  exit 1
fi

# Handle "next" argument - find highest priority available story
if [[ "$ID" == "next" ]]; then
  # Get all available stories (backlog or ready), sort by priority, take first
  NEXT_STORY=$(yq -o json "[.epics[].stories[] | select(.status == \"backlog\" or .status == \"ready\" or .status == null)] | sort_by(.priority) | .[0]" "$SPRINT_FILE" 2>/dev/null || echo "null")

  if [[ "$NEXT_STORY" != "null" && -n "$NEXT_STORY" ]]; then
    STORY_ID=$(echo "$NEXT_STORY" | yq -r '.id')
    STORY_TITLE=$(echo "$NEXT_STORY" | yq -r '.title')
    STORY_POINTS=$(echo "$NEXT_STORY" | yq -r '.points // 0')
    STORY_PRIORITY=$(echo "$NEXT_STORY" | yq -r '.priority // "P2"')
    STORY_WORKFLOW=$(echo "$NEXT_STORY" | yq -r '.workflow // "tdd"')
    STORY_REPOS=$(echo "$NEXT_STORY" | yq -r '.repos // "pennyfarthing"')
    STORY_AC=$(echo "$NEXT_STORY" | yq -o json '.acceptance_criteria // []')
    EPIC_ID=$(yq -r ".epics[] | select(.stories[].id == \"$STORY_ID\") | .id" "$SPRINT_FILE" 2>/dev/null | head -1)

    cat <<EOF
{
  "type": "next",
  "story": {
    "id": "$STORY_ID",
    "title": "$STORY_TITLE",
    "points": $STORY_POINTS,
    "priority": "$STORY_PRIORITY",
    "workflow": "$STORY_WORKFLOW",
    "repos": "$STORY_REPOS",
    "epic_id": "$EPIC_ID",
    "acceptance_criteria": $STORY_AC
  }
}
EOF
  else
    echo '{"type": "next", "story": null, "message": "No available stories in backlog"}'
  fi
  exit 0
fi

# Check if it's an epic
EPIC_DATA=$(yq -o json ".epics[] | select(.id == \"$ID\")" "$SPRINT_FILE" 2>/dev/null || echo "")

if [[ -n "$EPIC_DATA" && "$EPIC_DATA" != "null" ]]; then
  # It's an epic - get first available story by priority
  FIRST_STORY=$(yq -o json "[.epics[] | select(.id == \"$ID\") | .stories[] | select(.status == \"backlog\" or .status == \"ready\" or .status == null)] | sort_by(.priority) | .[0]" "$SPRINT_FILE" 2>/dev/null || echo "null")

  EPIC_TITLE=$(echo "$EPIC_DATA" | yq -r '.title // "Unknown"')
  STORY_COUNT=$(yq "[.epics[] | select(.id == \"$ID\") | .stories[] | select(.status == \"backlog\" or .status == \"ready\" or .status == null)] | length" "$SPRINT_FILE" 2>/dev/null || echo "0")

  if [[ "$FIRST_STORY" != "null" && -n "$FIRST_STORY" ]]; then
    STORY_ID=$(echo "$FIRST_STORY" | yq -r '.id')
    STORY_TITLE=$(echo "$FIRST_STORY" | yq -r '.title')
    STORY_POINTS=$(echo "$FIRST_STORY" | yq -r '.points // 0')
    STORY_WORKFLOW=$(echo "$FIRST_STORY" | yq -r '.workflow // "tdd"')
    STORY_REPOS=$(echo "$FIRST_STORY" | yq -r '.repos // "pennyfarthing"')
    STORY_AC=$(echo "$FIRST_STORY" | yq -o json '.acceptance_criteria // []')

    cat <<EOF
{
  "type": "epic",
  "id": "$ID",
  "title": "$EPIC_TITLE",
  "available_stories": $STORY_COUNT,
  "first_story": {
    "id": "$STORY_ID",
    "title": "$STORY_TITLE",
    "points": $STORY_POINTS,
    "workflow": "$STORY_WORKFLOW",
    "repos": "$STORY_REPOS",
    "acceptance_criteria": $STORY_AC
  }
}
EOF
  else
    cat <<EOF
{
  "type": "epic",
  "id": "$ID",
  "title": "$EPIC_TITLE",
  "available_stories": 0,
  "first_story": null,
  "message": "No available stories in this epic"
}
EOF
  fi
  exit 0
fi

# Check if it's a story
STORY_DATA=$(yq -o json ".epics[].stories[] | select(.id == \"$ID\")" "$SPRINT_FILE" 2>/dev/null || echo "")

if [[ -n "$STORY_DATA" && "$STORY_DATA" != "null" ]]; then
  STATUS=$(echo "$STORY_DATA" | yq -r '.status // "backlog"')
  ASSIGNED=$(echo "$STORY_DATA" | yq -r '.assigned_to // ""')
  TITLE=$(echo "$STORY_DATA" | yq -r '.title // "Unknown"')
  POINTS=$(echo "$STORY_DATA" | yq -r '.points // 0')
  WORKFLOW=$(echo "$STORY_DATA" | yq -r '.workflow // "tdd"')
  EPIC_ID=$(yq -r ".epics[] | select(.stories[].id == \"$ID\") | .id" "$SPRINT_FILE" 2>/dev/null | head -1)
  REPOS=$(echo "$STORY_DATA" | yq -r '.repos // "pennyfarthing"')

  # Story is available if status is backlog/ready and not assigned
  if [[ ("$STATUS" == "backlog" || "$STATUS" == "ready") && -z "$ASSIGNED" ]]; then
    AVAILABLE="true"
  else
    AVAILABLE="false"
  fi

  # Get acceptance criteria as JSON array
  AC=$(echo "$STORY_DATA" | yq -o json '.acceptance_criteria // []')

  cat <<EOF
{
  "type": "story",
  "id": "$ID",
  "title": "$TITLE",
  "points": $POINTS,
  "workflow": "$WORKFLOW",
  "status": "$STATUS",
  "assigned_to": "$ASSIGNED",
  "epic_id": "$EPIC_ID",
  "repos": "$REPOS",
  "available": $AVAILABLE,
  "acceptance_criteria": $AC
}
EOF
  exit 0
fi

# Not found
echo '{"type": "not_found", "id": "'"$ID"'", "message": "Story or epic not found in current sprint"}'
exit 0
