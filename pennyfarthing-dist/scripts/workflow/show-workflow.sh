#!/bin/bash
# Show workflow details
# Usage: .pennyfarthing/scripts/core/run.sh workflow/show-workflow.sh [name]
#    or: Invoked with PROJECT_ROOT already set
#
# If no name provided, shows current session's workflow
# If name provided, shows that workflow's details

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

# Get workflow name from argument or session
WORKFLOW_NAME="${1:-}"

if [[ -z "$WORKFLOW_NAME" ]]; then
  # Try to get from current session (exclude archive directory)
  SESSION_FILE=$(find "$SESSION_DIR" -maxdepth 1 -name "*-session.md" 2>/dev/null | head -1)
  if [[ -n "$SESSION_FILE" ]]; then
    # Extract workflow from session file (look for **Workflow:** line)
    WORKFLOW_NAME=$(grep -E "^\*\*Workflow:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //' | tr -d ' ' || echo "")
    if [[ -z "$WORKFLOW_NAME" ]]; then
      # Try alternate format (Workflow: value in tracking section)
      WORKFLOW_NAME=$(grep -E "^Workflow:" "$SESSION_FILE" 2>/dev/null | head -1 | cut -d: -f2 | tr -d ' ' || echo "")
    fi
  fi

  if [[ -z "$WORKFLOW_NAME" ]]; then
    echo "# Current Workflow"
    echo ""
    echo "No active session found. Showing default workflow (tdd)."
    echo ""
    WORKFLOW_NAME="tdd"
  else
    echo "# Current Session Workflow: $WORKFLOW_NAME"
    echo ""
  fi
else
  echo "# Workflow: $WORKFLOW_NAME"
  echo ""
fi

WORKFLOW_FILE="$WORKFLOWS_DIR/${WORKFLOW_NAME}.yaml"

if [[ ! -f "$WORKFLOW_FILE" ]]; then
  echo "Error: Workflow '$WORKFLOW_NAME' not found"
  echo ""
  echo "Available workflows:"
  for f in "$WORKFLOWS_DIR"/*.yaml; do
    [[ -f "$f" ]] || continue
    basename "$f" .yaml
  done
  exit 1
fi

# Extract workflow details
DESC=$(yq eval '.workflow.description' "$WORKFLOW_FILE")
VERSION=$(yq eval '.workflow.version' "$WORKFLOW_FILE")

echo "**Description:** $DESC"
echo "**Version:** $VERSION"
echo ""

# Show phases as a flow diagram
echo "## Phase Flow"
echo ""
echo -n "\`\`\`"
echo ""

# Build phase flow string
PHASES=""
yq eval '.workflow.phases[].name' "$WORKFLOW_FILE" | while read -r phase; do
  if [[ -n "$PHASES" ]]; then
    echo -n " -> "
  fi
  echo -n "$phase"
  PHASES="$phase"
done
echo ""
echo "\`\`\`"
echo ""

# Show phases table
echo "## Phases"
echo ""
echo "| Phase | Agent | Gate |"
echo "|-------|-------|------|"

yq eval '.workflow.phases[] | .name + "|" + .agent + "|" + (.gate.type // "none")' "$WORKFLOW_FILE" | while IFS='|' read -r phase agent gate; do
  echo "| $phase | $agent | $gate |"
done

echo ""

# Show triggers
echo "## Triggers"
echo ""

TYPES=$(yq eval '.workflow.triggers.types // []' "$WORKFLOW_FILE")
if [[ "$TYPES" != "[]" && "$TYPES" != "null" ]]; then
  echo "**Types:** $(yq eval '.workflow.triggers.types | join(", ")' "$WORKFLOW_FILE")"
fi

POINTS_MIN=$(yq eval '.workflow.triggers.points.min // ""' "$WORKFLOW_FILE")
POINTS_MAX=$(yq eval '.workflow.triggers.points.max // ""' "$WORKFLOW_FILE")

if [[ -n "$POINTS_MIN" && "$POINTS_MIN" != "null" ]]; then
  echo "**Points Min:** $POINTS_MIN"
fi
if [[ -n "$POINTS_MAX" && "$POINTS_MAX" != "null" ]]; then
  echo "**Points Max:** $POINTS_MAX"
fi

IS_DEFAULT=$(yq eval '.workflow.triggers.default // false' "$WORKFLOW_FILE")
if [[ "$IS_DEFAULT" == "true" ]]; then
  echo "**Default:** yes (used when no other workflow matches)"
fi

TAGS=$(yq eval '.workflow.triggers.tags // []' "$WORKFLOW_FILE")
if [[ "$TAGS" != "[]" && "$TAGS" != "null" ]]; then
  echo "**Tags:** $(yq eval '.workflow.triggers.tags | join(", ")' "$WORKFLOW_FILE")"
fi
