#!/bin/bash
# Sync an epic and its stories to Jira
# Usage: .pennyfarthing/scripts/core/run.sh sync-epic-jira.sh <epic-id> [--dry-run] [--transition] [--points] [--all]
#
# Example: .pennyfarthing/scripts/core/run.sh sync-epic-jira.sh MSSCI-11952
# Example: .pennyfarthing/scripts/core/run.sh sync-epic-jira.sh MSSCI-11952 --all
#
# This script syncs status and story points from sprint YAML to Jira.
# It wraps the existing jira-sync.mjs for better integration with /sprint skill.

set -euo pipefail

EPIC_ID="${1:-}"

if [[ -z "$EPIC_ID" ]]; then
  echo "Usage: sync-epic-jira.sh <epic-id> [options]"
  echo ""
  echo "Syncs an epic and its stories from sprint YAML to Jira."
  echo ""
  echo "Options:"
  echo "  --dry-run      Show what would be done without making changes"
  echo "  --transition   Transition Jira issues to match sprint YAML status"
  echo "  --points       Sync story points from sprint YAML to Jira"
  echo "  --all          Equivalent to --transition --points"
  echo ""
  echo "Examples:"
  echo "  sync-epic-jira.sh MSSCI-11952              # Show sync status"
  echo "  sync-epic-jira.sh MSSCI-11952 --dry-run    # Preview changes"
  echo "  sync-epic-jira.sh MSSCI-11952 --all        # Sync status and points"
  exit 1
fi

# PROJECT_ROOT should be set by run.sh, but find it if not
if [[ -z "${PROJECT_ROOT:-}" ]]; then
  d="$PWD"
  while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do
    d="$(dirname "$d")"
  done
  PROJECT_ROOT="$d"
fi

SPRINT_FILE="$PROJECT_ROOT/sprint/current-sprint.yaml"

if [[ ! -f "$SPRINT_FILE" ]]; then
  echo "Error: Sprint file not found at $SPRINT_FILE"
  exit 1
fi

if ! command -v yq &> /dev/null; then
  echo "Error: yq is required but not installed"
  echo "Install with: brew install yq"
  exit 1
fi

# Check if epic exists in sprint YAML
EPIC_EXISTS=$(yq ".epics[] | select(.id == \"$EPIC_ID\") | .id" "$SPRINT_FILE" 2>/dev/null || echo "")

if [[ -z "$EPIC_EXISTS" ]]; then
  echo "Error: Epic $EPIC_ID not found in $SPRINT_FILE"
  echo ""
  echo "Available epics:"
  yq '.epics[].id' "$SPRINT_FILE" 2>/dev/null || echo "  None found"
  exit 1
fi

# Extract epic number for jira-sync.mjs compatibility
# jira-sync.mjs expects epic number (e.g., 35) not full ID
# But it also accepts Jira keys directly
# Let's check if this is a Jira key (MSSCI-XXXXX) or local ID

# Pass through to jira-sync.mjs with remaining arguments
JIRA_SYNC_SCRIPT="$PROJECT_ROOT/.pennyfarthing/scripts/utils/jira/jira-sync.mjs"

if [[ ! -f "$JIRA_SYNC_SCRIPT" ]]; then
  # Try alternate location
  JIRA_SYNC_SCRIPT="$PROJECT_ROOT/pennyfarthing-dist/scripts/utils/jira/jira-sync.mjs"
fi

if [[ ! -f "$JIRA_SYNC_SCRIPT" ]]; then
  echo "Error: jira-sync.mjs not found"
  exit 1
fi

# Build arguments for jira-sync.mjs
shift  # Remove epic-id from arguments
SYNC_ARGS=("$EPIC_ID")

# Handle --all flag
for arg in "$@"; do
  case "$arg" in
    --all)
      SYNC_ARGS+=("--transition" "--points")
      ;;
    *)
      SYNC_ARGS+=("$arg")
      ;;
  esac
done

echo "Syncing epic $EPIC_ID to Jira..."
echo ""

# Run jira-sync.mjs
exec node "$JIRA_SYNC_SCRIPT" "${SYNC_ARGS[@]}"
