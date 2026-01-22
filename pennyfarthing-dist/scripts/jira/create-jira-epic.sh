#!/bin/bash
# Create a Jira epic and its child stories from sprint YAML
# Usage: .pennyfarthing/scripts/core/run.sh create-jira-epic.sh <epic-id> [--dry-run]

set -euo pipefail

EPIC_ID="${1:-}"
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
  esac
done

if [[ -z "$EPIC_ID" ]]; then
  echo "Usage: create-jira-epic.sh <epic-id> [--dry-run]"
  exit 1
fi

# Find project root
if [[ -z "${PROJECT_ROOT:-}" ]]; then
  d="$PWD"
  while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do
    d="$(dirname "$d")"
  done
  PROJECT_ROOT="$d"
fi

SPRINT_FILE="$PROJECT_ROOT/sprint/current-sprint.yaml"
SCRIPTS_DIR="$PROJECT_ROOT/.pennyfarthing/scripts"
JIRA_PROJECT="${JIRA_PROJECT_KEY:-MSSCI}"
PROJECT_LABEL="${PROJECT_LABEL:-${PROJECT_NAME:-pennyfarthing}}"

# Find epic (by id or jira key)
EPIC_DATA=$(yq -o json ".epics[] | select(.id == \"$EPIC_ID\" or .jira == \"$EPIC_ID\")" "$SPRINT_FILE" 2>/dev/null || echo "")

if [[ -z "$EPIC_DATA" || "$EPIC_DATA" == "null" ]]; then
  echo "Error: Epic $EPIC_ID not found"
  yq '.epics[].id' "$SPRINT_FILE" 2>/dev/null
  exit 1
fi

EPIC_TITLE=$(echo "$EPIC_DATA" | yq -r '.title // "Unknown"' | sed 's/^Epic: //')
EPIC_JIRA=$(echo "$EPIC_DATA" | yq -r '.jira // ""')

echo ""
echo "Epic: $EPIC_TITLE"
echo "Dry run: $DRY_RUN"
echo ""

# Create epic if needed
if [[ -n "$EPIC_JIRA" && "$EPIC_JIRA" != "null" ]]; then
  echo "Epic already exists: $EPIC_JIRA"
  JIRA_EPIC_KEY="$EPIC_JIRA"
else
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY RUN] Would create epic: $EPIC_TITLE"
    JIRA_EPIC_KEY="MSSCI-XXXXX"
  else
    EPIC_DESCRIPTION=$(echo "$EPIC_DATA" | yq -r '.description // ""')
    EPIC_OUTPUT=$(echo "" | jira issue create \
      --project "$JIRA_PROJECT" \
      --type Epic \
      --summary "$EPIC_TITLE" \
      --body "$EPIC_DESCRIPTION" \
      --label "$PROJECT_LABEL" \
      --no-input 2>&1) || {
        echo "Error: $EPIC_OUTPUT"
        exit 1
      }

    JIRA_EPIC_KEY=$(echo "$EPIC_OUTPUT" | grep -oE 'MSSCI-[0-9]+' | head -1)
    echo "Created epic: $JIRA_EPIC_KEY"

    yq eval -i "(.epics[] | select(.id == \"$EPIC_ID\")).jira = \"$JIRA_EPIC_KEY\"" "$SPRINT_FILE"
  fi
fi

echo ""
echo "Creating stories..."
echo ""

# Get story IDs that need Jira keys
STORY_IDS=$(yq -r "(.epics[] | select(.jira == \"$JIRA_EPIC_KEY\" or .id == \"$EPIC_ID\")).stories[] | select(.jira == null or .jira == \"\") | .id" "$SPRINT_FILE" 2>/dev/null || echo "")

if [[ -z "$STORY_IDS" ]]; then
  echo "All stories already have Jira keys"
else
  for STORY_ID in $STORY_IDS; do
    if [[ "$DRY_RUN" == "true" ]]; then
      TITLE=$(yq -r "(.epics[] | select(.jira == \"$JIRA_EPIC_KEY\" or .id == \"$EPIC_ID\")).stories[] | select(.id == \"$STORY_ID\") | .title" "$SPRINT_FILE")
      echo "[DRY RUN] Would create: $STORY_ID - $TITLE"
    else
      "$SCRIPTS_DIR/create-jira-story.sh" "$JIRA_EPIC_KEY" "$STORY_ID"
    fi
  done
fi

echo ""
echo "Done. View epic: jira issue view $JIRA_EPIC_KEY"
