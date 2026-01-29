#!/usr/bin/env zsh
# Sprint Common Functions
# Shared functions for sprint management
#
# Usage: Scripts must set up PROJECT_ROOT before sourcing this file:
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd -P)"
#   source "$SCRIPT_DIR/../lib/find-root.sh"
#   source "$SCRIPT_DIR/sprint-common.sh"

# Jira project identifier
export JIRA_PROJECT="MSSCI"

# Require PROJECT_ROOT to be set
if [[ -z "${PROJECT_ROOT:-}" ]]; then
    echo "Error: PROJECT_ROOT must be set before sourcing sprint-common.sh" >&2
    echo "Source lib/find-root.sh first" >&2
    exit 1
fi

# find_story_file STORY_KEY
# Search for a story in sprint YAML files
# Returns: path to the YAML file containing the story
find_story_file() {
    local story_key="$1"

    # Extract epic number from story key (e.g., "11-9" from "11-9-theme-maker")
    local epic_num="${story_key%%-*}"

    # Check current sprint first
    if [[ -f "$PROJECT_ROOT/sprint/current-sprint.yaml" ]]; then
        # Simple check: grep for the story key in the file
        if grep -q "id: \"$epic_num-" "$PROJECT_ROOT/sprint/current-sprint.yaml" 2>/dev/null; then
            echo "$PROJECT_ROOT/sprint/current-sprint.yaml"
            return 0
        fi
    fi

    # Check archived sprints
    local archive_dir="$PROJECT_ROOT/sprint/archive"
    if [[ -d "$archive_dir" ]]; then
        local found=$(grep -l "id: \"$epic_num-" "$archive_dir"/*.yaml 2>/dev/null | head -1)
        if [[ -n "$found" ]]; then
            echo "$found"
            return 0
        fi
    fi

    return 1
}

# get_story_field STORY_KEY FIELD_NAME
# Extract a field value from a story in sprint YAML
# Returns: the field value or "null"
get_story_field() {
    local story_key="$1"
    local field_name="$2"

    # Extract epic and story numbers from story key
    local epic_num="${story_key%%-*}"
    local story_rest="${story_key#*-}"
    local story_num="${story_rest%%-*}"

    local story_file=$(find_story_file "$story_key")
    if [[ -z "$story_file" ]]; then
        echo "null"
        return 1
    fi

    # Use yq to extract the field if available, otherwise fallback to grep
    if command -v yq &> /dev/null; then
        yq eval ".epics[] | select(.id == \"$epic_num\") | .stories[] | select(.id == \"$story_num\") | .$field_name" "$story_file" 2>/dev/null || echo "null"
    else
        # Fallback: grep for the pattern and extract value
        # This is a simplified approach - full YAML parsing is better
        grep -A 50 "id: \"$story_key" "$story_file" 2>/dev/null | grep "$field_name:" | head -1 | sed "s/.*$field_name:[[:space:]]*\(.*\)/\1/" || echo "null"
    fi
}

# extract_jira_key JIRA_URL_OR_KEY
# Extract Jira issue key from URL or return as-is
# Returns: MSSCI-12345 format
extract_jira_key() {
    local input="$1"

    # If already in key format, return as-is
    if [[ "$input" =~ ^${JIRA_PROJECT}-[0-9]+$ ]]; then
        echo "$input"
        return 0
    fi

    # If it's a URL, extract the key
    if [[ "$input" =~ ${JIRA_PROJECT}-[0-9]+ ]]; then
        grep -o "${JIRA_PROJECT}-[0-9]\+" <<< "$input"
        return 0
    fi

    # Return input as-is if no extraction possible
    echo "$input"
    return 1
}

# extract_story_id BRANCH_NAME
# Extract story ID from branch name pattern feat/X-Y-*
# Returns: X-Y (e.g., "8-1" from "feat/8-1-merge-detection")
# Returns empty string for non-matching branches
extract_story_id() {
    local branch="$1"

    # Match pattern: feat/EPIC-STORY-description or feat/EPIC-STORY
    # Uses basic regex compatible with both bash and zsh
    if [[ "$branch" =~ ^feat/([0-9]+-[0-9]+) ]]; then
        echo "${match[1]:-${BASH_REMATCH[1]}}"
    fi
    # Returns empty string for non-matching patterns
}

# update_story_status STORY_ID [NEW_STATUS]
# Update story status in sprint YAML and add completed date
# Uses yq for YAML manipulation
# Arguments:
#   STORY_ID - Story identifier (e.g., "8-1")
#   NEW_STATUS - Optional status, defaults to "done"
update_story_status() {
    local story_id="$1"
    local new_status="${2:-done}"
    local completed_date
    completed_date=$(date +%Y-%m-%d)

    local sprint_file="$PROJECT_ROOT/sprint/current-sprint.yaml"

    if [[ ! -f "$sprint_file" ]]; then
        return 1
    fi

    # Check if yq is available
    if ! command -v yq &>/dev/null; then
        echo "Warning: yq not found, cannot update sprint YAML" >&2
        return 1
    fi

    # Extract epic and story numbers
    local epic_num="${story_id%%-*}"
    local story_num="${story_id#*-}"

    # Update status and add completed date using yq
    yq eval -i "
        (.epics[] | select(.id == \"$epic_num\") | .stories[] | select(.id == \"$story_num\")).status = \"$new_status\" |
        (.epics[] | select(.id == \"$epic_num\") | .stories[] | select(.id == \"$story_num\")).completed = \"$completed_date\"
    " "$sprint_file"

    return $?
}

# log_reconciliation STORY_ID MESSAGE
# Log reconciliation event to .session/ directory
# Arguments:
#   STORY_ID - Story identifier (e.g., "8-1")
#   MESSAGE - Optional message, defaults to "Merge detected"
log_reconciliation() {
    local story_id="$1"
    local message="${2:-Merge detected}"
    local timestamp
    timestamp=$(date +"%Y-%m-%d %H:%M:%S")

    local session_dir="$PROJECT_ROOT/.session"

    # Ensure session directory exists
    mkdir -p "$session_dir"

    local log_file="$session_dir/reconciliation.log"

    echo "[$timestamp] Story $story_id: $message" >> "$log_file"
}

# detect_drift
# Detect stories that have been merged but not marked as done in YAML or Jira
# Scans git log for recent merges (past 7 days) and compares against YAML/Jira status
# Returns: list of drifted stories in "story_id:yaml_status:jira_status" format
# A story is "drifted" when its branch was merged but YAML or Jira still shows in_progress
detect_drift() {
    local drifted=()

    # Get recently merged branches (past 7 days)
    # Look for feat/X-Y-* pattern in merge commit messages
    local merged_branches
    merged_branches=$(git log --merges --oneline --since="7 days ago" develop 2>/dev/null | \
        grep -oE 'feat/[0-9]+-[0-9]+[^[:space:]]*' | sort -u)

    for branch in $merged_branches; do
        # Use extract_story_id to parse branch name
        local story_id
        story_id=$(extract_story_id "$branch")

        if [[ -n "$story_id" ]]; then
            # Check current status in YAML via get_story_field
            local yaml_status
            yaml_status=$(get_story_field "$story_id" "status")

            # Get Jira key and check Jira status
            local jira_key jira_status
            jira_key=$(get_story_field "$story_id" "jira")
            jira_status="unknown"

            if [[ -n "$jira_key" && "$jira_key" != "null" ]]; then
                # Query Jira for current status
                jira_status=$(jira issue view "$jira_key" --raw 2>/dev/null | \
                    jq -r '.fields.status.name // "unknown"' 2>/dev/null || echo "unknown")
            fi

            # Story is drifted if merged but YAML status is not "done" and not "backlog"
            # OR if Jira status is not "Done" (case-insensitive check)
            local yaml_drifted=false
            local jira_drifted=false

            if [[ "$yaml_status" != "done" && "$yaml_status" != "backlog" && "$yaml_status" != "null" ]]; then
                yaml_drifted=true
            fi

            # Check Jira drift - status should be "Done" for merged stories
            if [[ "$jira_status" != "unknown" && "$jira_status" != "Done" && "$jira_status" != "Closed" ]]; then
                jira_drifted=true
            fi

            # Report if either YAML or Jira is drifted
            if [[ "$yaml_drifted" == "true" || "$jira_drifted" == "true" ]]; then
                drifted+=("$story_id:$yaml_status:$jira_status")
            fi
        fi
    done

    # Output drifted stories (one per line)
    printf '%s\n' "${drifted[@]}" 2>/dev/null || true
}

# =============================================================================
# Sprint Summary Functions
# =============================================================================

# get_sprint_file
# Returns path to current sprint YAML file
get_sprint_file() {
    echo "$PROJECT_ROOT/sprint/current-sprint.yaml"
}

# check_yq
# Verify yq is available, return error message if not
# Returns: 0 if yq available, 1 if not
check_yq() {
    if ! command -v yq &>/dev/null; then
        echo "Error: yq is required but not installed. Install with: brew install yq" >&2
        return 1
    fi
    return 0
}

# get_sprint_metadata FIELD
# Extract a field from sprint metadata
# Arguments:
#   FIELD - Field name (number, name, goal, start_date, end_date, status)
# Returns: field value or empty string
get_sprint_metadata() {
    local field="$1"
    local sprint_file
    sprint_file=$(get_sprint_file)

    if [[ ! -f "$sprint_file" ]]; then
        return 1
    fi

    check_yq || return 1
    yq eval ".sprint.$field // \"\"" "$sprint_file" 2>/dev/null
}

# get_sprint_summary
# Get one-line sprint summary: "Sprint N: Goal"
# Returns: formatted summary string
get_sprint_summary() {
    local sprint_num sprint_goal
    sprint_num=$(get_sprint_metadata "number")
    sprint_goal=$(get_sprint_metadata "goal")

    if [[ -n "$sprint_num" && "$sprint_num" != "null" ]]; then
        echo "Sprint ${sprint_num}: ${sprint_goal}"
    fi
}

# sum_points VALUES
# Sum a list of point values (one per line)
# Arguments:
#   VALUES - newline-separated point values from yq
# Returns: integer sum
sum_points() {
    local result
    result=$(echo "$1" | paste -sd+ - | bc 2>/dev/null)
    echo "${result:-0}"
}

# get_sprint_progress
# Get sprint progress as "completed/total points"
# Returns: formatted progress string
get_sprint_progress() {
    local sprint_file
    sprint_file=$(get_sprint_file)

    if [[ ! -f "$sprint_file" ]]; then
        return 1
    fi

    check_yq || return 1

    # Get summary fields if available
    local completed total
    completed=$(yq '.summary.completed_points // 0' "$sprint_file" 2>/dev/null)
    total=$(yq '.summary.total_points // 0' "$sprint_file" 2>/dev/null)

    # If summary not available, calculate from stories
    if [[ "$total" == "0" || "$total" == "null" ]]; then
        total=$(sum_points "$(yq '.epics[].stories[].points' "$sprint_file" 2>/dev/null)")
    fi

    echo "Progress: ${completed:-0}/${total:-0} points"
}

# get_story_counts
# Get story counts by status
# Returns: "backlog:N in_progress:N done:N" format
get_story_counts() {
    local sprint_file
    sprint_file=$(get_sprint_file)

    if [[ ! -f "$sprint_file" ]]; then
        return 1
    fi

    check_yq || return 1

    local backlog in_progress done
    backlog=$(yq eval '[.epics[].stories[] | select(.status == "backlog")] | length' "$sprint_file" 2>/dev/null)
    in_progress=$(yq eval '[.epics[].stories[] | select(.status == "in_progress")] | length' "$sprint_file" 2>/dev/null)
    done=$(yq eval '[.epics[].stories[] | select(.status == "done")] | length' "$sprint_file" 2>/dev/null)

    echo "backlog:${backlog:-0} in_progress:${in_progress:-0} done:${done:-0}"
}

# get_point_counts
# Get point totals by status
# Returns: "backlog:N in_progress:N done:N total:N" format
get_point_counts() {
    local sprint_file
    sprint_file=$(get_sprint_file)

    if [[ ! -f "$sprint_file" ]]; then
        return 1
    fi

    check_yq || return 1

    local backlog in_progress total
    total=$(sum_points "$(yq '.epics[].stories[].points' "$sprint_file" 2>/dev/null)")
    backlog=$(sum_points "$(yq '.epics[].stories[] | select(.status == "backlog") | .points' "$sprint_file" 2>/dev/null)")
    in_progress=$(sum_points "$(yq '.epics[].stories[] | select(.status == "in_progress") | .points' "$sprint_file" 2>/dev/null)")

    echo "backlog:${backlog:-0} in_progress:${in_progress:-0} total:${total:-0}"
}

# =============================================================================
# Drift Detection Functions
# =============================================================================

# reconcile_drift STORY_ID
# Auto-reconcile a drifted story by updating YAML status to done and Jira to Done
# Logs the reconciliation event
# Arguments:
#   STORY_ID - Story identifier (e.g., "8-1")
reconcile_drift() {
    local story_id="$1"

    if [[ -z "$story_id" ]]; then
        echo "Error: story_id required" >&2
        return 1
    fi

    local yaml_updated=false
    local jira_updated=false
    local messages=()

    # Update YAML status to done
    update_story_status "$story_id" "done"
    if [[ $? -eq 0 ]]; then
        yaml_updated=true
        messages+=("YAML status updated to done")
    fi

    # Get Jira key and transition to Done
    local jira_key
    jira_key=$(get_story_field "$story_id" "jira")

    if [[ -n "$jira_key" && "$jira_key" != "null" ]]; then
        # Try to transition Jira to Done
        if jira issue move "$jira_key" "Done" 2>/dev/null; then
            jira_updated=true
            messages+=("Jira $jira_key transitioned to Done")
        else
            messages+=("Jira $jira_key transition failed (may need manual update)")
        fi
    fi

    # Log the reconciliation event
    if [[ "$yaml_updated" == "true" || "$jira_updated" == "true" ]]; then
        log_reconciliation "$story_id" "Auto-reconciled: ${messages[*]}"
        return 0
    else
        return 1
    fi
}
