#!/bin/bash
# Display current sprint status
# Usage: .pennyfarthing/scripts/sprint/sprint-status.sh [filter]
#
# Filters:
#   (none)       - Show all stories
#   todo         - Show only backlog stories
#   in-progress  - Show only in_progress stories
#   done         - Show only done/cancelled stories

set -euo pipefail

# Self-locate and set up PROJECT_ROOT
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/../lib/find-root.sh"
source "$SCRIPT_DIR/sprint-common.sh"

# Parse filter argument
FILTER="${1:-}"
case "$FILTER" in
  todo|backlog)
    STATUS_FILTER="backlog"
    FILTER_LABEL="Todo"
    ;;
  in-progress|wip)
    STATUS_FILTER="in_progress"
    FILTER_LABEL="In Progress"
    ;;
  done|completed)
    STATUS_FILTER="done"
    FILTER_LABEL="Done"
    ;;
  cancelled|canceled)
    STATUS_FILTER="cancelled"
    FILTER_LABEL="Cancelled"
    ;;
  "")
    STATUS_FILTER=""
    FILTER_LABEL=""
    ;;
  *)
    echo "Error: Unknown filter '$FILTER'"
    echo "Valid filters: todo, in-progress, done, cancelled"
    exit 1
    ;;
esac

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
TOTAL_POINTS=$((BACKLOG_POINTS + IN_PROGRESS_POINTS))

echo "## Summary"
echo ""
echo "| Status | Stories | Points |"
echo "|--------|---------|--------|"
echo "| Backlog | $BACKLOG | $BACKLOG_POINTS |"
echo "| In Progress | $IN_PROGRESS | $IN_PROGRESS_POINTS |"
echo "| **Total Remaining** | **$TOTAL_STORIES** | **$TOTAL_POINTS** |"
echo ""

# List stories by epic (grouped - epic name appears once)
if [[ -n "$FILTER_LABEL" ]]; then
  echo "## Stories by Epic (${FILTER_LABEL} only)"
else
  echo "## Stories by Epic"
fi
echo ""

# Process each epic, output header once then all its stories
# Apply status filter if specified
# Use resolved sprint file (merges epic shards from string refs)
RESOLVED_FILE=$(get_resolved_sprint_file) || RESOLVED_FILE="$SPRINT_FILE"

if [[ -n "$STATUS_FILTER" ]]; then
  yq eval -o=json '.epics[]' "$RESOLVED_FILE" 2>/dev/null | jq -r --arg status "$STATUS_FILTER" '
    .title as $title |
    [.stories[]? | select(.status == $status)] |
    if length > 0 then
      "### " + $title + "\n" +
      (map("- [" + .status + "] " + .id + ": " + .title + " (" + (.points | tostring) + " pts)") | join("\n")) + "\n"
    else
      empty
    end
  ' 2>/dev/null || echo "No stories found"
else
  yq eval -o=json '.epics[]' "$RESOLVED_FILE" 2>/dev/null | jq -r '
    "### " + .title + "\n" +
    (.stories | map("- [" + .status + "] " + .id + ": " + .title + " (" + (.points | tostring) + " pts)") | join("\n")) + "\n"
  ' 2>/dev/null || echo "No stories found"
fi

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
