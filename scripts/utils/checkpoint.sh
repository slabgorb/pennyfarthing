#!/usr/bin/env bash
# Session checkpointing utilities
# Dev: Fanny Price - "I was quiet, but I was not blind."

# Checkpoint file location
CHECKPOINT_FILE="${PROJECT_ROOT:-.}/.session/checkpoints.log"

# checkpoint_save LABEL DATA
# Save a checkpoint with timestamp
#
# Arguments:
#   LABEL - Identifier for this checkpoint
#   DATA  - Data to save (string)
#
# Format: ISO_TIMESTAMP|LABEL|DATA
#
# Example:
#   checkpoint_save "story_phase" "dev"
#   checkpoint_save "last_file" "src/main.go:42"
#
checkpoint_save() {
    local label="$1"
    local data="$2"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Ensure directory exists
    mkdir -p "$(dirname "$CHECKPOINT_FILE")"

    # Append checkpoint
    echo "${timestamp}|${label}|${data}" >> "$CHECKPOINT_FILE"
}

# checkpoint_restore LABEL
# Restore the most recent checkpoint with given label
#
# Arguments:
#   LABEL - Identifier to look up
#
# Returns:
#   Outputs the data portion of the most recent matching checkpoint
#   Empty if no match found
#
# Example:
#   phase=$(checkpoint_restore "story_phase")
#
checkpoint_restore() {
    local label="$1"

    if [[ ! -f "$CHECKPOINT_FILE" ]]; then
        return 0
    fi

    # Find entries with matching label, take the last one, extract data field
    # Use || true to handle case where grep finds no matches
    grep "|${label}|" "$CHECKPOINT_FILE" 2>/dev/null | tail -1 | cut -d'|' -f3- || true
}

# checkpoint_list
# List recent checkpoints (last 20)
#
# Example:
#   checkpoint_list
#
checkpoint_list() {
    if [[ -f "$CHECKPOINT_FILE" ]]; then
        tail -20 "$CHECKPOINT_FILE"
    fi
}

# checkpoint_clear
# Remove all checkpoints
#
# Example:
#   checkpoint_clear
#
checkpoint_clear() {
    rm -f "$CHECKPOINT_FILE"
}

# checkpoint_rotate MAX_LINES
# Rotate checkpoint file to prevent unbounded growth
#
# Arguments:
#   MAX_LINES - Maximum lines to keep (default: 1000)
#
# Example:
#   checkpoint_rotate 500
#
checkpoint_rotate() {
    local max_lines=${1:-1000}

    if [[ ! -f "$CHECKPOINT_FILE" ]]; then
        return 0
    fi

    local current_lines
    current_lines=$(wc -l < "$CHECKPOINT_FILE")

    if ((current_lines > max_lines)); then
        local temp_file
        temp_file=$(mktemp)
        tail -n "$max_lines" "$CHECKPOINT_FILE" > "$temp_file"
        mv "$temp_file" "$CHECKPOINT_FILE"
    fi
}

# Export functions for use when sourced (optional, may fail in some shells)
if [[ "${BASH_VERSINFO[0]:-0}" -ge 4 ]]; then
    export -f checkpoint_save 2>/dev/null || :
    export -f checkpoint_restore 2>/dev/null || :
    export -f checkpoint_list 2>/dev/null || :
    export -f checkpoint_clear 2>/dev/null || :
    export -f checkpoint_rotate 2>/dev/null || :
fi
