#!/bin/bash
# Resume a stepped workflow from last completed step
# Usage: .pennyfarthing/scripts/core/run.sh workflow/resume-workflow.sh [name]
#
# If no name provided, detects from active session

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
  # Look for workflow session files
  SESSION_FILE=$(find "$SESSION_DIR" -maxdepth 1 -name "*-workflow-session.md" 2>/dev/null | head -1)

  if [[ -z "$SESSION_FILE" ]]; then
    echo "# Resume Stepped Workflow"
    echo ""
    echo "No active workflow session found."
    echo ""
    echo "Use \`/workflow start <name>\` to begin a new workflow."
    exit 1
  fi

  # Extract workflow name from session
  WORKFLOW_NAME=$(grep -E "^\*\*Workflow:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/\*\*Workflow:\*\* //' | tr -d ' ')

  if [[ -z "$WORKFLOW_NAME" ]]; then
    # Try extracting from filename
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

# Check if workflow is complete
if [[ "$STATUS" == "completed" ]]; then
  echo "# Workflow Complete: $WORKFLOW_NAME"
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

# Count steps
STEP_COUNT=$(find "$STEPS_PATH" -maxdepth 1 -name "step-0*.md" -o -name "step-1*.md" 2>/dev/null | wc -l | tr -d ' ')

# Find the current step file
# Handle various naming: step-01.md, step-01-name.md, step-1-name.md
PADDED_STEP=$(printf "%02d" "$CURRENT_STEP")
STEP_FILE=$(find "$STEPS_PATH" -maxdepth 1 \( -name "step-${PADDED_STEP}*.md" -o -name "step-${CURRENT_STEP}-*.md" \) 2>/dev/null | sort | head -1)

if [[ -z "$STEP_FILE" ]]; then
  echo "Error: Could not find step $CURRENT_STEP file in $STEPS_PATH"
  exit 1
fi

# Update last updated timestamp
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
sed -i '' "s/^\- \*\*Last Updated:\*\*.*/- **Last Updated:** $NOW/" "$SESSION_FILE" 2>/dev/null || true

# Calculate completion percentage
COMPLETED_COUNT=$(echo "$STEPS_COMPLETED" | tr -cd ',' | wc -c | tr -d ' ')
if [[ "$STEPS_COMPLETED" != "[]" ]]; then
  COMPLETED_COUNT=$((COMPLETED_COUNT + 1))
fi
if [[ "$STEP_COUNT" -gt 0 ]]; then
  COMPLETION_PCT=$((COMPLETED_COUNT * 100 / STEP_COUNT))
else
  COMPLETION_PCT=0
fi

# Output resume info
echo "# Resuming Workflow: $WORKFLOW_NAME"
echo ""
echo "**Mode:** $MODE"
echo "**Progress:** Step $CURRENT_STEP of $STEP_COUNT ($COMPLETION_PCT% complete)"
echo "**Steps Completed:** $STEPS_COMPLETED"
echo "**Session:** $SESSION_FILE"
echo ""
echo "---"
echo ""
echo "## Step $CURRENT_STEP of $STEP_COUNT"
echo ""

# Output step content (strip frontmatter if present)
if head -1 "$STEP_FILE" | grep -q "^---$"; then
  awk '/^---$/{if(++c==2){p=1;next}}p' "$STEP_FILE"
else
  cat "$STEP_FILE"
fi

echo ""
echo "---"
echo ""
echo "**Controls:**"
echo "- \`C\` - Continue to next step"
echo "- \`/workflow status\` - Check progress"
