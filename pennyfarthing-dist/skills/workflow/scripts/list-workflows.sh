#!/bin/bash
# List all available workflows
# Usage: .pennyfarthing/scripts/run.sh list-workflows.sh
#    or: Invoked with PROJECT_ROOT already set

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

if [[ ! -d "$WORKFLOWS_DIR" ]]; then
  echo "Error: Workflows directory not found at $WORKFLOWS_DIR"
  exit 1
fi

if ! command -v yq &> /dev/null; then
  echo "Error: yq is required but not installed"
  echo "Install with: brew install yq"
  exit 1
fi

echo "# Available Workflows"
echo ""
echo "| Workflow | Default | Description |"
echo "|----------|---------|-------------|"

for f in "$WORKFLOWS_DIR"/*.yaml; do
  [[ -f "$f" ]] || continue

  name=$(yq eval '.workflow.name' "$f")
  desc=$(yq eval '.workflow.description' "$f" | head -1)
  is_default=$(yq eval '.workflow.triggers.default // false' "$f")

  if [[ "$is_default" == "true" ]]; then
    default_col="yes"
  else
    default_col="no"
  fi

  echo "| $name | $default_col | $desc |"
done

echo ""
echo "Use \`/workflow show <name>\` for workflow details."
