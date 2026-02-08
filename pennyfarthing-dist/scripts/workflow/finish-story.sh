#!/bin/bash
# Finish a story: archive, merge PR, transition Jira, update sprint YAML
# Usage: finish-story.sh <story-id> [--dry-run]
#
# Example: finish-story.sh MSSCI-12052
#          finish-story.sh MSSCI-12052 --dry-run
#
# Prerequisites:
# - Session file exists at .session/{story-id}-session.md
# - PR is approved and mergeable
# - Reviewer has approved (phase: finish in session)
#
# This script performs:
# 1. Archive session file to sprint/archive/{jira-key}-session.md
# 2. Squash merge PR and delete remote branch
# 3. Transition Jira to Done
# 4. Update sprint YAML (status: done, completed date)
# 5. Archive completed epics (if last story in epic was just finished)
# 6. Clean up local branch and session file

set -euo pipefail

STORY_ID="${1:-}"
DRY_RUN=false

# Parse options
for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
  esac
done

if [[ -z "$STORY_ID" ]]; then
  echo "Usage: finish-story.sh <story-id> [--dry-run]"
  echo ""
  echo "Options:"
  echo "  --dry-run    Show what would be done without executing"
  exit 1
fi

# Find project root
source "$(dirname "${BASH_SOURCE[0]}")/../lib/find-root.sh"

SESSION_FILE="$PROJECT_ROOT/.session/${STORY_ID}-session.md"
SPRINT_FILE="$PROJECT_ROOT/sprint/current-sprint.yaml"
ARCHIVE_DIR="$PROJECT_ROOT/sprint/archive"

# Ensure archive directory exists
mkdir -p "$ARCHIVE_DIR"

# Validate session file exists
if [[ ! -f "$SESSION_FILE" ]]; then
  echo "Error: Session file not found: $SESSION_FILE"
  exit 1
fi

# Extract metadata from session file (handle both "**Jira:**" and "- **Jira:**" formats)
# Also handle markdown link format: [MSSCI-12721](https://...)
JIRA_KEY=$(grep -E '\*\*Jira:\*\*' "$SESSION_FILE" | sed 's/.*\*\*Jira:\*\* //' | sed 's/\[//' | sed 's/\].*//' | tr -d ' ' || echo "")
# Extract branch - strip any trailing annotations like "(pushed)"
BRANCH=$(grep -E '\*\*Branch:\*\*' "$SESSION_FILE" | sed 's/.*\*\*Branch:\*\* //' | sed 's/ *(.*//' | tr -d ' ' || echo "")

# Try to get PR number from session file first (format: **PR:** #422 - title)
PR_NUMBER=$(grep -E '\*\*PR:\*\*' "$SESSION_FILE" | sed 's/.*#\([0-9]*\).*/\1/' || echo "")

# Fallback: try to get Jira key from sprint YAML if not in session
if [[ -z "$JIRA_KEY" || "$JIRA_KEY" == "null" ]]; then
  JIRA_KEY=$(yq ".epics[].stories[] | select(.id == \"$STORY_ID\") | .jira // \"\"" "$SPRINT_FILE" 2>/dev/null | head -1 || echo "")
fi

if [[ -z "$JIRA_KEY" || "$JIRA_KEY" == "null" ]]; then
  echo "Error: Could not determine Jira key for story $STORY_ID"
  echo "Check session file or sprint YAML for jira: field"
  exit 1
fi

# Fallback: get PR number from GitHub if not in session file
if [[ -z "$PR_NUMBER" ]] && [[ -n "$BRANCH" ]]; then
  PR_NUMBER=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null || echo "")
fi

TODAY=$(date +%Y-%m-%d)

echo "=== Finish Story: $STORY_ID ==="
echo "Jira Key: $JIRA_KEY"
echo "Branch: ${BRANCH:-none}"
echo "PR: ${PR_NUMBER:-none}"
echo ""

if $DRY_RUN; then
  echo "[DRY RUN] Would perform:"
  echo "  1. Archive session → $ARCHIVE_DIR/${JIRA_KEY}-session.md"
  if [[ -n "$PR_NUMBER" ]]; then
    echo "  2. Merge PR #$PR_NUMBER (squash, delete branch)"
  else
    echo "  2. No PR to merge"
  fi
  echo "  3. Transition $JIRA_KEY to Done"
  echo "  4. Update sprint YAML (status: done, completed: $TODAY)"
  echo "  5. Archive any completed epics"
  echo "  6. Delete local branch: $BRANCH"
  echo "  7. Remove session file"
  exit 0
fi

# Step 1: Archive session file
echo "1. Archiving session file..."
cp "$SESSION_FILE" "$ARCHIVE_DIR/${JIRA_KEY}-session.md"
echo "   → $ARCHIVE_DIR/${JIRA_KEY}-session.md"

# Step 2: Merge PR (if exists)
if [[ -n "$PR_NUMBER" ]]; then
  echo "2. Merging PR #$PR_NUMBER..."
  gh pr merge "$PR_NUMBER" --squash --delete-branch || {
    echo "   Warning: PR merge failed (may already be merged)"
  }
else
  echo "2. No PR found for branch $BRANCH (skipping merge)"
fi

# Step 3: Transition Jira to Done
echo "3. Transitioning Jira to Done..."
jira issue move "$JIRA_KEY" "Done" 2>/dev/null || {
  echo "   Warning: Jira transition failed (may already be Done)"
}

# Step 4: Update sprint YAML
echo "4. Updating sprint YAML..."
# Update status to done
yq eval -i "(.epics[].stories[] | select(.id == \"$STORY_ID\")).status = \"done\"" "$SPRINT_FILE"
# Add completed date
yq eval -i "(.epics[].stories[] | select(.id == \"$STORY_ID\")).completed = \"$TODAY\"" "$SPRINT_FILE"
# Remove assigned_to (no longer in progress)
yq eval -i "del((.epics[].stories[] | select(.id == \"$STORY_ID\")).assigned_to)" "$SPRINT_FILE"
echo "   → status: done, completed: $TODAY"

# Step 5: Archive completed epics
echo "5. Archiving completed epics..."
pf sprint epic archive 2>/dev/null && echo "   → Checked for completed epics" || echo "   → No epics to archive"

# Step 6: Clean up git
echo "6. Cleaning up git..."
git checkout develop 2>/dev/null || git checkout main 2>/dev/null || true
git pull origin "$(git branch --show-current)" 2>/dev/null || true

if [[ -n "$BRANCH" ]]; then
  git branch -d "$BRANCH" 2>/dev/null || echo "   Local branch already deleted"
fi

# Step 7: Remove session file
echo "7. Removing session file..."
rm "$SESSION_FILE"

echo ""
echo "=== Story $STORY_ID Complete ==="
echo "Archived: sprint/archive/${JIRA_KEY}-session.md"
echo "Jira: https://1898andco.atlassian.net/browse/$JIRA_KEY"
