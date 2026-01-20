#!/bin/bash
# Create a Jira epic and its child stories from sprint YAML
# Usage: .pennyfarthing/scripts/run.sh create-jira-epic.sh <epic-id> [--dry-run]
#
# Example: .pennyfarthing/scripts/run.sh create-jira-epic.sh MSSCI-11952
# Example: .pennyfarthing/scripts/run.sh create-jira-epic.sh epic-41 --dry-run
#
# Prerequisites:
#   - jira installed: brew install ankitpokhrel/jira/jira
#   - jira configured: jira init
#   - JIRA_API_TOKEN environment variable set

set -euo pipefail

EPIC_ID="${1:-}"
DRY_RUN=false

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      ;;
  esac
done

if [[ -z "$EPIC_ID" ]]; then
  echo "Usage: create-jira-epic.sh <epic-id> [--dry-run]"
  echo ""
  echo "Creates a Jira epic and its child stories from sprint YAML."
  echo "The epic-id can be a local ID (e.g., epic-41) or Jira key (e.g., MSSCI-11952)."
  echo ""
  echo "Options:"
  echo "  --dry-run    Show what would be created without making changes"
  echo ""
  echo "Example:"
  echo "  create-jira-epic.sh MSSCI-11952"
  echo "  create-jira-epic.sh epic-41 --dry-run"
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

if ! command -v jira &> /dev/null; then
  echo "Error: jira CLI is required but not installed"
  echo "Install with: brew install ankitpokhrel/jira/jira"
  exit 1
fi

# Configuration
JIRA_PROJECT="${JIRA_PROJECT_KEY:-MSSCI}"
PROJECT_LABEL="${PROJECT_LABEL:-${PROJECT_NAME:-pennyfarthing}}"

# Find the epic in current-sprint.yaml
EPIC_DATA=$(yq -o json ".epics[] | select(.id == \"$EPIC_ID\")" "$SPRINT_FILE" 2>/dev/null || echo "")

if [[ -z "$EPIC_DATA" || "$EPIC_DATA" == "null" ]]; then
  echo "Error: Epic $EPIC_ID not found in $SPRINT_FILE"
  echo ""
  echo "Available epics:"
  yq '.epics[].id' "$SPRINT_FILE" 2>/dev/null || echo "  None found"
  exit 1
fi

# Extract epic fields
EPIC_TITLE=$(echo "$EPIC_DATA" | yq -r '.title // "Unknown"' | sed 's/^Epic: //')
EPIC_DESCRIPTION=$(echo "$EPIC_DATA" | yq -r '.description // ""')
EPIC_JIRA=$(echo "$EPIC_DATA" | yq -r '.jira // ""')
STORY_COUNT=$(echo "$EPIC_DATA" | yq '[.stories[]] | length')

echo ""
echo "Epic to create in Jira:"
echo "  Local ID: $EPIC_ID"
echo "  Title: $EPIC_TITLE"
echo "  Stories: $STORY_COUNT"
if [[ -n "$EPIC_JIRA" && "$EPIC_JIRA" != "null" ]]; then
  echo "  Existing Jira: $EPIC_JIRA"
fi
echo "  Dry run: $DRY_RUN"
echo ""

# Check if epic already has a Jira key
if [[ -n "$EPIC_JIRA" && "$EPIC_JIRA" != "null" ]]; then
  echo "Epic already has Jira key: $EPIC_JIRA"
  echo "Proceeding to create/update child stories..."
  echo ""
  JIRA_EPIC_KEY="$EPIC_JIRA"
else
  # Create the epic in Jira
  echo "Creating Jira epic..."

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY RUN] Would create epic:"
    echo "  jira issue create --project $JIRA_PROJECT --type Epic --summary \"$EPIC_TITLE\" --label $PROJECT_LABEL --no-input"
    JIRA_EPIC_KEY="MSSCI-XXXXX"
  else
    # Create epic and capture the key from output
    EPIC_OUTPUT=$(echo "" | jira issue create \
      --project "$JIRA_PROJECT" \
      --type Epic \
      --summary "$EPIC_TITLE" \
      --body "$EPIC_DESCRIPTION" \
      --label "$PROJECT_LABEL" \
      --no-input 2>&1) || {
        echo "Error creating epic: $EPIC_OUTPUT"
        exit 1
      }

    # Extract Jira key from output (format: "Issue created: MSSCI-XXXXX")
    JIRA_EPIC_KEY=$(echo "$EPIC_OUTPUT" | grep -oE 'MSSCI-[0-9]+' | head -1)

    if [[ -z "$JIRA_EPIC_KEY" ]]; then
      echo "Error: Could not extract Jira key from output: $EPIC_OUTPUT"
      exit 1
    fi

    echo "Created epic: $JIRA_EPIC_KEY"

    # Update sprint YAML with Jira key
    yq eval -i "(.epics[] | select(.id == \"$EPIC_ID\")).jira = \"$JIRA_EPIC_KEY\"" "$SPRINT_FILE"
    echo "Updated $SPRINT_FILE with jira: $JIRA_EPIC_KEY"
  fi
fi

echo ""
echo "Creating child stories..."
echo ""

# Get sprint ID for adding stories to sprint
SPRINT_JIRA_ID=$(yq '.sprint.jira_id' "$SPRINT_FILE" 2>/dev/null || echo "")

# Create each story
STORY_INDEX=0
while IFS= read -r STORY_JSON; do
  if [[ -z "$STORY_JSON" || "$STORY_JSON" == "null" ]]; then
    continue
  fi

  STORY_ID=$(echo "$STORY_JSON" | yq -r '.id // ""')
  STORY_TITLE=$(echo "$STORY_JSON" | yq -r '.title // "Untitled"')
  STORY_DESCRIPTION=$(echo "$STORY_JSON" | yq -r '.description // ""')
  STORY_POINTS=$(echo "$STORY_JSON" | yq -r '.points // 0')
  STORY_PRIORITY=$(echo "$STORY_JSON" | yq -r '.priority // "P2"')
  STORY_JIRA=$(echo "$STORY_JSON" | yq -r '.jira // ""')

  # Map priority to Jira priority
  case "$STORY_PRIORITY" in
    P0) JIRA_PRIORITY="Highest" ;;
    P1) JIRA_PRIORITY="High" ;;
    P2) JIRA_PRIORITY="Medium" ;;
    P3) JIRA_PRIORITY="Low" ;;
    *) JIRA_PRIORITY="Medium" ;;
  esac

  echo "[$((STORY_INDEX + 1))/$STORY_COUNT] $STORY_ID: $STORY_TITLE"

  # Check if story already has Jira key
  if [[ -n "$STORY_JIRA" && "$STORY_JIRA" != "null" ]]; then
    echo "  Already has Jira key: $STORY_JIRA (skipping)"
    echo ""
    ((STORY_INDEX++))
    continue
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [DRY RUN] Would create story with parent $JIRA_EPIC_KEY"
    echo "  Points: $STORY_POINTS, Priority: $JIRA_PRIORITY"
    STORY_JIRA_KEY="MSSCI-YYYYY"
  else
    # Create story with parent link to epic
    STORY_OUTPUT=$(echo "" | jira issue create \
      --project "$JIRA_PROJECT" \
      --type Story \
      --summary "$STORY_TITLE" \
      --body "$STORY_DESCRIPTION" \
      --parent "$JIRA_EPIC_KEY" \
      --priority "$JIRA_PRIORITY" \
      --label "$PROJECT_LABEL" \
      --no-input 2>&1) || {
        echo "  Error creating story: $STORY_OUTPUT"
        ((STORY_INDEX++))
        continue
      }

    STORY_JIRA_KEY=$(echo "$STORY_OUTPUT" | grep -oE 'MSSCI-[0-9]+' | head -1)

    if [[ -z "$STORY_JIRA_KEY" ]]; then
      echo "  Error: Could not extract Jira key from output"
      ((STORY_INDEX++))
      continue
    fi

    echo "  Created: $STORY_JIRA_KEY"

    # Update story points if non-zero (customfield_10031 is story points)
    if [[ "$STORY_POINTS" -gt 0 ]]; then
      jira issue edit "$STORY_JIRA_KEY" --custom "customfield_10031=$STORY_POINTS" --no-input 2>/dev/null || true
    fi

    # Add to sprint if sprint ID is set
    if [[ -n "$SPRINT_JIRA_ID" && "$SPRINT_JIRA_ID" != "null" ]]; then
      jira sprint add "$SPRINT_JIRA_ID" "$STORY_JIRA_KEY" 2>/dev/null || true
    fi

    # Update sprint YAML - set both id and jira to the Jira key
    yq eval -i "(.epics[] | select(.id == \"$EPIC_ID\")).stories[$STORY_INDEX].id = \"$STORY_JIRA_KEY\"" "$SPRINT_FILE"
    yq eval -i "(.epics[] | select(.id == \"$EPIC_ID\")).stories[$STORY_INDEX].jira = \"$STORY_JIRA_KEY\"" "$SPRINT_FILE"
  fi

  echo ""
  ((STORY_INDEX++))
done < <(echo "$EPIC_DATA" | yq -o json -I0 '.stories[]')

echo ""
echo "Summary:"
echo "  Epic: $JIRA_EPIC_KEY"
echo "  Stories processed: $STORY_INDEX"
if [[ "$DRY_RUN" == "true" ]]; then
  echo "  Mode: DRY RUN (no changes made)"
else
  echo "  Sprint YAML updated with Jira keys"
fi
echo ""
echo "View epic in Jira:"
echo "  jira issue view $JIRA_EPIC_KEY"
