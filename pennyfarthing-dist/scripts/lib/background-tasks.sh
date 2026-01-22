#!/usr/bin/env bash
# Background task tracking utilities for session files
#
# Usage:
#   source $CLAUDE_PROJECT_DIR/scripts/lib/background-tasks.sh
#
# Functions:
#   bg_task_add <session_file> <task_id> <subagent_type> <description>
#   bg_task_update <session_file> <task_id> <status>
#   bg_task_cleanup <session_file>
#   bg_task_list <session_file>
#   bg_task_check <session_file>
#
# Example:
#   # After spawning background task
#   bg_task_add "$SESSION_FILE" "abc123" "testing-runner" "Background test run"
#
#   # After TaskOutput returns
#   bg_task_update "$SESSION_FILE" "abc123" "completed"
#   bg_task_cleanup "$SESSION_FILE"

set -euo pipefail

# Helper: count pattern matches in file (returns 0 if no matches)
# grep -c outputs "0" AND exits 1 when no matches, so we capture and fallback separately
_count_matches() {
    local count
    count=$(grep -c "$1" "$2" 2>/dev/null) || count=0
    echo "$count"
}

# Add a background task to session file
# Creates the Background Tasks section if it doesn't exist
bg_task_add() {
    local session_file="$1"
    local task_id="$2"
    local subagent_type="$3"
    local description="${4:-}"
    local timestamp
    timestamp=$(date +"%H:%M")

    if [[ ! -f "$session_file" ]]; then
        echo "ERROR: Session file not found: $session_file" >&2
        return 1
    fi

    # Check if Background Tasks section exists
    if ! grep -q "^## Background Tasks" "$session_file" 2>/dev/null; then
        # Add section before Workflow Tracking if present, otherwise at end
        if grep -q "^## Workflow Tracking" "$session_file"; then
            # Insert before Workflow Tracking using awk
            awk '/^## Workflow Tracking/ {
                print "## Background Tasks\n"
                print "| Task ID | Type | Started | Status | Description |"
                print "|---------|------|---------|--------|-------------|"
                print ""
            } {print}' "$session_file" > "${session_file}.tmp" && mv "${session_file}.tmp" "$session_file"
        else
            # Append to end
            cat >> "$session_file" << EOF

## Background Tasks

| Task ID | Type | Started | Status | Description |
|---------|------|---------|--------|-------------|
EOF
        fi
    fi

    # Add task row after the table header
    awk -v tid="$task_id" -v stype="$subagent_type" -v ts="$timestamp" -v desc="$description" '
        /^\|[-]+\|/ && in_section {
            print
            print "| " tid " | " stype " | " ts " | running | " desc " |"
            next
        }
        /^## Background Tasks/ { in_section=1 }
        /^## / && !/^## Background Tasks/ { in_section=0 }
        { print }
    ' "$session_file" > "${session_file}.tmp" && mv "${session_file}.tmp" "$session_file"

    echo "Added background task: $task_id ($subagent_type)"
}

# Update background task status
# Status: running, completed, error
bg_task_update() {
    local session_file="$1"
    local task_id="$2"
    local new_status="$3"

    if [[ ! -f "$session_file" ]]; then
        echo "ERROR: Session file not found: $session_file" >&2
        return 1
    fi

    if ! grep -q "| $task_id |" "$session_file" 2>/dev/null; then
        echo "WARNING: Task $task_id not found in session file" >&2
        return 0
    fi

    # Update the status column for this task
    sed -i '' "s/| $task_id |\\([^|]*\\)|\\([^|]*\\)| running |/| $task_id |\\1|\\2| $new_status |/" "$session_file"
    echo "Updated task $task_id: $new_status"
}

# Remove completed and error tasks from session file
bg_task_cleanup() {
    local session_file="$1"

    if [[ ! -f "$session_file" ]]; then
        echo "ERROR: Session file not found: $session_file" >&2
        return 1
    fi

    # Count tasks to remove
    local completed_count
    completed_count=$(_count_matches "| completed |" "$session_file")
    local error_count
    error_count=$(_count_matches "| error |" "$session_file")

    if [[ "$completed_count" -gt 0 ]] || [[ "$error_count" -gt 0 ]]; then
        sed -i '' '/| completed |/d' "$session_file"
        sed -i '' '/| error |/d' "$session_file"
        echo "Cleaned up $completed_count completed, $error_count errored tasks"
    fi
}

# List active (running) background tasks
bg_task_list() {
    local session_file="$1"

    if [[ ! -f "$session_file" ]]; then
        echo "No session file"
        return 0
    fi

    local running_tasks
    running_tasks=$(grep "| running |" "$session_file" 2>/dev/null || true)

    if [[ -n "$running_tasks" ]]; then
        echo "$running_tasks"
    else
        echo "No active background tasks"
    fi
}

# Check for active background tasks (returns 0 if tasks exist, 1 if none)
# Useful for conditional logic in scripts
bg_task_check() {
    local session_file="$1"

    if [[ ! -f "$session_file" ]]; then
        return 1
    fi

    grep -q "| running |" "$session_file" 2>/dev/null
}

# Print summary of all background tasks
bg_task_summary() {
    local session_file="$1"

    if [[ ! -f "$session_file" ]]; then
        echo "No session file"
        return 0
    fi

    local running
    running=$(_count_matches "| running |" "$session_file")
    local completed
    completed=$(_count_matches "| completed |" "$session_file")
    local errored
    errored=$(_count_matches "| error |" "$session_file")

    echo "Background tasks: $running running, $completed completed, $errored errored"
}
