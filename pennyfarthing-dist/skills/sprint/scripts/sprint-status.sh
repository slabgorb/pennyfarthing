#!/bin/bash
# Display current sprint status
# Usage: .pennyfarthing/scripts/core/run.sh sprint/sprint-status.sh [filter]
#    or: Invoked with PROJECT_ROOT already set
#
# Filters:
#   (none)       - Show all stories
#   todo         - Show only backlog stories
#   in-progress  - Show only in_progress stories
#   done         - Show only done/cancelled stories

set -euo pipefail

# PROJECT_ROOT should be set by run.sh, but find it if not
if [[ -z "${PROJECT_ROOT:-}" ]]; then
  d="$PWD"
  while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do
    d="$(dirname "$d")"
  done
  PROJECT_ROOT="$d"
fi

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

# Extract sprint metadata
SPRINT_NAME=$(yq eval '.sprint.name' "$SPRINT_FILE")
SPRINT_GOAL=$(yq eval '.sprint.goal' "$SPRINT_FILE")
START_DATE=$(yq eval '.sprint.start_date' "$SPRINT_FILE")
END_DATE=$(yq eval '.sprint.end_date' "$SPRINT_FILE")
STATUS=$(yq eval '.sprint.status' "$SPRINT_FILE")

echo "# Sprint Status"
echo ""
echo "**Sprint:** $SPRINT_NAME"
echo "**Goal:** $SPRINT_GOAL"
echo "**Dates:** $START_DATE to $END_DATE"
echo "**Status:** $STATUS"
echo ""

# Count stories by status
TOTAL_STORIES=$(yq eval '[.epics[].stories[]] | length' "$SPRINT_FILE")
BACKLOG=$(yq eval '[.epics[].stories[] | select(.status == "backlog")] | length' "$SPRINT_FILE")
IN_PROGRESS=$(yq eval '[.epics[].stories[] | select(.status == "in_progress")] | length' "$SPRINT_FILE")

# Sum points using paste+bc (yq add not available in all versions)
sum_points() {
  local result
  result=$(echo "$1" | paste -sd+ - | bc 2>/dev/null)
  echo "${result:-0}"
}

TOTAL_POINTS=$(sum_points "$(yq '.epics[].stories[].points' "$SPRINT_FILE")")
BACKLOG_POINTS=$(sum_points "$(yq '.epics[].stories[] | select(.status == "backlog") | .points' "$SPRINT_FILE")")
IN_PROGRESS_POINTS=$(sum_points "$(yq '.epics[].stories[] | select(.status == "in_progress") | .points' "$SPRINT_FILE")")

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
if [[ -n "$STATUS_FILTER" ]]; then
  yq eval -o=json '.epics[]' "$SPRINT_FILE" 2>/dev/null | jq -r --arg status "$STATUS_FILTER" '
    .title as $title |
    [.stories[] | select(.status == $status)] |
    if length > 0 then
      "### " + $title + "\n" +
      (map("- [" + .status + "] " + .id + ": " + .title + " (" + (.points | tostring) + " pts)") | join("\n")) + "\n"
    else
      empty
    end
  ' 2>/dev/null || echo "No stories found"
else
  yq eval -o=json '.epics[]' "$SPRINT_FILE" 2>/dev/null | jq -r '
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
