#!/usr/bin/env bash
#
# generate-skill-docs.sh - Generate SKILLS.md from skill-registry.yaml
#
# Usage: generate-skill-docs.sh [options]
#
# Options:
#   --registry <path>   Path to skill-registry.yaml
#   --output <path>     Path to write output (default: docs/SKILLS.md)
#   --dry-run           Print output instead of writing file
#   --help, -h          Show this help
#
# Examples:
#   generate-skill-docs.sh
#   generate-skill-docs.sh --dry-run
#   generate-skill-docs.sh --registry ./custom-registry.yaml

set -euo pipefail

# Find project root
# Priority 1: .pennyfarthing/ (orchestrator/consumer repos)
# Priority 2: pennyfarthing-dist/ (framework repo itself)
find_project_root() {
  local dir="$PWD"
  # First try .pennyfarthing/
  while [[ ! -d "$dir/.pennyfarthing" ]] && [[ "$dir" != "/" ]]; do
    dir="$(dirname "$dir")"
  done
  if [[ -d "$dir/.pennyfarthing" ]]; then
    echo "$dir"
    return
  fi
  # Fall back to pennyfarthing-dist/ for framework repo
  dir="$PWD"
  while [[ ! -d "$dir/pennyfarthing-dist" ]] && [[ "$dir" != "/" ]]; do
    dir="$(dirname "$dir")"
  done
  if [[ -d "$dir/pennyfarthing-dist" ]]; then
    echo "$dir"
    return
  fi
  echo ""
}

PROJECT_ROOT="$(find_project_root)"
if [[ -z "$PROJECT_ROOT" ]]; then
  echo "Error: Cannot find project root (no .pennyfarthing or pennyfarthing-dist directory found)" >&2
  exit 1
fi

# Default paths
REGISTRY_PATH="${PROJECT_ROOT}/pennyfarthing-dist/skills/skill-registry.yaml"
OUTPUT_PATH="${PROJECT_ROOT}/docs/SKILLS.md"
DRY_RUN=false

# Parse arguments
show_help() {
  cat <<EOF
Usage: generate-skill-docs.sh [options]

Generate SKILLS.md documentation from skill-registry.yaml.

Options:
  --registry <path>   Path to skill-registry.yaml (default: pennyfarthing-dist/skills/skill-registry.yaml)
  --output <path>     Path to write output (default: docs/SKILLS.md)
  --dry-run           Print output instead of writing file
  --help, -h          Show this help

Examples:
  generate-skill-docs.sh
  generate-skill-docs.sh --dry-run
  generate-skill-docs.sh --registry ./custom-registry.yaml --output ./SKILLS.md
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      show_help
      exit 0
      ;;
    --registry)
      REGISTRY_PATH="$2"
      shift 2
      ;;
    --output)
      OUTPUT_PATH="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Use --help for usage information" >&2
      exit 1
      ;;
  esac
done

# Check registry exists
if [[ ! -f "$REGISTRY_PATH" ]]; then
  echo "Error: Registry not found: $REGISTRY_PATH" >&2
  exit 1
fi

# Build the TypeScript module if needed
DIST_FILE="${PROJECT_ROOT}/packages/shared/dist/generate-skill-docs.js"
if [[ ! -f "$DIST_FILE" ]]; then
  echo "Building shared package..." >&2
  (cd "${PROJECT_ROOT}/packages/shared" && npm run build) >&2
fi

# Run the generator
if $DRY_RUN; then
  node "$DIST_FILE" --registry "$REGISTRY_PATH" --dry-run
else
  # Ensure output directory exists
  mkdir -p "$(dirname "$OUTPUT_PATH")"
  node "$DIST_FILE" --registry "$REGISTRY_PATH" --output "$OUTPUT_PATH"
fi
