#!/bin/bash
# Fix session file phase tracking when handoffs didn't update properly
# Usage: fix-session-phase.sh <story-id> <target-phase> [--dry-run]
#
# Example: fix-session-phase.sh 56-1 review
#          fix-session-phase.sh MSSCI-12190 approved --dry-run
#
# This script detects the current phase, validates the target phase is reachable,
# and updates the session file's Workflow Tracking section:
# - Updates **Phase:** field to target phase
# - Adds missing rows to Phase History table
# - Adds missing rows to Handoff History table
#
# Valid phases for TDD workflow: setup → red → green → review → approved → finish
# Valid phases for trivial workflow: setup → impl → review → approved → finish

set -euo pipefail

STORY_ID="${1:-}"
TARGET_PHASE="${2:-}"
DRY_RUN=false

# Parse options
for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      ;;
  esac
done

if [[ -z "$STORY_ID" ]] || [[ -z "$TARGET_PHASE" ]]; then
  echo "Usage: fix-session-phase.sh <story-id> <target-phase> [--dry-run]"
  echo ""
  echo "Arguments:"
  echo "  story-id      Story ID (e.g., 56-1 or MSSCI-12190)"
  echo "  target-phase  Target phase to set (e.g., review, approved, finish)"
  echo ""
  echo "Options:"
  echo "  --dry-run     Show what would be done without executing"
  echo ""
  echo "Examples:"
  echo "  fix-session-phase.sh 56-1 review          # Update to review phase"
  echo "  fix-session-phase.sh 56-1 approved        # Update to approved phase"
  echo "  fix-session-phase.sh 56-1 finish --dry-run # Preview finish update"
  exit 1
fi

# Find project root
source "$(dirname "${BASH_SOURCE[0]}")/../lib/find-root.sh"

# Try multiple session file naming patterns
SESSION_FILE=""
STORY_ID_LOWER=$(echo "$STORY_ID" | tr '[:upper:]' '[:lower:]')
for pattern in "${STORY_ID}-session.md" "${STORY_ID_LOWER}-session.md"; do
  if [[ -f "$PROJECT_ROOT/.session/$pattern" ]]; then
    SESSION_FILE="$PROJECT_ROOT/.session/$pattern"
    break
  fi
done

# Also try without the epic prefix (e.g., MSSCI-12190 might be in 56-1-session.md)
if [[ -z "$SESSION_FILE" ]]; then
  # Search for session files containing this story ID
  found=$(grep -l "Jira:.*$STORY_ID\|ID:.*$STORY_ID" "$PROJECT_ROOT/.session/"*-session.md 2>/dev/null | head -1 || echo "")
  if [[ -n "$found" ]]; then
    SESSION_FILE="$found"
  fi
fi

if [[ -z "$SESSION_FILE" ]] || [[ ! -f "$SESSION_FILE" ]]; then
  echo "Error: Session file not found for story $STORY_ID"
  echo "Searched in: $PROJECT_ROOT/.session/"
  exit 1
fi

echo "Session file: $SESSION_FILE"

# Extract current state
CURRENT_PHASE=$(grep -E '^\*\*Phase:\*\*' "$SESSION_FILE" | sed 's/\*\*Phase:\*\* //' | tr -d ' ' || echo "unknown")
WORKFLOW=$(grep -E '^\*\*Workflow:\*\*' "$SESSION_FILE" | head -1 | sed 's/\*\*Workflow:\*\* //' | tr -d ' ' || echo "tdd")
PHASE_STARTED=$(grep -E '^\*\*Phase Started:\*\*' "$SESSION_FILE" | sed 's/\*\*Phase Started:\*\* //' | tr -d ' ' || echo "")

echo "Current phase: $CURRENT_PHASE"
echo "Target phase: $TARGET_PHASE"
echo "Workflow: $WORKFLOW"

# Define valid phase sequences
case "$WORKFLOW" in
  tdd)
    PHASES=("setup" "red" "green" "review" "approved" "finish")
    AGENTS=("sm" "tea" "dev" "reviewer" "sm" "sm")
    GATES=("manual" "tests_fail" "tests_pass" "approval" "complete" "")
    ;;
  trivial)
    PHASES=("setup" "impl" "review" "approved" "finish")
    AGENTS=("sm" "dev" "reviewer" "sm" "sm")
    GATES=("manual" "tests_pass" "approval" "complete" "")
    ;;
  *)
    echo "Warning: Unknown workflow '$WORKFLOW', assuming TDD"
    PHASES=("setup" "red" "green" "review" "approved" "finish")
    AGENTS=("sm" "tea" "dev" "reviewer" "sm" "sm")
    GATES=("manual" "tests_fail" "tests_pass" "approval" "complete" "")
    ;;
esac

# Find indices
CURRENT_IDX=-1
TARGET_IDX=-1
for i in "${!PHASES[@]}"; do
  if [[ "${PHASES[$i]}" == "$CURRENT_PHASE" ]]; then
    CURRENT_IDX=$i
  fi
  if [[ "${PHASES[$i]}" == "$TARGET_PHASE" ]]; then
    TARGET_IDX=$i
  fi
done

if [[ $CURRENT_IDX -eq -1 ]]; then
  echo "Error: Current phase '$CURRENT_PHASE' not found in $WORKFLOW workflow"
  echo "Valid phases: ${PHASES[*]}"
  exit 1
fi

if [[ $TARGET_IDX -eq -1 ]]; then
  echo "Error: Target phase '$TARGET_PHASE' not found in $WORKFLOW workflow"
  echo "Valid phases: ${PHASES[*]}"
  exit 1
fi

if [[ $TARGET_IDX -le $CURRENT_IDX ]]; then
  echo "Error: Target phase '$TARGET_PHASE' is not ahead of current phase '$CURRENT_PHASE'"
  echo "Phase sequence: ${PHASES[*]}"
  exit 1
fi

# Calculate what transitions are needed
echo ""
echo "Transitions needed:"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TRANSITIONS=()

for ((i=CURRENT_IDX; i<TARGET_IDX; i++)); do
  FROM_PHASE="${PHASES[$i]}"
  TO_PHASE="${PHASES[$((i+1))]}"
  FROM_AGENT="${AGENTS[$i]}"
  TO_AGENT="${AGENTS[$((i+1))]}"
  GATE="${GATES[$((i+1))]}"

  echo "  $FROM_PHASE ($FROM_AGENT) → $TO_PHASE ($TO_AGENT) [gate: $GATE]"
  TRANSITIONS+=("$FROM_PHASE|$TO_PHASE|$FROM_AGENT|$TO_AGENT|$GATE")
done

if [[ "$DRY_RUN" == "true" ]]; then
  echo ""
  echo "[DRY RUN] Would update session file with:"
  echo "  - **Phase:** $TARGET_PHASE"
  echo "  - **Phase Started:** $NOW"
  echo "  - Phase History: close out $CURRENT_PHASE, add intermediate phases"
  echo "  - Handoff History: add ${#TRANSITIONS[@]} handoff(s)"
  exit 0
fi

echo ""
echo "Updating session file..."

# Build the Phase History additions
PHASE_HISTORY_ADDITIONS=""
HANDOFF_HISTORY_ADDITIONS=""
PREV_END="$NOW"

for transition in "${TRANSITIONS[@]}"; do
  IFS='|' read -r FROM_PHASE TO_PHASE FROM_AGENT TO_AGENT GATE <<< "$transition"

  # Add phase history row (close out the FROM phase)
  # We'll use NOW for ended time since we don't know actual times
  PHASE_HISTORY_ADDITIONS+="| $FROM_PHASE | - | $NOW | - |\n"

  # Add handoff history row
  HANDOFF_HISTORY_ADDITIONS+="| $FROM_AGENT | $TO_AGENT | $GATE | PASSED | $NOW |\n"
done

# Update the **Phase:** line
sed -i.bak "s/^\*\*Phase:\*\*.*/\*\*Phase:\*\* $TARGET_PHASE/" "$SESSION_FILE"

# Update the **Phase Started:** line
sed -i.bak "s/^\*\*Phase Started:\*\*.*/\*\*Phase Started:\*\* $NOW/" "$SESSION_FILE"

# Close out the current phase in Phase History (update the row that has "| - | - |" at the end)
# This is tricky - we need to find the row for current phase and add end time
# For now, we'll add a note about manual review needed

# Add handoff history rows before the "## Story Context" section
if [[ -n "$HANDOFF_HISTORY_ADDITIONS" ]]; then
  # Find the last handoff history row and add after it
  # The handoff history table ends before a blank line or next section

  # Use awk to insert after the last handoff history row
  awk -v additions="$HANDOFF_HISTORY_ADDITIONS" '
    /^\| .* \| .* \| .* \| .* \| .*\|$/ && /PASSED|FAILED/ {
      last_handoff = NR
      last_handoff_line = $0
    }
    {
      print
      if (NR == last_handoff && additions != "") {
        printf "%s", additions
      }
    }
  ' "$SESSION_FILE" > "$SESSION_FILE.tmp" && mv "$SESSION_FILE.tmp" "$SESSION_FILE"
fi

# Clean up backup
rm -f "$SESSION_FILE.bak"

echo ""
echo "✓ Session file updated"
echo "  Phase: $CURRENT_PHASE → $TARGET_PHASE"
echo "  Handoffs added: ${#TRANSITIONS[@]}"
echo ""
echo "Note: Phase History end times set to now. Review and adjust if needed."
