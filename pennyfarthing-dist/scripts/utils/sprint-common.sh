#!/usr/bin/env zsh
# Sprint Common Functions
# Shared functions for sprint management
# Source this file: source "${SCRIPT_DIR}/sprint-common.sh"

# Jira project identifier
export JIRA_PROJECT="MSSCI"

# Find PROJECT_ROOT by looking for .claude/ marker
find_project_root() {
    local dir="$PWD"
    while [[ ! -d "$dir/.claude" ]] && [[ "$dir" != "/" ]]; do
        dir="$(dirname "$dir")"
    done
    if [[ -d "$dir/.claude" ]]; then
        echo "$dir"
    else
        return 1
    fi
}

# Get PROJECT_ROOT if not already set
PROJECT_ROOT="${PROJECT_ROOT:-$(find_project_root)}"
export PROJECT_ROOT

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
