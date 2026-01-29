#!/bin/bash
# Jira vs YAML Reconciliation Report
# Usage: .pennyfarthing/scripts/core/run.sh jira/jira-reconcile.sh [--fix]
#
# Compares sprint YAML against Jira to find:
# - Status mismatches
# - Missing Jira keys
# - Orphan issues (in Jira but not YAML)
# - Sprint membership discrepancies
#
# Options:
#   --fix    Apply recommended fixes automatically (where safe)

set -euo pipefail

# PROJECT_ROOT should be set by run.sh, but find it if not
if [[ -z "${PROJECT_ROOT:-}" ]]; then
  d="$PWD"
  while [[ ! -d "$d/.pennyfarthing" ]] && [[ "$d" != "/" ]]; do
    d="$(dirname "$d")"
  done
  PROJECT_ROOT="$d"
fi

SPRINT_FILE="$PROJECT_ROOT/sprint/current-sprint.yaml"
FIX_MODE="${1:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check dependencies
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

if [[ ! -f "$SPRINT_FILE" ]]; then
  echo "Error: Sprint file not found at $SPRINT_FILE"
  exit 1
fi

# Get sprint info
SPRINT_NAME=$(yq eval '.sprint.name' "$SPRINT_FILE")
SPRINT_ID=$(yq eval '.sprint.jira_sprint_id' "$SPRINT_FILE")

echo "# Jira vs YAML Reconciliation Report"
echo ""
echo "**Sprint:** $SPRINT_NAME (Jira Sprint ID: $SPRINT_ID)"
echo "**Generated:** $(date '+%Y-%m-%d %H:%M')"
echo ""

# Track issues
STATUS_MISMATCHES=()
MISSING_JIRA=()
ORPHAN_ISSUES=()
NOT_IN_SPRINT=()

echo "## Checking YAML Stories Against Jira..."
echo ""

# Extract all stories from YAML and check against Jira
while IFS=$'\t' read -r yaml_id jira_key yaml_status title; do
  # Skip if no jira key
  if [[ "$jira_key" == "null" ]] || [[ -z "$jira_key" ]]; then
    MISSING_JIRA+=("$yaml_id|$title|$yaml_status")
    continue
  fi

  # Get Jira status - use sed to remove the key prefix
  jira_status=$(jira issue list --jql "project=MSSCI AND key=$jira_key" --plain --columns key,status --no-headers 2>/dev/null | sed "s/^$jira_key[[:space:]]*//" | xargs || echo "NOT_FOUND")

  if [[ "$jira_status" == "NOT_FOUND" ]] || [[ -z "$jira_status" ]]; then
    echo -e "${RED}[!]${NC} $jira_key not found in Jira"
    continue
  fi

  # Normalize statuses for comparison
  jira_norm=$(echo "$jira_status" | tr '[:upper:]' '[:lower:]' | tr ' ' '_')

  # Check for mismatches
  mismatch=false
  case "$yaml_status" in
    done)
      [[ "$jira_norm" != "done" ]] && mismatch=true
      ;;
    ready|backlog)
      [[ "$jira_norm" != "to_do" ]] && mismatch=true
      ;;
    in_progress)
      [[ "$jira_norm" != "in_progress" ]] && mismatch=true
      ;;
  esac

  if [[ "$mismatch" == "true" ]]; then
    STATUS_MISMATCHES+=("$jira_key|$yaml_status|$jira_status")
  fi
done < <(yq -r '.epics[].stories[]? | [.id, .jira, .status, .title] | @tsv' "$SPRINT_FILE" 2>/dev/null)

echo ""
echo "## Checking Jira Sprint Against YAML..."
echo ""

# Get all issues in the Jira sprint and check if they're in YAML
# Skip canceled issues - they're not relevant
while read -r jira_key; do
  # Check if in YAML (by id or jira field)
  in_yaml=$(yq -r ".epics[].stories[]? | select(.id == \"$jira_key\" or .jira == \"$jira_key\") | .id" "$SPRINT_FILE" 2>/dev/null | head -1)

  if [[ -z "$in_yaml" ]]; then
    # Get more info about the orphan
    status=$(jira issue list --jql "project=MSSCI AND key=$jira_key" --plain --columns key,status --no-headers 2>/dev/null | sed "s/^$jira_key[[:space:]]*//" | xargs || echo "Unknown")

    # Skip canceled issues
    if [[ "$status" == "Canceled" ]]; then
      continue
    fi

    summary=$(jira issue list --jql "project=MSSCI AND key=$jira_key" --plain --columns key,summary --no-headers 2>/dev/null | sed "s/^$jira_key[[:space:]]*//" | xargs || echo "Unknown")
    ORPHAN_ISSUES+=("$jira_key|$status|$summary")
  fi
done < <(jira issue list --jql "project=MSSCI AND labels=pennyfarthing AND sprint=$SPRINT_ID AND status != Canceled" --plain --columns key --no-headers 2>/dev/null)

echo ""
echo "## Checking for Issues Not in Sprint..."
echo ""

# Get done issues not in sprint
while read -r jira_key; do
  # Check if it should be in current sprint (exists in YAML)
  in_yaml=$(yq -r ".epics[].stories[]? | select(.id == \"$jira_key\" or .jira == \"$jira_key\") | .id" "$SPRINT_FILE" 2>/dev/null | head -1)

  if [[ -n "$in_yaml" ]]; then
    summary=$(jira issue list --jql "project=MSSCI AND key=$jira_key" --plain --columns summary --no-headers 2>/dev/null | xargs || echo "Unknown")
    NOT_IN_SPRINT+=("$jira_key|$summary")
  fi
done < <(jira issue list --jql "project=MSSCI AND labels=pennyfarthing AND sprint is EMPTY AND status != Canceled" --plain --columns key --no-headers 2>/dev/null)

# Output Report
echo ""
echo "---"
echo ""
echo "# Summary"
echo ""

# Status Mismatches
echo "## Status Mismatches (${#STATUS_MISMATCHES[@]})"
echo ""
if [[ ${#STATUS_MISMATCHES[@]} -eq 0 ]]; then
  echo -e "${GREEN}No status mismatches found.${NC}"
else
  echo "| Jira Key | YAML Status | Jira Status | Action |"
  echo "|----------|-------------|-------------|--------|"
  for item in "${STATUS_MISMATCHES[@]}"; do
    IFS='|' read -r key yaml jira <<< "$item"
    echo "| $key | $yaml | $jira | Update YAML or Jira |"
  done
fi
echo ""

# Missing Jira Keys
echo "## YAML Stories Missing Jira Key (${#MISSING_JIRA[@]})"
echo ""
if [[ ${#MISSING_JIRA[@]} -eq 0 ]]; then
  echo -e "${GREEN}All YAML stories have Jira keys.${NC}"
else
  echo "| YAML ID | Title | Status | Action |"
  echo "|---------|-------|--------|--------|"
  for item in "${MISSING_JIRA[@]}"; do
    IFS='|' read -r id title status <<< "$item"
    echo "| $id | ${title:0:40} | $status | Create Jira issue |"
  done
fi
echo ""

# Orphan Issues
echo "## Jira Issues Not in YAML (${#ORPHAN_ISSUES[@]})"
echo ""
if [[ ${#ORPHAN_ISSUES[@]} -eq 0 ]]; then
  echo -e "${GREEN}All sprint issues are tracked in YAML.${NC}"
else
  echo "| Jira Key | Status | Summary | Action |"
  echo "|----------|--------|---------|--------|"
  for item in "${ORPHAN_ISSUES[@]}"; do
    IFS='|' read -r key status summary <<< "$item"
    if [[ "$status" == "Done" ]]; then
      echo "| $key | $status | ${summary:0:40} | Info: Completed (not in current YAML) |"
    else
      echo "| $key | $status | ${summary:0:40} | Add to YAML or remove from sprint |"
    fi
  done
  echo ""
  echo "*Note: Done issues not in YAML are historical - they count toward sprint velocity but aren't actively tracked.*"
fi
echo ""

# Not in Sprint
echo "## YAML Stories Not in Jira Sprint (${#NOT_IN_SPRINT[@]})"
echo ""
if [[ ${#NOT_IN_SPRINT[@]} -eq 0 ]]; then
  echo -e "${GREEN}All YAML stories are in Jira sprint.${NC}"
else
  echo "| Jira Key | Summary | Action |"
  echo "|----------|---------|--------|"
  for item in "${NOT_IN_SPRINT[@]}"; do
    IFS='|' read -r key summary <<< "$item"
    echo "| $key | ${summary:0:50} | Add to sprint $SPRINT_ID |"
  done
fi
echo ""

# Epic check
echo "## Epic Sync Check"
echo ""
echo "| YAML Epic ID | Jira Field | Status |"
echo "|--------------|------------|--------|"
while IFS=$'\t' read -r epic_id jira_key title; do
  if [[ "$jira_key" == "null" ]] || [[ -z "$jira_key" ]]; then
    echo -e "| $epic_id | ${RED}MISSING${NC} | $title |"
  else
    echo "| $epic_id | $jira_key | $title |"
  fi
done < <(yq -r '.epics[] | [.id, .jira, .title] | @tsv' "$SPRINT_FILE" 2>/dev/null)
echo ""

# Total counts
total_issues=$((${#STATUS_MISMATCHES[@]} + ${#MISSING_JIRA[@]} + ${#ORPHAN_ISSUES[@]} + ${#NOT_IN_SPRINT[@]}))

echo "---"
echo ""
if [[ $total_issues -eq 0 ]]; then
  echo -e "${GREEN}Sync Status: CLEAN${NC} - No discrepancies found!"
else
  echo -e "${YELLOW}Sync Status: $total_issues issue(s) found${NC}"
  echo ""
  echo "Run with --fix to apply automatic fixes where possible."
fi

# Fix mode
if [[ "$FIX_MODE" == "--fix" ]]; then
  echo ""
  echo "## Applying Fixes..."
  echo ""

  # Add stories to sprint
  for item in "${NOT_IN_SPRINT[@]}"; do
    IFS='|' read -r key summary <<< "$item"
    echo "Adding $key to sprint $SPRINT_ID..."
    jira sprint add "$SPRINT_ID" "$key" 2>/dev/null && echo "  Done" || echo "  Failed"
  done

  echo ""
  echo "Fix mode completed. Manual review still needed for:"
  echo "- Status mismatches (requires decision on which source is correct)"
  echo "- Missing Jira keys (requires creating new issues)"
  echo "- Orphan issues (requires adding to YAML or removing from sprint)"
fi
