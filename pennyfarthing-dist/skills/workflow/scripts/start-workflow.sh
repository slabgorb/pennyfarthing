#!/bin/bash
# Start a stepped workflow
# Usage: .pennyfarthing/scripts/core/run.sh workflow/start-workflow.sh <name> [--mode create|validate|edit]
#
# Creates a new workflow session and loads step 1.
# For tri-modal workflows, --mode selects the step path (default: create)

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

# Parse arguments
WORKFLOW_NAME=""
MODE=""
ARGS=("$@")

i=0
while [[ $i -lt ${#ARGS[@]} ]]; do
  arg="${ARGS[$i]}"
  case "$arg" in
    --mode=*)
      MODE="${arg#--mode=}"
      ;;
    --mode|-m)
      if [[ $((i+1)) -lt ${#ARGS[@]} ]]; then
        ((i++))
        MODE="${ARGS[$i]}"
      else
        echo "Error: --mode requires a value (create, validate, or edit)"
        exit 1
      fi
      ;;
    -*)
      echo "Error: Unknown option: $arg"
      echo "Usage: start-workflow.sh <name> [--mode create|validate|edit]"
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

if [[ -z "$WORKFLOW_NAME" ]]; then
  echo "# Start Stepped Workflow"
  echo ""
  echo "Usage: /workflow start <name> [--mode create|validate|edit]"
  echo ""
  echo "**Available stepped workflows:**"
  echo ""
  for f in "$WORKFLOWS_DIR"/*.yaml "$WORKFLOWS_DIR"/*/workflow.yaml; do
    [[ -f "$f" ]] || continue
    workflow_type=$(yq eval '.workflow.type // "phased"' "$f")
    if [[ "$workflow_type" == "stepped" ]]; then
      name=$(yq eval '.workflow.name' "$f")
      desc=$(yq eval '.workflow.description' "$f" | head -1 | cut -c1-60)
      echo "- **$name** - $desc"
    fi
  done
  exit 1
fi

# Find workflow file (support both flat and directory structure)
WORKFLOW_FILE=""
if [[ -f "$WORKFLOWS_DIR/${WORKFLOW_NAME}.yaml" ]]; then
  WORKFLOW_FILE="$WORKFLOWS_DIR/${WORKFLOW_NAME}.yaml"
elif [[ -f "$WORKFLOWS_DIR/${WORKFLOW_NAME}/workflow.yaml" ]]; then
  WORKFLOW_FILE="$WORKFLOWS_DIR/${WORKFLOW_NAME}/workflow.yaml"
else
  echo "Error: Workflow '$WORKFLOW_NAME' not found"
  echo ""
  echo "Looked in:"
  echo "  $WORKFLOWS_DIR/${WORKFLOW_NAME}.yaml"
  echo "  $WORKFLOWS_DIR/${WORKFLOW_NAME}/workflow.yaml"
  exit 1
fi

WORKFLOW_DIR=$(dirname "$WORKFLOW_FILE")

# Validate it's a stepped workflow
WORKFLOW_TYPE=$(yq eval '.workflow.type // "phased"' "$WORKFLOW_FILE")
if [[ "$WORKFLOW_TYPE" != "stepped" ]]; then
  echo "Error: '$WORKFLOW_NAME' is a phased workflow, not stepped"
  echo "Use TDD workflow commands (/sm, /tea, /dev, /reviewer) for phased workflows"
  exit 1
fi

# Validate mode if provided
if [[ -n "$MODE" ]]; then
  case "$MODE" in
    create|validate|edit)
      ;;
    *)
      echo "Error: Invalid mode '$MODE'. Must be one of: create, validate, edit"
      exit 1
      ;;
  esac
fi

# Get workflow info
WORKFLOW_DESC=$(yq eval '.workflow.description' "$WORKFLOW_FILE")
WORKFLOW_AGENT=$(yq eval '.workflow.agent // "pm"' "$WORKFLOW_FILE")

# Resolve steps path based on mode
if [[ -n "$MODE" ]]; then
  MODE_PATH=$(yq eval ".workflow.modes.$MODE // \"\"" "$WORKFLOW_FILE")
  if [[ -z "$MODE_PATH" || "$MODE_PATH" == "null" ]]; then
    AVAILABLE_MODES=$(yq eval '.workflow.modes | keys | .[]' "$WORKFLOW_FILE" 2>/dev/null | grep -v default | tr '\n' ', ' | sed 's/,$//')
    echo "Error: Mode '$MODE' not available for workflow '$WORKFLOW_NAME'"
    echo "Available modes: $AVAILABLE_MODES"
    exit 1
  fi
  STEPS_PATH="$MODE_PATH"
else
  # Use default mode or steps.path
  DEFAULT_MODE=$(yq eval '.workflow.modes.default // ""' "$WORKFLOW_FILE")
  if [[ -n "$DEFAULT_MODE" && "$DEFAULT_MODE" != "null" ]]; then
    MODE_PATH=$(yq eval ".workflow.modes.$DEFAULT_MODE // \"\"" "$WORKFLOW_FILE")
    if [[ -n "$MODE_PATH" && "$MODE_PATH" != "null" ]]; then
      STEPS_PATH="$MODE_PATH"
      MODE="$DEFAULT_MODE"
    fi
  fi

  if [[ -z "${STEPS_PATH:-}" ]]; then
    STEPS_PATH=$(yq eval '.workflow.steps.path' "$WORKFLOW_FILE")
    MODE="${MODE:-create}"
  fi
fi

# Resolve relative path
if [[ "$STEPS_PATH" == ./* ]]; then
  STEPS_PATH="$WORKFLOW_DIR/${STEPS_PATH#./}"
elif [[ "$STEPS_PATH" != /* ]]; then
  STEPS_PATH="$PROJECT_ROOT/$STEPS_PATH"
fi

# Count steps
STEPS_PATTERN=$(yq eval '.workflow.steps.pattern // "step-*.md"' "$WORKFLOW_FILE")
STEP_COUNT=$(find "$STEPS_PATH" -maxdepth 1 -name "step-0*.md" -o -name "step-1*.md" 2>/dev/null | wc -l | tr -d ' ')

if [[ "$STEP_COUNT" -eq 0 ]]; then
  echo "Error: No step files found in $STEPS_PATH"
  exit 1
fi

# Create session directory
mkdir -p "$SESSION_DIR"

# Generate session filename
SESSION_FILE="$SESSION_DIR/${WORKFLOW_NAME}-workflow-session.md"

# Check for existing session
if [[ -f "$SESSION_FILE" ]]; then
  echo "**Warning:** Existing session found"
  echo ""
  echo "Session: $SESSION_FILE"
  echo ""
  echo "Options:"
  echo "1. Use \`/workflow resume $WORKFLOW_NAME\` to continue"
  echo "2. Delete the session file to start fresh"
  echo ""
  echo "To start fresh, run:"
  echo "\`\`\`bash"
  echo "rm \"$SESSION_FILE\""
  echo "\`\`\`"
  exit 0
fi

# Create initial session file
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > "$SESSION_FILE" << EOF
# Workflow Session: $WORKFLOW_NAME

**Workflow:** $WORKFLOW_NAME
**Type:** stepped
**Agent:** $WORKFLOW_AGENT
**Started:** $NOW

## Workflow State
- **Workflow Name:** $WORKFLOW_NAME
- **Type:** stepped
- **Mode:** $MODE
- **Started:** $NOW
- **Last Updated:** $NOW
- **Current Step:** 1
- **Steps Completed:** []
- **Status:** in_progress
- **Notes:** Session created via /workflow start

## Progress
- Total Steps: $STEP_COUNT
- Completion: 0%

---

EOF

# Find step 1 file (handle various naming patterns)
STEP_FILE=$(find "$STEPS_PATH" -maxdepth 1 \( -name "step-01*.md" -o -name "step-1-*.md" \) 2>/dev/null | sort | head -1)

if [[ -z "$STEP_FILE" ]]; then
  echo "Error: Could not find step 1 file in $STEPS_PATH"
  exit 1
fi

# Output workflow start info
echo "# Starting Workflow: $WORKFLOW_NAME"
echo ""
echo "**Description:** $WORKFLOW_DESC"
echo "**Mode:** $MODE"
echo "**Steps:** $STEP_COUNT"
echo "**Agent:** $WORKFLOW_AGENT"
echo "**Session:** $SESSION_FILE"
echo ""

# Check if auto-handoff is enabled (turbo mode)
CONFIG_FILE="$PROJECT_ROOT/.pennyfarthing/config.local.yaml"
HANDOFF_MODE="manual"
if [[ -f "$CONFIG_FILE" ]]; then
  HANDOFF_MODE=$(yq eval '.workflow.handoff_mode // "manual"' "$CONFIG_FILE")
fi

# Emit Reflector directive - auto-invoke if in turbo mode, else show button
if [[ "$HANDOFF_MODE" == "auto" ]]; then
  echo "**Auto-handoff enabled.** Invoking /$WORKFLOW_AGENT agent..."
  echo ""
  echo "<!-- CYCLIST:INVOKE:/$WORKFLOW_AGENT -->"
else
  echo "<!-- CYCLIST:HANDOFF:/$WORKFLOW_AGENT -->"
fi
echo ""
echo "---"
echo ""
echo "## Step 1 of $STEP_COUNT"
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
echo "- \`/workflow resume\` - Resume after break"
