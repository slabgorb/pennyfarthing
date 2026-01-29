#!/bin/bash
# List all available workflows with type indicators
# Usage: .pennyfarthing/scripts/core/run.sh workflow/list-workflows.sh
#    or: Invoked with PROJECT_ROOT already set
#
# MSSCI-12083: Added type, steps, and modes columns

set -euo pipefail

# PROJECT_ROOT should be set by run.sh, but find it if not
if [[ -z "${PROJECT_ROOT:-}" ]]; then
  d="$PWD"
  while [[ ! -d "$d/.pennyfarthing" ]] && [[ "$d" != "/" ]]; do
    d="$(dirname "$d")"
  done
  PROJECT_ROOT="$d"
fi

WORKFLOWS_DIR="$PROJECT_ROOT/.pennyfarthing/workflows"

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
echo "| Workflow | Type | Default | Steps/Phases | Modes | Description |"
echo "|----------|------|---------|--------------|-------|-------------|"

# Find all workflow YAML files: top-level *.yaml and subdirectory workflow.yaml files
workflow_files=()
while IFS= read -r -d '' f; do
  workflow_files+=("$f")
done < <(find -L "$WORKFLOWS_DIR" -maxdepth 1 -name "*.yaml" -print0 2>/dev/null)
while IFS= read -r -d '' f; do
  workflow_files+=("$f")
done < <(find -L "$WORKFLOWS_DIR" -mindepth 2 -name "workflow.yaml" -print0 2>/dev/null)

# Exit early if no workflows found
if [[ ${#workflow_files[@]} -eq 0 ]]; then
  echo "No workflows found in $WORKFLOWS_DIR"
  exit 0
fi

# Sort by workflow name for consistent output
IFS=$'\n' sorted_files=($(printf '%s\n' "${workflow_files[@]}" | sort))
unset IFS

for f in "${sorted_files[@]}"; do
  [[ -f "$f" ]] || continue

  name=$(yq eval '.workflow.name' "$f")
  desc=$(yq eval '.workflow.description' "$f" | head -1)
  is_default=$(yq eval '.workflow.triggers.default // false' "$f")

  # Detect workflow type (stepped, phased, or procedural)
  # Stepped workflows have .workflow.type == "stepped" or .workflow.steps
  # Procedural workflows have .workflow.type == "procedural" (BMAD reference workflows)
  workflow_type=$(yq eval '.workflow.type // "phased"' "$f")
  has_steps=$(yq eval '.workflow.steps != null' "$f")

  if [[ "$has_steps" == "true" ]] || [[ "$workflow_type" == "stepped" ]]; then
    type_col="stepped"
    # Count step files if steps.path is defined
    steps_path=$(yq eval '.workflow.steps.path // ""' "$f")
    steps_pattern=$(yq eval '.workflow.steps.pattern // "step-*.md"' "$f")
    # Resolve steps_path relative to the workflow file's directory
    workflow_dir=$(dirname "$f")
    if [[ -n "$steps_path" ]]; then
      # Handle relative paths (./steps/ or steps/)
      if [[ "$steps_path" == ./* ]]; then
        resolved_path="$workflow_dir/${steps_path#./}"
      elif [[ "$steps_path" != /* ]]; then
        resolved_path="$workflow_dir/$steps_path"
      else
        resolved_path="$steps_path"
      fi
      if [[ -d "$resolved_path" ]]; then
        step_count=$(find "$resolved_path" -maxdepth 1 -name "step-*.md" 2>/dev/null | wc -l | tr -d ' ')
        steps_col="${step_count} steps"
      else
        steps_col="-"
      fi
    else
      steps_col="-"
    fi
  elif [[ "$workflow_type" == "procedural" ]]; then
    type_col="procedural"
    # Procedural workflows use instructions.md instead of phases/steps
    steps_col="instructions"
  else
    type_col="phased"
    # Count phases for phased workflows
    phase_count=$(yq eval '.workflow.phases | length' "$f")
    steps_col="${phase_count} phases"
  fi

  # Default column
  if [[ "$is_default" == "true" ]]; then
    default_col="yes"
  else
    default_col="no"
  fi

  # Modes column (for tri-modal workflows)
  modes=$(yq eval '.workflow.modes.available // []' "$f")
  if [[ "$modes" != "[]" ]] && [[ "$modes" != "null" ]]; then
    # Format as comma-separated list
    modes_col=$(yq eval '.workflow.modes.available | join(",")' "$f")
  else
    modes_col="-"
  fi

  echo "| $name | $type_col | $default_col | $steps_col | $modes_col | $desc |"
done

echo ""
echo "**Legend:**"
echo "- **phased**: Agent-driven workflow (SM → TEA → Dev → Reviewer)"
echo "- **stepped**: Step-by-step guided workflow with progressive disclosure"
echo "- **procedural**: BMAD reference workflow with instructions file"
echo ""
echo "Use \`/workflow show <name>\` for workflow details."
