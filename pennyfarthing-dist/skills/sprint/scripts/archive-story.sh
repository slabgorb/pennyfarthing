#!/bin/bash
# Archive a completed story from current-sprint.yaml to the sprint archive
# Usage: .pennyfarthing/scripts/core/run.sh sprint/archive-story.sh <story-id> [pr-number]
#
# Example: .pennyfarthing/scripts/core/run.sh sprint/archive-story.sh MSSCI-11945 368

set -euo pipefail

STORY_ID="${1:-}"
PR_NUMBER="${2:-}"

if [[ -z "$STORY_ID" ]]; then
  echo "Usage: archive-story.sh <story-id> [pr-number]"
  echo "Example: archive-story.sh MSSCI-11945 368"
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

SPRINT_FILE="$PROJECT_ROOT/sprint/current-sprint.yaml"

if [[ ! -f "$SPRINT_FILE" ]]; then
  echo "Error: Sprint file not found at $SPRINT_FILE"
  exit 1
fi

# Extract sprint name to determine archive file
SPRINT_NAME=$(grep -E "^\s+name:" "$SPRINT_FILE" | head -1 | sed 's/.*"TO Sprint \([0-9]*\)".*/\1/')
if [[ -z "$SPRINT_NAME" ]]; then
  echo "Error: Could not extract sprint name from $SPRINT_FILE"
  exit 1
fi

ARCHIVE_FILE="$PROJECT_ROOT/sprint/archive/sprint-${SPRINT_NAME}-completed.yaml"

# Check if archive file exists
if [[ ! -f "$ARCHIVE_FILE" ]]; then
  echo "Error: Archive file not found at $ARCHIVE_FILE"
  echo "Create it first with new-sprint.sh or manually"
  exit 1
fi

# Use yq to extract story data
if ! command -v yq &> /dev/null; then
  echo "Error: yq is required but not installed"
  echo "Install with: brew install yq"
  exit 1
fi

# Find the story in current sprint
STORY_DATA=$(yq eval ".epics[].stories[] | select(.id == \"$STORY_ID\")" "$SPRINT_FILE")

if [[ -z "$STORY_DATA" ]]; then
  echo "Error: Story $STORY_ID not found in $SPRINT_FILE"
  exit 1
fi

# Extract story fields
TITLE=$(echo "$STORY_DATA" | yq eval '.title' -)
POINTS=$(echo "$STORY_DATA" | yq eval '.points' -)
EPIC_ID=$(yq eval ".epics[] | select(.stories[].id == \"$STORY_ID\") | .id" "$SPRINT_FILE" | head -1)

# Get today's date
COMPLETED_DATE=$(date +%Y-%m-%d)

# Build the archive entry
echo ""
echo "Archiving story:"
echo "  ID: $STORY_ID"
echo "  Title: $TITLE"
echo "  Points: $POINTS"
echo "  Epic: $EPIC_ID"
echo "  Completed: $COMPLETED_DATE"
[[ -n "$PR_NUMBER" ]] && echo "  PR: $PR_NUMBER"
echo ""

# Append to archive file
{
  echo "  - id: $STORY_ID"
  echo "    epic: $EPIC_ID"
  echo "    title: \"$TITLE\""
  echo "    points: $POINTS"
  echo "    completed: $COMPLETED_DATE"
  [[ -n "$PR_NUMBER" ]] && echo "    pr: $PR_NUMBER"
} >> "$ARCHIVE_FILE"

echo "Added to $ARCHIVE_FILE"

# Remove from current sprint
echo ""
echo "Now remove the story from $SPRINT_FILE"
echo "Use: yq eval -i 'del(.epics[].stories[] | select(.id == \"$STORY_ID\"))' $SPRINT_FILE"
echo ""
echo "If the epic has no more stories, also remove the epic section."
