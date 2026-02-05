#!/bin/bash
# Complete the current step of a stepped workflow
# Usage: .pennyfarthing/scripts/workflow/complete-step.sh [name] [--step N]
#
# Advances session state: increments current step, updates steps completed,
# recalculates completion percentage, and marks workflow as completed when
# all steps are done.
#
# If no name provided, detects from active session.
# If --step N provided, completes that specific step instead of current step.

set -euo pipefail

# Find project root
source "$(dirname "${BASH_SOURCE[0]}")/../lib/find-root.sh"

WORKFLOWS_DIR="$PROJECT_ROOT/.pennyfarthing/workflows"
SESSION_DIR="$PROJECT_ROOT/.session"

if ! command -v yq &> /dev/null; then
  echo "Error: yq is required but not installed"
  echo "Install with: brew install yq"
  exit 1
fi

# Parse arguments
WORKFLOW_NAME=""
STEP_OVERRIDE=""
ARGS=("$@")

i=0
while [[ $i -lt ${#ARGS[@]} ]]; do
  arg="${ARGS[$i]}"
  case "$arg" in
    --step=*)
      STEP_OVERRIDE="${arg#--step=}"
      ;;
    --step)
      if [[ $((i+1)) -lt ${#ARGS[@]} ]]; then
        ((i++))
        STEP_OVERRIDE="${ARGS[$i]}"
      else
        echo "Error: --step requires a value"
        exit 1
      fi
      ;;
    -*)
      echo "Error: Unknown option: $arg"
      echo "Usage: complete-step.sh [name] [--step N]"
      exit 1
      ;;
    *)
      if [[ -z "$WORKFLOW_NAME" ]]; then
        WORKFLOW_NAME="$arg"
      else
        echo "Error: Unexpected argument: $arg"
        exit 1
      fi
      ;;
  esac
  ((i++))
done

# If no name, try to detect from session
if [[ -z "$WORKFLOW_NAME" ]]; then
  SESSION_FILE=$(find "$SESSION_DIR" -maxdepth 1 -name "*-workflow-session.md" 2>/dev/null | head -1)

  if [[ -z "$SESSION_FILE" ]]; then
    echo "Error: No active workflow session found."
    echo ""
    echo "Usage: complete-step.sh [name] [--step N]"
    exit 1
  fi

  WORKFLOW_NAME=$(grep -E "^\*\*Workflow:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/\*\*Workflow:\*\* //' | tr -d ' ')

  if [[ -z "$WORKFLOW_NAME" ]]; then
    WORKFLOW_NAME=$(basename "$SESSION_FILE" | sed 's/-workflow-session.md//')
  fi
else
  SESSION_FILE="$SESSION_DIR/${WORKFLOW_NAME}-workflow-session.md"
fi

if [[ ! -f "$SESSION_FILE" ]]; then
  echo "Error: No session found for workflow '$WORKFLOW_NAME'"
  echo ""
  echo "Use \`/workflow start $WORKFLOW_NAME\` to begin."
  exit 1
fi

# Find workflow file
WORKFLOW_FILE=""
if [[ -f "$WORKFLOWS_DIR/${WORKFLOW_NAME}.yaml" ]]; then
  WORKFLOW_FILE="$WORKFLOWS_DIR/${WORKFLOW_NAME}.yaml"
elif [[ -f "$WORKFLOWS_DIR/${WORKFLOW_NAME}/workflow.yaml" ]]; then
  WORKFLOW_FILE="$WORKFLOWS_DIR/${WORKFLOW_NAME}/workflow.yaml"
else
  echo "Error: Workflow definition '$WORKFLOW_NAME' not found"
  exit 1
fi

WORKFLOW_DIR=$(dirname "$WORKFLOW_FILE")

# Parse session state
CURRENT_STEP=$(grep -E "^\- \*\*Current Step:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //' || echo "1")
MODE=$(grep -E "^\- \*\*Mode:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //' || echo "create")
STATUS=$(grep -E "^\- \*\*Status:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //' || echo "in_progress")
STEPS_COMPLETED=$(grep -E "^\- \*\*Steps Completed:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //' || echo "[]")

# Check if workflow is already completed
if [[ "$STATUS" == "completed" ]]; then
  echo "# Workflow Already Completed: $WORKFLOW_NAME"
  echo ""
  echo "This workflow has already been completed."
  echo ""
  echo "To start a new session, delete the session file:"
  echo "\`\`\`bash"
  echo "rm \"$SESSION_FILE\""
  echo "\`\`\`"
  echo ""
  echo "Then run \`/workflow start $WORKFLOW_NAME\`"
  exit 0
fi

# Determine which step to complete
COMPLETING_STEP="${STEP_OVERRIDE:-$CURRENT_STEP}"

# Resolve steps path based on mode
MODE_PATH=$(yq eval ".workflow.modes.$MODE // \"\"" "$WORKFLOW_FILE")
if [[ -n "$MODE_PATH" && "$MODE_PATH" != "null" ]]; then
  STEPS_PATH="$MODE_PATH"
else
  STEPS_PATH=$(yq eval '.workflow.steps.path' "$WORKFLOW_FILE")
fi

# Resolve relative path
if [[ "$STEPS_PATH" == ./* ]]; then
  STEPS_PATH="$WORKFLOW_DIR/${STEPS_PATH#./}"
elif [[ "$STEPS_PATH" != /* ]]; then
  STEPS_PATH="$PROJECT_ROOT/$STEPS_PATH"
fi

# Count total steps
STEP_COUNT=$(find "$STEPS_PATH" -maxdepth 1 -name "step-0*.md" -o -name "step-1*.md" 2>/dev/null | wc -l | tr -d ' ')

# Update Steps Completed array
# Parse existing array, add completing step if not already present
if [[ "$STEPS_COMPLETED" == "[]" ]]; then
  NEW_STEPS_COMPLETED="[$COMPLETING_STEP]"
else
  # Check if step is already in the array
  if echo "$STEPS_COMPLETED" | grep -qE "(^|\[|, )${COMPLETING_STEP}(,|\]| |$)"; then
    # Already completed, keep as-is
    NEW_STEPS_COMPLETED="$STEPS_COMPLETED"
  else
    # Add to array - remove trailing ], add new step, close bracket
    NEW_STEPS_COMPLETED=$(echo "$STEPS_COMPLETED" | sed "s/\]/, $COMPLETING_STEP]/")
  fi
fi

# Calculate new current step
NEXT_STEP=$((COMPLETING_STEP + 1))

# Count completed steps for percentage
COMPLETED_COUNT=$(echo "$NEW_STEPS_COMPLETED" | tr -cd ',' | wc -c | tr -d ' ')
if [[ "$NEW_STEPS_COMPLETED" != "[]" ]]; then
  COMPLETED_COUNT=$((COMPLETED_COUNT + 1))
fi

# Calculate completion percentage
if [[ "$STEP_COUNT" -gt 0 ]]; then
  COMPLETION_PCT=$((COMPLETED_COUNT * 100 / STEP_COUNT))
else
  COMPLETION_PCT=0
fi

# Determine new status
if [[ "$COMPLETED_COUNT" -ge "$STEP_COUNT" ]]; then
  NEW_STATUS="completed"
else
  NEW_STATUS="in_progress"
fi

# Update timestamp
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Update session file — Workflow State section
sed -i '' "s/^\- \*\*Current Step:\*\*.*/- **Current Step:** $NEXT_STEP/" "$SESSION_FILE"
sed -i '' "s/^\- \*\*Steps Completed:\*\*.*/- **Steps Completed:** $NEW_STEPS_COMPLETED/" "$SESSION_FILE"
sed -i '' "s/^\- \*\*Last Updated:\*\*.*/- **Last Updated:** $NOW/" "$SESSION_FILE"
sed -i '' "s/^\- \*\*Status:\*\*.*/- **Status:** $NEW_STATUS/" "$SESSION_FILE"

# Update Progress section
sed -i '' "s/^- Completion:.*/- Completion: ${COMPLETION_PCT}%/" "$SESSION_FILE"

# Output result
if [[ "$NEW_STATUS" == "completed" ]]; then
  echo "# Workflow Complete: $WORKFLOW_NAME"
  echo ""
  echo "All $STEP_COUNT steps completed!"
  echo ""
  echo "**Final Progress:** $COMPLETION_PCT%"
  echo "**Steps Completed:** $NEW_STEPS_COMPLETED"
  echo ""
  echo "Session updated: $SESSION_FILE"
else
  echo "# Step $COMPLETING_STEP Complete"
  echo ""
  echo "**Progress:** Step $NEXT_STEP of $STEP_COUNT ($COMPLETION_PCT% complete)"
  echo "**Steps Completed:** $NEW_STEPS_COMPLETED"
  echo ""
  echo "---"
  echo ""
  echo "## Step $NEXT_STEP of $STEP_COUNT"
  echo ""

  # Find and output next step file
  PADDED_STEP=$(printf "%02d" "$NEXT_STEP")
  NEXT_STEP_FILE=$(find "$STEPS_PATH" -maxdepth 1 \( -name "step-${PADDED_STEP}*.md" -o -name "step-${NEXT_STEP}-*.md" \) 2>/dev/null | sort | head -1)

  if [[ -n "$NEXT_STEP_FILE" ]]; then
    # Output step content (strip frontmatter if present)
    if head -1 "$NEXT_STEP_FILE" | grep -q "^---$"; then
      awk '/^---$/{if(++c==2){p=1;next}}p' "$NEXT_STEP_FILE"
    else
      cat "$NEXT_STEP_FILE"
    fi
  fi

  echo ""
  echo "---"
  echo ""
  echo "**Controls:**"
  echo "- \`C\` - Continue to next step"
  echo "- \`/workflow status\` - Check progress"
fi
