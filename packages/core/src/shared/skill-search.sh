#!/usr/bin/env bash
# Skill Search Shell Wrapper - Story 9-2
#
# Thin wrapper around the TypeScript skill-search utility.
# Provides CLI access to skill registry search functionality.
#
# Usage:
#   skill-search.sh [options]
#
# Options:
#   --tag <tag>        Filter by tag (e.g., "tdd", "quality")
#   --keyword <kw>     Filter by keyword (e.g., "jest", "vitest")
#   --query <text>     Search description text
#   --category <cat>   Filter by category
#   --json             Output as JSON (default: table)
#   --help, -h         Show this help
#
# Examples:
#   skill-search.sh --tag tdd
#   skill-search.sh --category development --json
#   skill-search.sh --query "TDD workflow"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Find the compiled JavaScript file
JS_FILE="$SCRIPT_DIR/../dist/skill-search.js"

if [[ ! -f "$JS_FILE" ]]; then
  # Try looking relative to where we are in the repo
  JS_FILE="$(dirname "$SCRIPT_DIR")/dist/skill-search.js"
fi

if [[ ! -f "$JS_FILE" ]]; then
  echo "Error: skill-search.js not found. Run 'npm run build' first." >&2
  exit 1
fi

# Execute the Node.js script with all arguments
exec node "$JS_FILE" "$@"
