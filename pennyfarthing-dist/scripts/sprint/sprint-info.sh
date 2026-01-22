#!/bin/bash
# Output sprint info as JSON for Cyclist sidebar
# Usage: .pennyfarthing/scripts/core/run.sh sprint/sprint-info.sh
#
# Returns: {"remaining": N, "inProgress": N, "endDate": "YYYY-MM-DD"}

set -euo pipefail

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
  echo '{"remaining": 0, "inProgress": 0, "endDate": null}'
  exit 0
fi

# Extract end date
END_DATE=$(yq -r '.sprint.end_date // ""' "$SPRINT_FILE")
if [[ -z "$END_DATE" || "$END_DATE" == "null" ]]; then
  END_DATE="null"
else
  END_DATE="\"$END_DATE\""
fi

# Calculate remaining points (backlog stories) - use awk for sum since yq add is problematic
REMAINING=$(yq '.epics[].stories[] | select(.status == "backlog" or .status == null) | .points // 0' "$SPRINT_FILE" 2>/dev/null | awk '{sum+=$1} END {print sum+0}')

# Calculate in-progress points
IN_PROGRESS=$(yq '.epics[].stories[] | select(.status == "in_progress") | .points // 0' "$SPRINT_FILE" 2>/dev/null | awk '{sum+=$1} END {print sum+0}')

echo "{\"remaining\": $REMAINING, \"inProgress\": $IN_PROGRESS, \"endDate\": $END_DATE}"
