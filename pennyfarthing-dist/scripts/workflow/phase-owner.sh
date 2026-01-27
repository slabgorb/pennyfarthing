#!/bin/bash
# Get the agent that owns a phase in a workflow
# Usage: phase-owner.sh <workflow> <phase>
# Returns: agent name (e.g., "dev", "tea", "reviewer", "sm")

set -euo pipefail

WORKFLOW="${1:-}"
PHASE="${2:-}"

if [[ -z "$WORKFLOW" || -z "$PHASE" ]]; then
  echo "Usage: phase-owner.sh <workflow> <phase>" >&2
  exit 1
fi

# Find project root
if [[ -z "${PROJECT_ROOT:-}" ]]; then
  d="$PWD"
  while [[ ! -d "$d/.pennyfarthing" ]] && [[ "$d" != "/" ]]; do
    d="$(dirname "$d")"
  done
  PROJECT_ROOT="$d"
fi

WORKFLOW_FILE="$PROJECT_ROOT/pennyfarthing-dist/workflows/${WORKFLOW}.yaml"

if [[ ! -f "$WORKFLOW_FILE" ]]; then
  echo "Error: Workflow '$WORKFLOW' not found" >&2
  exit 1
fi

# Query the agent for this phase
AGENT=$(yq eval ".workflow.phases[] | select(.name == \"$PHASE\") | .agent" "$WORKFLOW_FILE" 2>/dev/null)

if [[ -z "$AGENT" || "$AGENT" == "null" ]]; then
  echo "Error: Phase '$PHASE' not found in workflow '$WORKFLOW'" >&2
  exit 1
fi

echo "$AGENT"
