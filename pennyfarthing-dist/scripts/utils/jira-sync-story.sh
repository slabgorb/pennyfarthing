#!/usr/bin/env zsh
# Sync a single story to Jira using jira CLI
# Usage: ./scripts/jira-sync-story.sh <story_key> [--transition] [--points] [--comment "message"]
#
# This script uses the `jira` CLI tool (https://github.com/ankitpokhrel/jira-cli)
#
# Actions:
#   (default)       Show story status in Jira
#   --transition    Transition story to match Conductor status
#   --points        Sync story points from Conductor to Jira
#   --comment       Add a comment to the story
#
# Exit codes:
#   0 - Success
#   1 - Story not found or not synced to Jira
#   2 - Error

set -e

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/sprint-common.sh"
source "${SCRIPT_DIR}/jira-lib.sh"

# Check dependencies
check_dependencies

# Check jira CLI
if ! command -v jira &> /dev/null; then
    error "Error: jira CLI not installed"
    echo "Install with: brew install ankitpokhrel/jira-cli/jira-cli"
    echo "Then run: jira init"
    exit 2
fi

# Parse arguments
STORY_KEY=""
DO_TRANSITION=false
SYNC_POINTS=false
COMMENT=""

while [ $# -gt 0 ]; do
    case "$1" in
        --transition)
            DO_TRANSITION=true
            shift
            ;;
        --points)
            SYNC_POINTS=true
            shift
            ;;
        --comment)
            COMMENT="$2"
            shift 2
            ;;
        *)
            if [ -z "$STORY_KEY" ]; then
                STORY_KEY="$1"
            fi
            shift
            ;;
    esac
done

if [ -z "$STORY_KEY" ]; then
    error "Error: Story key required"
    echo "Usage: $0 <story_key> [--transition] [--points] [--comment \"message\"]"
    echo "Example: $0 35-2-topology-editor"
    echo "Example: $0 35-2-topology-editor --transition"
    echo "Example: $0 35-2-topology-editor --points"
    echo "Example: $0 35-2-topology-editor --transition --points"
    echo "Example: $0 35-2-topology-editor --comment \"Started development\""
    exit 2
fi

# Find the story
STORY_FILE=$(find_story_file "$STORY_KEY")
if [ -z "$STORY_FILE" ]; then
    error "Error: Story ${STORY_KEY} not found in sprint files"
    exit 1
fi

# Get story details
CONDUCTOR_STATUS=$(get_story_field "$STORY_KEY" "status")
STORY_JIRA_LINK=$(get_story_field "$STORY_KEY" "jira")
STORY_BRANCH=$(get_story_field "$STORY_KEY" "branch")
STORY_PR=$(get_story_field "$STORY_KEY" "pr")
STORY_POINTS=$(get_story_field "$STORY_KEY" "points")

if [ "$STORY_JIRA_LINK" = "null" ] || [ -z "$STORY_JIRA_LINK" ]; then
    warn "⚠️  Story ${STORY_KEY} not synced to Jira yet"
    echo ""
    echo "To create this story in Jira, use:"
    echo "  jira issue create -tStory -s\"Story ${STORY_KEY}\" -yHigh"
    exit 1
fi

JIRA_ISSUE_KEY=$(extract_jira_key "$STORY_JIRA_LINK")

info "📋 Story: ${STORY_KEY}"
info "🎫 Jira: ${JIRA_ISSUE_KEY}"
echo ""

# Get current Jira status
ISSUE_JSON=$(jira issue view "$JIRA_ISSUE_KEY" --raw 2>/dev/null || echo "{}")

if [ "$ISSUE_JSON" = "{}" ]; then
    error "Error: Could not fetch issue ${JIRA_ISSUE_KEY}"
    exit 2
fi

JIRA_STATUS=$(echo "$ISSUE_JSON" | jq -r '.fields.status.name // "Unknown"')
JIRA_ASSIGNEE=$(echo "$ISSUE_JSON" | jq -r '.fields.assignee.displayName // "Unassigned"')
JIRA_SUMMARY=$(echo "$ISSUE_JSON" | jq -r '.fields.summary // "No summary"')
JIRA_POINTS=$(get_story_points "$JIRA_ISSUE_KEY" "$ISSUE_JSON")

echo "   Summary: ${JIRA_SUMMARY}"
echo "   Jira Status: ${JIRA_STATUS}"
echo "   Assignee: ${JIRA_ASSIGNEE}"
echo "   Conductor Status: ${CONDUCTOR_STATUS}"
[ "$STORY_POINTS" != "null" ] && [ -n "$STORY_POINTS" ] && echo "   Conductor Points: ${STORY_POINTS}"
[ "$JIRA_POINTS" != "null" ] && [ -n "$JIRA_POINTS" ] && echo "   Jira Points: ${JIRA_POINTS}"
[ "$STORY_BRANCH" != "null" ] && [ -n "$STORY_BRANCH" ] && echo "   Branch: ${STORY_BRANCH}"
[ "$STORY_PR" != "null" ] && [ -n "$STORY_PR" ] && echo "   PR: ${STORY_PR}"
echo ""

# Map Conductor status to Jira status
TARGET_JIRA_STATUS=$(map_status_to_jira "$CONDUCTOR_STATUS")

# Transition if requested
if [ "$DO_TRANSITION" = true ]; then
    if [ "$JIRA_STATUS" = "$TARGET_JIRA_STATUS" ]; then
        success "✅ Already at correct status: ${JIRA_STATUS}"
    else
        info "📊 Transitioning: ${JIRA_STATUS} → ${TARGET_JIRA_STATUS}"
        if jira issue move "$JIRA_ISSUE_KEY" "$TARGET_JIRA_STATUS" 2>/dev/null; then
            success "✅ Transitioned to ${TARGET_JIRA_STATUS}"
        else
            warn "⚠️  Could not transition (status may not be available from current state)"
        fi
    fi
fi

# Sync story points if requested
if [ "$SYNC_POINTS" = true ]; then
    info "📊 Syncing story points: ${JIRA_POINTS:-unset} → ${STORY_POINTS:-unset}"
    sync_story_points "$JIRA_ISSUE_KEY" "$STORY_POINTS" "$JIRA_POINTS"
    case $? in
        0) success "✅ Story points synced: ${STORY_POINTS}" ;;
        1) success "✅ Story points already synced: ${STORY_POINTS}" ;;
        2) ;; # Warning already printed by sync_story_points
    esac
fi

# Add comment if provided
if [ -n "$COMMENT" ]; then
    info "💬 Adding comment..."
    if jira issue comment add "$JIRA_ISSUE_KEY" "$COMMENT" 2>/dev/null; then
        success "✅ Comment added"
    else
        warn "⚠️  Could not add comment"
    fi
fi

# Build auto-comment for branch/PR if transitioning
if [ "$DO_TRANSITION" = true ]; then
    AUTO_COMMENT=""
    
    if [ "$CONDUCTOR_STATUS" = "in-progress" ] && [ "$STORY_BRANCH" != "null" ] && [ -n "$STORY_BRANCH" ]; then
        AUTO_COMMENT="**Development Started**\n\nBranch: \`${STORY_BRANCH}\`\n\nSynced from Conductor"
    elif [ "$CONDUCTOR_STATUS" = "review" ] && [ "$STORY_PR" != "null" ] && [ -n "$STORY_PR" ]; then
        AUTO_COMMENT="**Ready for Review**\n\nPR: ${STORY_PR}\n\nSynced from Conductor"
    elif [ "$CONDUCTOR_STATUS" = "done" ]; then
        AUTO_COMMENT="**Completed**\n\nSynced from Conductor on $(date +%Y-%m-%d)"
    fi
    
    if [ -n "$AUTO_COMMENT" ] && [ -z "$COMMENT" ]; then
        info "💬 Adding sync comment..."
        if echo -e "$AUTO_COMMENT" | jira issue comment add "$JIRA_ISSUE_KEY" 2>/dev/null; then
            success "✅ Sync comment added"
        fi
    fi
fi

echo ""
success "🔗 ${JIRA_URL}/browse/${JIRA_ISSUE_KEY}"
