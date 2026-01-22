#!/bin/bash
# Display future work initiatives and epics from future.yaml
# Usage: .pennyfarthing/scripts/run.sh sprint/list-future.sh [--epic EPIC_ID]
#
# Shows initiatives with their epics, points, status, and blockers
# Use --epic to show detailed stories for a specific epic

set -euo pipefail

# PROJECT_ROOT should be set by run.sh, but find it if not
if [[ -z "${PROJECT_ROOT:-}" ]]; then
  d="$PWD"
  while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do
    d="$(dirname "$d")"
  done
  PROJECT_ROOT="$d"
fi

FUTURE_FILE="$PROJECT_ROOT/sprint/future.yaml"

if [[ ! -f "$FUTURE_FILE" ]]; then
  echo "Error: Future file not found at $FUTURE_FILE"
  exit 1
fi

if ! command -v yq &> /dev/null; then
  echo "Error: yq is required but not installed"
  echo "Install with: brew install yq"
  exit 1
fi

# Parse arguments
EPIC_DETAIL=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --epic)
      EPIC_DETAIL="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# If specific epic requested, show detailed view
if [[ -n "$EPIC_DETAIL" ]]; then
  echo "# Epic Details: $EPIC_DETAIL"
  echo ""

  # Find the epic
  EPIC_DATA=$(yq -o=json ".future.initiatives[].epics[] | select(.id == \"$EPIC_DETAIL\")" "$FUTURE_FILE" 2>/dev/null)

  if [[ -z "$EPIC_DATA" ]]; then
    echo "Error: Epic $EPIC_DETAIL not found in future.yaml"
    exit 1
  fi

  EPIC_TITLE=$(echo "$EPIC_DATA" | jq -r '.title')
  EPIC_DESC=$(echo "$EPIC_DATA" | jq -r '.description // "No description"' | head -5)
  EPIC_POINTS=$(echo "$EPIC_DATA" | jq -r '.points')
  EPIC_PRIORITY=$(echo "$EPIC_DATA" | jq -r '.priority // "P2"')
  EPIC_STATUS=$(echo "$EPIC_DATA" | jq -r '.status // "planning"')

  echo "**Title:** $EPIC_TITLE"
  echo "**Points:** $EPIC_POINTS | **Priority:** $EPIC_PRIORITY | **Status:** $EPIC_STATUS"
  echo ""
  echo "**Description:**"
  echo "$EPIC_DESC"
  echo ""
  echo "## Stories"
  echo ""
  echo "| ID | Title | Pts | Pri | Status |"
  echo "|----|-------|-----|-----|--------|"

  echo "$EPIC_DATA" | jq -r '.stories[]? | [.id, .title, (.points | tostring), (.priority // "P1"), (.status // "planning")] | @tsv' | \
    while IFS=$'\t' read -r story_id story_title story_points story_priority story_status; do
      # Truncate title if too long
      if [[ ${#story_title} -gt 45 ]]; then
        story_title="${story_title:0:42}..."
      fi
      echo "| $story_id | $story_title | $story_points | $story_priority | $story_status |"
    done

  echo ""
  echo "---"
  echo "To promote this epic: \`/sprint promote $EPIC_DETAIL\`"
  exit 0
fi

# Default: show initiative summary
echo "# Future Work - Available for Promotion"
echo ""

# Get initiatives
INITIATIVE_COUNT=$(yq '.future.initiatives | length' "$FUTURE_FILE")

for ((i=0; i<INITIATIVE_COUNT; i++)); do
  INIT_NAME=$(yq ".future.initiatives[$i].name" "$FUTURE_FILE")
  INIT_STATUS=$(yq ".future.initiatives[$i].status // \"planning\"" "$FUTURE_FILE")
  INIT_BLOCKED=$(yq ".future.initiatives[$i].blocked_by // \"\"" "$FUTURE_FILE")
  INIT_POINTS=$(yq ".future.initiatives[$i].total_points // 0" "$FUTURE_FILE")

  # Status indicator
  if [[ "$INIT_STATUS" == "ready" ]]; then
    STATUS_ICON="[READY]"
  elif [[ -n "$INIT_BLOCKED" && "$INIT_BLOCKED" != "null" ]]; then
    STATUS_ICON="[BLOCKED]"
  else
    STATUS_ICON="[$INIT_STATUS]"
  fi

  echo "## $INIT_NAME $STATUS_ICON"
  echo "**Total:** $INIT_POINTS points"

  if [[ -n "$INIT_BLOCKED" && "$INIT_BLOCKED" != "null" ]]; then
    echo "**Blocked:** $INIT_BLOCKED"
  fi
  echo ""

  echo "| Epic | Title | Pts | Pri | Status |"
  echo "|------|-------|-----|-----|--------|"

  # Get epics for this initiative
  yq -o=json ".future.initiatives[$i].epics[]" "$FUTURE_FILE" 2>/dev/null | \
    jq -r '[.id, .title, (.points | tostring), (.priority // "P2"), (.status // "planning")] | @tsv' | \
    while IFS=$'\t' read -r epic_id epic_title epic_points epic_priority epic_status; do
      # Truncate title if too long
      if [[ ${#epic_title} -gt 40 ]]; then
        epic_title="${epic_title:0:37}..."
      fi
      echo "| $epic_id | $epic_title | $epic_points | $epic_priority | $epic_status |"
    done

  echo ""
done

# Summary
TOTAL_EPICS=$(yq '[.future.initiatives[].epics[]] | length' "$FUTURE_FILE")
TOTAL_POINTS=$(yq '.future.initiatives[].epics[].points' "$FUTURE_FILE" | paste -sd+ - | bc 2>/dev/null || echo "0")
READY_COUNT=$(yq '[.future.initiatives[] | select(.status == "ready") | .epics[]] | length' "$FUTURE_FILE")

echo "---"
echo "**Summary:** $TOTAL_EPICS epics, $TOTAL_POINTS points total"
if [[ "$READY_COUNT" -gt 0 ]]; then
  echo "**Ready to promote:** $READY_COUNT epics"
fi
echo ""
echo "To see epic details: \`/sprint future --epic epic-55\`"
echo "To promote an epic: \`/sprint promote epic-55\`"
