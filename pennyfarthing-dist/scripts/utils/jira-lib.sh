#!/usr/bin/env zsh
# Jira CLI Library Functions
# Shared functions for interacting with Jira using jira
# Source this file: source "${SCRIPT_DIR}/jira-lib.sh"

# Source common utilities (for dry_run_check, escape_for_jql, get_issue_json, etc.)
_JIRA_LIB_DIR="$(cd "$(dirname "${0:-$BASH_SOURCE[0]}")" && pwd)"
source "${_JIRA_LIB_DIR}/common.sh"

#############################################
# Dependency Checks
#############################################

check_jira_cli() {
    local missing=()

    # Standard deps from common
    check_dependencies 2>/dev/null || true

    # Check for jira
    if ! command -v jira &> /dev/null; then
        missing+=("jira")
        error "✗ jira not found"
        echo "  Install with: brew install ankitpokhrel/jira/jira"
        echo "  Then run: jira init"
    else
        success "✓ jira installed"
    fi

    # Check for JIRA_API_TOKEN
    if [ -z "$JIRA_API_TOKEN" ]; then
        missing+=("JIRA_API_TOKEN")
        error "✗ JIRA_API_TOKEN not set"
        echo "  Create token at: https://id.atlassian.com/manage-profile/security/api-tokens"
        echo "  Then: export JIRA_API_TOKEN='your-token'"
    else
        success "✓ JIRA_API_TOKEN set"
    fi

    # Check jira config
    if [ -f "$HOME/.config/.jira/.config.yml" ]; then
        success "✓ jira configured"
    elif command -v jira &> /dev/null; then
        missing+=("jira-config")
        error "✗ jira not configured"
        echo "  Run: jira init"
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        echo ""
        error "Missing: ${missing[*]}"
        exit 1
    fi
    echo ""
}

#############################################
# Search Functions
#############################################

search_existing_epic() {
    local summary="$1"

    if dry_run_check "search for epic"; then
        echo ""
        return
    fi

    # Search for epic by exact summary match
    local escaped_summary=$(escape_for_jql "$summary")
    jira issue list --jql "project=${JIRA_PROJECT} AND type=Epic AND summary~'${escaped_summary}'" --plain 2>/dev/null | \
        grep -E "^Epic.*${JIRA_PROJECT}-[0-9]+" | \
        grep -oE "${JIRA_PROJECT}-[0-9]+" | \
        head -1
}

search_existing_story() {
    local summary="$1"
    local parent_key="$2"

    if dry_run_check "search for story"; then
        echo ""
        return
    fi

    # Search for story by exact summary match under the same epic
    local escaped_summary=$(escape_for_jql "$summary")
    local jql="project=${JIRA_PROJECT} AND type=Story AND summary~'${escaped_summary}'"

    # If parent epic provided, also filter by parent
    if [ -n "$parent_key" ]; then
        jql="${jql} AND parent=${parent_key}"
    fi

    jira issue list --jql "$jql" --plain 2>/dev/null | \
        grep -E "${JIRA_PROJECT}-[0-9]+" | \
        grep -oE "${JIRA_PROJECT}-[0-9]+" | \
        head -1
}

#############################################
# Create Functions
#############################################

create_epic() {
    local summary="$1"
    local description="$2"

    # Use PROJECT_LABEL if set, otherwise fall back to PROJECT_NAME
    local label="${PROJECT_LABEL:-${PROJECT_NAME:-}}"

    if dry_run_check "create epic: $summary"; then
        echo "DRYRUN-EPIC-001"
        return
    fi

    local args=(
        --project "$JIRA_PROJECT"
        --type Epic
        --summary "$summary"
        --body "$description"
        --no-input
    )

    # Only add label if we have one
    [ -n "$label" ] && args+=(--label "$label")

    jira issue create "${args[@]}" 2>&1 | grep -oE "${JIRA_PROJECT}-[0-9]+" | head -1
}

create_story() {
    local summary="$1"
    local description="$2"
    local priority="$3"
    local points="$4"
    local parent="$5"

    # Use PROJECT_LABEL if set, otherwise fall back to PROJECT_NAME
    local label="${PROJECT_LABEL:-${PROJECT_NAME:-}}"

    if dry_run_check "create story: $summary"; then
        echo "DRYRUN-STORY-001"
        return
    fi

    local args=(
        --project "$JIRA_PROJECT"
        --type Story
        --summary "$summary"
        --body "$description"
        --priority "$priority"
        --no-input
    )

    # Only add label if we have one
    [ -n "$label" ] && args+=(--label "$label")
    [ -n "$parent" ] && args+=(--parent "$parent")

    jira issue create "${args[@]}" 2>&1 | grep -oE "${JIRA_PROJECT}-[0-9]+" | head -1
}

#############################################
# Update Functions
#############################################

update_issue() {
    local key="$1"
    local summary="$2"
    local description="$3"

    if dry_run_check "update: $key"; then
        return 0
    fi

    # Fetch current issue as JSON
    local current_json=$(get_issue_json "$key")
    if [ -z "$current_json" ] || [ "$current_json" = "{}" ]; then
        warn "  Could not fetch current issue, updating anyway"
        jira issue edit "$key" --summary "$summary" --body "$description" --no-input 2>&1
        return 0
    fi

    # Extract current summary and description from JSON
    local current_summary=$(get_jira_field "$current_json" '.fields.summary' '')
    local current_desc=$(get_jira_field "$current_json" '.fields.description' '')

    # Compare both summary and description
    if [ "$current_summary" = "$summary" ] && [ "$current_desc" = "$description" ]; then
        # No changes needed
        return 1
    fi

    # Update needed
    jira issue edit "$key" --summary "$summary" --body "$description" --no-input 2>&1
    return 0
}

move_issue() {
    local key="$1"
    local status="$2"

    if dry_run_check "move $key to: $status"; then
        return 0
    fi

    # Fetch current status from JSON
    local current_json=$(get_issue_json "$key")
    if [ -n "$current_json" ] && [ "$current_json" != "{}" ]; then
        local current_status=$(get_jira_field "$current_json" '.fields.status.name' '')
        # Case-insensitive comparison
        if [ "$(echo "$current_status" | tr '[:upper:]' '[:lower:]')" = "$(echo "$status" | tr '[:upper:]' '[:lower:]')" ]; then
            return 1
        fi
    fi

    # Transition needed
    jira issue move "$key" "$status" --project "$JIRA_PROJECT" 2>&1 || true
    return 0
}

assign_issue() {
    local key="$1"
    local assignee="$2"

    if dry_run_check "assign $key to: $assignee"; then
        return 0
    fi

    if [ -z "$assignee" ] || [ "$assignee" = "null" ] || [ -z "$key" ]; then
        return 0
    fi

    # Check current assignee from JSON
    local current_json=$(get_issue_json "$key")
    if [ -n "$current_json" ] && [ "$current_json" != "{}" ]; then
        local current_email=$(get_jira_field "$current_json" '.fields.assignee.emailAddress' '')
        local current_name=$(get_jira_field "$current_json" '.fields.assignee.displayName' '')

        # Check if already assigned to this user (compare email or name)
        if [ "$current_email" = "$assignee" ] || echo "$current_name" | grep -qi "$assignee"; then
            # Already assigned to this user
            return 1
        fi
    fi

    # Assign the issue - jira accepts email or display name
    # Note: --project flag is required even though key contains project prefix
    local result=$(jira issue assign --project "$JIRA_PROJECT" "$key" "$assignee" 2>&1)
    local exit_code=$?

    if [ $exit_code -eq 0 ]; then
        return 0
    else
        # Check if it's a "user not found" error vs other error
        if echo "$result" | grep -q "400 Bad Request"; then
            warn "  ⚠️  User not found in Jira: $assignee"
        else
            warn "  ⚠️  Could not assign: $result"
        fi
        return 1
    fi
}

#############################################
# Story Points Functions
#############################################

# Get story points from a Jira issue
# Usage: get_story_points <issue_key>
# Returns: points value or "null" if not set
get_story_points() {
    local key="$1"
    local issue_json="${2:-}"  # Optional - pass cached JSON to avoid extra API call

    if [ -z "$issue_json" ]; then
        issue_json=$(jira issue view "$key" --raw 2>/dev/null)
    fi

    if [ -z "$issue_json" ]; then
        echo "null"
        return
    fi

    # Story points custom field for 1898andco Jira
    # customfield_10031 = "Story Points" (1898andco instance)
    local points=$(echo "$issue_json" | jq -r '.fields.customfield_10031 // "null"')
    echo "$points"
}

# Sync story points from Pennyfarthing to Jira
# Usage: sync_story_points <issue_key> <Pennyfarthing_points> [jira_points]
# Returns: 0 if synced, 1 if already correct, 2 if failed
sync_story_points() {
    local key="$1"
    local Pennyfarthing_points="$2"
    local jira_points="${3:-}"

    if dry_run_check "sync story points for $key: ${Pennyfarthing_points}"; then
        return 0
    fi

    # Skip if no points defined in Pennyfarthing
    if [ -z "$Pennyfarthing_points" ] || [ "$Pennyfarthing_points" = "null" ]; then
        warn "  ⚠️  No story points defined in Pennyfarthing"
        return 1
    fi

    # Get current Jira points if not provided
    if [ -z "$jira_points" ]; then
        jira_points=$(get_story_points "$key")
    fi

    # Compare as integers (Jira might return float like "5.0")
    local jira_points_int=$(echo "$jira_points" | cut -d'.' -f1)
    if [ "$jira_points_int" = "$Pennyfarthing_points" ]; then
        return 1  # Already correct
    fi

    # Story points field for 1898andco Jira instance
    # customfield_10031 = "Story Points"
    # Note: jira CLI --custom doesn't work reliably, use REST API directly
    local jira_user="keith.avery@1898andco.io"
    local api_url="${JIRA_URL}/rest/api/3/issue/${key}"

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
        -u "${jira_user}:${JIRA_API_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"fields\": {\"customfield_10031\": ${Pennyfarthing_points}}}" \
        "${api_url}" 2>&1)

    if [ "$http_code" = "204" ] || [ "$http_code" = "200" ]; then
        return 0
    else
        warn "  ⚠️  Could not sync story points (HTTP $http_code)"
        return 2
    fi
}

#############################################
# Status Mapping
#############################################

# map_status_to_jira Pennyfarthing_STATUS
# Map Pennyfarthing status to Jira status name
# Returns: Jira status string
map_status_to_jira() {
    local Pennyfarthing_status="$1"

    case "$Pennyfarthing_status" in
        backlog|todo)
            echo "To Do"
            ;;
        in-progress|in_progress|active)
            echo "In Progress"
            ;;
        review|in-review|in_review)
            echo "In Review"
            ;;
        done|completed|closed)
            echo "Done"
            ;;
        blocked)
            echo "Blocked"
            ;;
        *)
            # Default to To Do for unknown statuses
            echo "To Do"
            ;;
    esac
}

# map_jira_to_status JIRA_STATUS
# Map Jira status to Pennyfarthing status name
# Returns: Pennyfarthing status string
map_jira_to_status() {
    local jira_status="$1"

    case "$jira_status" in
        "To Do"|"Open"|"Backlog")
            echo "backlog"
            ;;
        "In Progress"|"Active")
            echo "in-progress"
            ;;
        "In Review"|"Review")
            echo "review"
            ;;
        "Done"|"Closed"|"Resolved")
            echo "done"
            ;;
        "Blocked")
            echo "blocked"
            ;;
        *)
            # Default to backlog for unknown statuses
            echo "backlog"
            ;;
    esac
}

#############################################
# Helper Functions
#############################################

get_pr_author() {
    local pr_url="$1"

    if [ -z "$pr_url" ] || [ "$pr_url" = "null" ]; then
        echo ""
        return
    fi

    # Extract org/repo/number from URL
    # Example: https://github.com/1898andCo/Pennyfarthing-ui/pull/42
    if [[ "$pr_url" =~ github\.com/([^/]+)/([^/]+)/pull/([0-9]+) ]]; then
        local org="${BASH_REMATCH[1]}"
        local repo="${BASH_REMATCH[2]}"
        local pr_number="${BASH_REMATCH[3]}"

        # Use gh CLI to get PR author
        local author=$(gh pr view "$pr_number" --repo "${org}/${repo}" --json author --jq '.author.login' 2>/dev/null)
        echo "$author"
    fi
}

map_github_to_jira() {
    local github_user="$1"

    if [ -z "$github_user" ]; then
        echo ""
        return
    fi

    # GitHub username to Jira email/accountId mapping
    # Add mappings as needed
    case "$github_user" in
        "slabgorb")
            # Keith Avery's Jira account
            echo "keith.avery@1898andco.io"
            ;;
        "arcaven")
            # Michael Pursifull's Jira account
            echo "michael.pursifull@1898andco.io"
            ;;
        "RoseSecurity")
            # Michael Rosenfeld's Jira account
            echo "michael.rosenfeld@1898andco.io"
            ;;
        "Zious11")
            # Jared Richards' Jira account
            echo "jared.richards@1898andco.io"
            ;;
        "drbothen")
            # Joshua Magady's Jira account
            echo "joshua.magady@1898andco.io"
            ;;
        *)
            # Default: assume GitHub username matches Jira email prefix
            echo "${github_user}@1898andco.io"
            ;;
    esac
}
