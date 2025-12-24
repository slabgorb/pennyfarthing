#!/bin/bash
# Jira CLI Library Functions
# Shared functions for interacting with Jira using jira-cli
# Source this file: source "${SCRIPT_DIR}/jira-lib.sh"

#############################################
# Dependency Checks
#############################################

check_jira_cli() {
    local missing=()

    # Standard deps from common
    check_dependencies 2>/dev/null || true

    # Check for jira-cli
    if ! command -v jira &> /dev/null; then
        missing+=("jira-cli")
        error "✗ jira-cli not found"
        echo "  Install with: brew install ankitpokhrel/jira-cli/jira-cli"
        echo "  Then run: jira init"
    else
        success "✓ jira-cli installed"
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

    # Check jira-cli config
    if [ -f "$HOME/.config/.jira/.config.yml" ]; then
        success "✓ jira-cli configured"
    elif command -v jira &> /dev/null; then
        missing+=("jira-config")
        error "✗ jira-cli not configured"
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

    if [ "$DRY_RUN" = true ]; then
        echo ""
        return
    fi

    # Search for epic by exact summary match
    # Use JQL to find epics with matching summary
    local escaped_summary=$(echo "$summary" | sed 's/"/\\"/g')
    jira issue list --jql "project=${JIRA_PROJECT} AND type=Epic AND summary~'${escaped_summary}'" --plain 2>/dev/null | \
        grep -E "^Epic.*${JIRA_PROJECT}-[0-9]+" | \
        grep -oE "${JIRA_PROJECT}-[0-9]+" | \
        head -1
}

search_existing_story() {
    local summary="$1"
    local parent_key="$2"

    if [ "$DRY_RUN" = true ]; then
        echo ""
        return
    fi

    # Search for story by exact summary match under the same epic
    # Use JQL to find stories with matching summary
    local escaped_summary=$(echo "$summary" | sed 's/"/\\"/g')
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

    if [ "$DRY_RUN" = true ]; then
        warn "[DRY-RUN] Would create epic: $summary"
        echo "DRYRUN-EPIC-001"
        return
    fi

    jira issue create \
        --project "$JIRA_PROJECT" \
        --type Epic \
        --summary "$summary" \
        --body "$description" \
        --label "$JIRA_LABEL" \
        --no-input 2>&1 | grep -oE "${JIRA_PROJECT}-[0-9]+" | head -1
}

create_story() {
    local summary="$1"
    local description="$2"
    local priority="$3"
    local points="$4"
    local parent="$5"

    if [ "$DRY_RUN" = true ]; then
        warn "[DRY-RUN] Would create story: $summary"
        echo "DRYRUN-STORY-001"
        return
    fi

    local args=(
        --project "$JIRA_PROJECT"
        --type Story
        --summary "$summary"
        --body "$description"
        --priority "$priority"
        --label "$JIRA_LABEL"
        --no-input
    )

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

    if [ "$DRY_RUN" = true ]; then
        warn "[DRY-RUN] Would update: $key"
        return 0
    fi

    # Fetch current issue as JSON
    local current_json=$(jira issue view "$key" --raw 2>/dev/null)
    if [ -z "$current_json" ]; then
        warn "  ⚠️  Could not fetch current issue, updating anyway"
        jira issue edit "$key" --summary "$summary" --body "$description" --no-input 2>&1
        return 0
    fi

    # Extract current summary and description from JSON
    local current_summary=$(echo "$current_json" | jq -r '.fields.summary // ""')
    local current_desc=$(echo "$current_json" | jq -r '.fields.description // ""')

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

    if [ "$DRY_RUN" = true ]; then
        warn "[DRY-RUN] Would move $key to: $status"
        return 0
    fi

    # Fetch current status from JSON
    local current_json=$(jira issue view "$key" --raw 2>/dev/null)
    if [ -n "$current_json" ]; then
        local current_status=$(echo "$current_json" | jq -r '.fields.status.name // ""')
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

    if [ "$DRY_RUN" = true ]; then
        warn "[DRY-RUN] Would assign $key to: $assignee"
        return 0
    fi

    if [ -z "$assignee" ] || [ "$assignee" = "null" ] || [ -z "$key" ]; then
        return 0
    fi

    # Check current assignee from JSON
    local current_json=$(jira issue view "$key" --raw 2>/dev/null)
    if [ -n "$current_json" ]; then
        local current_email=$(echo "$current_json" | jq -r '.fields.assignee.emailAddress // ""')
        local current_name=$(echo "$current_json" | jq -r '.fields.assignee.displayName // ""')

        # Check if already assigned to this user (compare email or name)
        if [ "$current_email" = "$assignee" ] || echo "$current_name" | grep -qi "$assignee"; then
            # Already assigned to this user
            return 1
        fi
    fi

    # Assign the issue - jira-cli accepts email or display name
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

# Sync story points from Conductor to Jira
# Usage: sync_story_points <issue_key> <conductor_points> [jira_points]
# Returns: 0 if synced, 1 if already correct, 2 if failed
sync_story_points() {
    local key="$1"
    local conductor_points="$2"
    local jira_points="${3:-}"

    if [ "$DRY_RUN" = true ]; then
        warn "[DRY-RUN] Would sync story points for $key: ${conductor_points}"
        return 0
    fi

    # Skip if no points defined in Conductor
    if [ -z "$conductor_points" ] || [ "$conductor_points" = "null" ]; then
        warn "  ⚠️  No story points defined in Conductor"
        return 1
    fi

    # Get current Jira points if not provided
    if [ -z "$jira_points" ]; then
        jira_points=$(get_story_points "$key")
    fi

    # Compare as integers (Jira might return float like "5.0")
    local jira_points_int=$(echo "$jira_points" | cut -d'.' -f1)
    if [ "$jira_points_int" = "$conductor_points" ]; then
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
        -d "{\"fields\": {\"customfield_10031\": ${conductor_points}}}" \
        "${api_url}" 2>&1)

    if [ "$http_code" = "204" ] || [ "$http_code" = "200" ]; then
        return 0
    else
        warn "  ⚠️  Could not sync story points (HTTP $http_code)"
        return 2
    fi
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
    # Example: https://github.com/1898andCo/conductor-ui/pull/42
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
