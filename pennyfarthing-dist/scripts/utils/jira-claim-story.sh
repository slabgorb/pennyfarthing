#!/usr/bin/env zsh
# Check and claim a story in Jira for multi-developer coordination
# Usage: ./scripts/jira-claim-story.sh <story_key_or_jira_key> [--claim]
#
# This script uses the `jira` CLI tool (https://github.com/ankitpokhrel/jira)
#
# Parameters:
#   <story_key_or_jira_key>  Either:
#                             - Story key format: 35-7-feedback-rule-delete-404
#                             - Jira issue key format: MSSCI-10991
#
# Actions:
#   (default)   Check if story is assigned and show status
#   --claim     Assign story to current user and move to "In Progress"
#
# Exit codes:
#   0 - Story is available (unassigned) or successfully claimed
#   1 - Story is assigned to someone else
#   2 - Story not found or not synced to Jira
#   3 - Error (jira CLI not installed, etc.)

set -e

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/sprint-common.sh"
source "${SCRIPT_DIR}/jira-lib.sh"

# Check dependencies (using jira-lib's robust check)
check_jira_cli

# Check arguments
if [ -z "$1" ]; then
    error "Error: Story key or Jira issue key required"
    echo "Usage: $0 <story_key_or_jira_key> [--claim]"
    echo ""
    echo "Examples:"
    echo "  $0 35-7-feedback-rule-delete-404              # Using story key"
    echo "  $0 35-7-feedback-rule-delete-404 --claim      # Claim using story key"
    echo "  $0 MSSCI-10991                                # Using Jira issue key"
    echo "  $0 MSSCI-10991 --claim                        # Claim using Jira key"
    exit 3
fi

INPUT_KEY="$1"
CLAIM_MODE=false
[ "$2" = "--claim" ] && CLAIM_MODE=true

# Detect input format: Jira key (MSSCI-12345) vs Story key (35-7-name)
if [[ "$INPUT_KEY" =~ ^${JIRA_PROJECT}-[0-9]+$ ]]; then
    # Input is Jira issue key format (e.g., MSSCI-10991)
    JIRA_ISSUE_KEY="$INPUT_KEY"
    info "🔍 Using Jira issue key: ${JIRA_ISSUE_KEY}"

    # Skip story file lookup - we'll work directly with Jira
    STORY_KEY=""

else
    # Input is story key format (e.g., 35-7-feedback-rule-delete-404)
    STORY_KEY="$INPUT_KEY"

    # Extract epic number from story key
    EPIC_NUM=$(echo "$STORY_KEY" | cut -d'-' -f1)

    info "🔍 Checking story ${STORY_KEY} in Jira..."

    # Find the story
    STORY_FILE=$(find_story_file "$STORY_KEY")
    if [ -z "$STORY_FILE" ]; then
        error "Error: Story ${STORY_KEY} not found in sprint files"
        exit 2
    fi

    # Get Jira link
    STORY_JIRA_LINK=$(get_story_field "$STORY_KEY" "jira")
    if [ "$STORY_JIRA_LINK" = "null" ] || [ -z "$STORY_JIRA_LINK" ]; then
        warn "⚠️  Story ${STORY_KEY} not synced to Jira yet"
        echo ""
        echo "Proceeding without Jira sync. Story will be synced later."
        echo "To sync now, run: ./scripts/sync-epic-to-jira.sh ${EPIC_NUM}"
        exit 0
    fi

    JIRA_ISSUE_KEY=$(extract_jira_key "$STORY_JIRA_LINK")
    success "✅ Found Jira issue: ${JIRA_ISSUE_KEY}"
fi

# Get current user
CURRENT_USER=$(jira me 2>/dev/null || echo "")
if [ -z "$CURRENT_USER" ]; then
    error "Error: Could not get current Jira user. Run 'jira init' to configure."
    exit 3
fi

info "👤 Current user: ${CURRENT_USER}"

# Get issue details (using --raw for JSON parsing)
info "📋 Fetching issue details..."
ISSUE_JSON=$(jira issue view "$JIRA_ISSUE_KEY" --raw 2>/dev/null || echo "{}")

if [ "$ISSUE_JSON" = "{}" ]; then
    error "Error: Could not fetch issue ${JIRA_ISSUE_KEY}"
    exit 3
fi

# Parse assignee
ASSIGNEE=$(echo "$ISSUE_JSON" | jq -r '.fields.assignee.displayName // "Unassigned"')
ASSIGNEE_EMAIL=$(echo "$ISSUE_JSON" | jq -r '.fields.assignee.emailAddress // ""')
STATUS=$(echo "$ISSUE_JSON" | jq -r '.fields.status.name // "Unknown"')
SUMMARY=$(echo "$ISSUE_JSON" | jq -r '.fields.summary // "No summary"')

echo ""
echo "📋 Issue: ${JIRA_ISSUE_KEY}"
echo "   Summary: ${SUMMARY}"
echo "   Status: ${STATUS}"
echo "   Assignee: ${ASSIGNEE}"

# Check assignment status
if [ "$ASSIGNEE" = "Unassigned" ]; then
    success "✅ Story is UNASSIGNED - available to claim"
    
    if [ "$CLAIM_MODE" = true ]; then
        info "🎯 Claiming story..."
        
        # Assign to self
        if jira issue assign "$JIRA_ISSUE_KEY" "$(jira me)" --project "$JIRA_PROJECT" 2>/dev/null; then
            success "✅ Assigned to you"
        else
            error "Failed to assign issue"
            exit 3
        fi

        # Move to In Progress (if not already)
        if [ "$STATUS" != "In Progress" ]; then
            info "📊 Moving to 'In Progress'..."
            if jira issue move "$JIRA_ISSUE_KEY" "In Progress" --project "$JIRA_PROJECT" 2>/dev/null; then
                success "✅ Moved to In Progress"
            else
                warn "⚠️  Could not transition to In Progress (may already be there or transition not available)"
            fi
        fi
        
        echo ""
        success "🎉 Story ${JIRA_ISSUE_KEY} claimed successfully!"
    else
        echo ""
        info "To claim this story, run:"
        echo "  $0 $STORY_KEY --claim"
    fi
    exit 0
    
elif [ "$ASSIGNEE_EMAIL" = "$CURRENT_USER" ] || [ "$ASSIGNEE" = "$(jira me 2>/dev/null)" ]; then
    success "✅ Story is assigned to YOU - proceed with work"
    exit 0
    
else
    warn "⚠️  Story is assigned to: ${ASSIGNEE}"
    echo ""
    echo "This story is already being worked on by someone else."
    echo "Please choose a different story or coordinate with ${ASSIGNEE}."
    exit 1
fi
