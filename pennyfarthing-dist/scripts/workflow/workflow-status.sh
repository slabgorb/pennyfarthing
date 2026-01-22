#!/bin/bash
# Show current stepped workflow progress
# Usage: .pennyfarthing/scripts/core/run.sh workflow/workflow-status.sh [name]
#
# If no name provided, shows status of active workflow session

set -euo pipefail

# PROJECT_ROOT should be set by run.sh, but find it if not
if [[ -z "${PROJECT_ROOT:-}" ]]; then
  d="$PWD"
  while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do
    d="$(dirname "$d")"
  done
  PROJECT_ROOT="$d"
fi

WORKFLOWS_DIR="$PROJECT_ROOT/pennyfarthing-dist/workflows"
SESSION_DIR="$PROJECT_ROOT/.session"

if ! command -v yq &> /dev/null; then
  echo "Error: yq is required but not installed"
  echo "Install with: brew install yq"
  exit 1
fi

WORKFLOW_NAME="${1:-}"

# If no name, try to detect from session
if [[ -z "$WORKFLOW_NAME" ]]; then
  SESSION_FILE=$(find "$SESSION_DIR" -maxdepth 1 -name "*-workflow-session.md" 2>/dev/null | head -1)

  if [[ -z "$SESSION_FILE" ]]; then
    echo "# Workflow Status"
    echo ""
    echo "No active workflow session found."
    echo ""
    echo "Use \`/workflow start <name>\` to begin a new workflow."
    exit 0
  fi

  WORKFLOW_NAME=$(grep -E "^\*\*Workflow:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/\*\*Workflow:\*\* //' | tr -d ' ')

  if [[ -z "$WORKFLOW_NAME" ]]; then
    WORKFLOW_NAME=$(basename "$SESSION_FILE" | sed 's/-workflow-session.md//')
  fi
else
  SESSION_FILE="$SESSION_DIR/${WORKFLOW_NAME}-workflow-session.md"
fi

if [[ ! -f "$SESSION_FILE" ]]; then
  echo "# Workflow Status: $WORKFLOW_NAME"
  echo ""
  echo "No session found for workflow '$WORKFLOW_NAME'"
  echo ""
  echo "Use \`/workflow start $WORKFLOW_NAME\` to begin."
  exit 0
fi

# Find workflow file
WORKFLOW_FILE=""
if [[ -f "$WORKFLOWS_DIR/${WORKFLOW_NAME}.yaml" ]]; then
  WORKFLOW_FILE="$WORKFLOWS_DIR/${WORKFLOW_NAME}.yaml"
elif [[ -f "$WORKFLOWS_DIR/${WORKFLOW_NAME}/workflow.yaml" ]]; then
  WORKFLOW_FILE="$WORKFLOWS_DIR/${WORKFLOW_NAME}/workflow.yaml"
fi

WORKFLOW_DIR=$(dirname "$WORKFLOW_FILE")

# Parse session state
CURRENT_STEP=$(grep -E "^\- \*\*Current Step:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //' || echo "1")
MODE=$(grep -E "^\- \*\*Mode:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //' || echo "create")
STATUS=$(grep -E "^\- \*\*Status:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //' || echo "in_progress")
STARTED=$(grep -E "^\- \*\*Started:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //' || echo "-")
LAST_UPDATED=$(grep -E "^\- \*\*Last Updated:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //' || echo "-")
STEPS_COMPLETED=$(grep -E "^\- \*\*Steps Completed:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //' || echo "[]")
NOTES=$(grep -E "^\- \*\*Notes:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //' || echo "-")

# Get total steps from workflow
if [[ -n "$WORKFLOW_FILE" && -f "$WORKFLOW_FILE" ]]; then
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

  STEP_COUNT=$(find "$STEPS_PATH" -maxdepth 1 -name "step-0*.md" -o -name "step-1*.md" 2>/dev/null | wc -l | tr -d ' ')
  WORKFLOW_DESC=$(yq eval '.workflow.description' "$WORKFLOW_FILE" | head -1)
else
  STEP_COUNT="?"
  WORKFLOW_DESC="-"
fi

# Calculate completion percentage
COMPLETED_COUNT=$(echo "$STEPS_COMPLETED" | tr -cd ',' | wc -c | tr -d ' ')
if [[ "$STEPS_COMPLETED" != "[]" && -n "$STEPS_COMPLETED" ]]; then
  COMPLETED_COUNT=$((COMPLETED_COUNT + 1))
fi

if [[ "$STEP_COUNT" != "?" && "$STEP_COUNT" -gt 0 ]]; then
  COMPLETION_PCT=$((COMPLETED_COUNT * 100 / STEP_COUNT))
else
  COMPLETION_PCT=0
fi

# Build progress bar
BAR_WIDTH=20
if [[ "$STEP_COUNT" != "?" && "$STEP_COUNT" -gt 0 ]]; then
  FILLED=$((COMPLETION_PCT * BAR_WIDTH / 100))
  EMPTY=$((BAR_WIDTH - FILLED))
  PROGRESS_BAR=$(printf '%*s' "$FILLED" '' | tr ' ' '#')$(printf '%*s' "$EMPTY" '' | tr ' ' '-')
else
  PROGRESS_BAR=$(printf '%*s' "$BAR_WIDTH" '' | tr ' ' '?')
fi

# Status indicator
case "$STATUS" in
  completed)
    STATUS_ICON="[COMPLETE]"
    ;;
  paused)
    STATUS_ICON="[PAUSED]"
    ;;
  *)
    STATUS_ICON="[IN PROGRESS]"
    ;;
esac

# Output status
echo "# Workflow Status: $WORKFLOW_NAME"
echo ""
echo "**Description:** $WORKFLOW_DESC"
echo ""
echo "## Progress"
echo ""
echo "\`\`\`"
echo "[$PROGRESS_BAR] $COMPLETION_PCT%"
echo "\`\`\`"
echo ""
echo "| Field | Value |"
echo "|-------|-------|"
echo "| Status | $STATUS_ICON |"
echo "| Mode | $MODE |"
echo "| Current Step | $CURRENT_STEP of $STEP_COUNT |"
echo "| Completed | $COMPLETED_COUNT steps |"
echo "| Steps Done | $STEPS_COMPLETED |"
echo "| Started | $STARTED |"
echo "| Last Updated | $LAST_UPDATED |"
if [[ "$NOTES" != "-" ]]; then
  echo "| Notes | $NOTES |"
fi
echo ""
echo "**Session:** $SESSION_FILE"
echo ""

if [[ "$STATUS" != "completed" ]]; then
  echo "**Next:** Use \`/workflow resume\` to continue from step $CURRENT_STEP"
fi
