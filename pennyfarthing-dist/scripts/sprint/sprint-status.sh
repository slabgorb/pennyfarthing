#!/bin/bash
# Display current sprint status
# Usage: .pennyfarthing/scripts/run.sh sprint/sprint-status.sh
#    or: Invoked with PROJECT_ROOT already set

set -euo pipefail

# Load shared sprint functions
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/sprint-common.sh"

SPRINT_FILE=$(get_sprint_file)

if [[ ! -f "$SPRINT_FILE" ]]; then
  echo "Error: Sprint file not found at $SPRINT_FILE"
  exit 1
fi

check_yq || exit 1

# Extract sprint metadata using shared function pattern
SPRINT_NUM=$(get_sprint_metadata "number")
SPRINT_NAME="TO Sprint $SPRINT_NUM"
SPRINT_GOAL=$(get_sprint_metadata "goal")
START_DATE=$(get_sprint_metadata "start_date")
END_DATE=$(get_sprint_metadata "end_date")
STATUS=$(get_sprint_metadata "status")

echo "# Sprint Status"
echo ""
echo "**Sprint:** $SPRINT_NAME"
echo "**Goal:** $SPRINT_GOAL"
echo "**Dates:** $START_DATE to $END_DATE"
echo "**Status:** $STATUS"
echo ""

# Get counts using shared functions
STORY_COUNTS=$(get_story_counts)
BACKLOG=$(echo "$STORY_COUNTS" | grep -o 'backlog:[0-9]*' | cut -d: -f2)
IN_PROGRESS=$(echo "$STORY_COUNTS" | grep -o 'in_progress:[0-9]*' | cut -d: -f2)
TOTAL_STORIES=$((BACKLOG + IN_PROGRESS))

POINT_COUNTS=$(get_point_counts)
BACKLOG_POINTS=$(echo "$POINT_COUNTS" | grep -o 'backlog:[0-9]*' | cut -d: -f2)
IN_PROGRESS_POINTS=$(echo "$POINT_COUNTS" | grep -o 'in_progress:[0-9]*' | cut -d: -f2)
TOTAL_POINTS=$(echo "$POINT_COUNTS" | grep -o 'total:[0-9]*' | cut -d: -f2)

echo "## Summary"
echo ""
echo "| Status | Stories | Points |"
echo "|--------|---------|--------|"
echo "| Backlog | $BACKLOG | $BACKLOG_POINTS |"
echo "| In Progress | $IN_PROGRESS | $IN_PROGRESS_POINTS |"
echo "| **Total Remaining** | **$TOTAL_STORIES** | **$TOTAL_POINTS** |"
echo ""

# List stories by epic
echo "## Stories by Epic"
echo ""

yq eval '.epics[] | "### " + .title + "\n" + (.stories[] | "- [" + .status + "] " + .id + ": " + .title + " (" + (.points | tostring) + " pts)")' "$SPRINT_FILE" 2>/dev/null || echo "No stories found"

# Check archive for completed count
SPRINT_NUM=$(echo "$SPRINT_NAME" | sed 's/TO Sprint //')
ARCHIVE_FILE="$PROJECT_ROOT/sprint/archive/sprint-${SPRINT_NUM}-completed.yaml"

if [[ -f "$ARCHIVE_FILE" ]]; then
  COMPLETED_COUNT=$(yq '.completed | length' "$ARCHIVE_FILE" 2>/dev/null || echo "0")
  COMPLETED_POINTS=$(sum_points "$(yq '.completed[].points' "$ARCHIVE_FILE" 2>/dev/null)")
  echo ""
  echo "## Completed This Sprint"
  echo ""
  echo "**Stories:** $COMPLETED_COUNT | **Points:** $COMPLETED_POINTS"
  echo ""
  echo "See: sprint/archive/sprint-${SPRINT_NUM}-completed.yaml"
fi
