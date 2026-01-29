#!/usr/bin/env zsh
# backlog.sh - Display backlog stories in a formatted table
# Usage: backlog.sh
# Reads sprint/current-sprint.yaml and outputs backlog stories

set -euo pipefail

# Self-locate and set up PROJECT_ROOT
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd -P)"
source "$SCRIPT_DIR/../lib/find-root.sh"
SPRINT_FILE="$PROJECT_ROOT/sprint/current-sprint.yaml"

if [[ ! -f "$SPRINT_FILE" ]]; then
    echo "Error: sprint/current-sprint.yaml not found" >&2
    exit 1
fi

# Parse YAML and extract backlog stories
# Output format: | Story | Title | Pts | Epic |

echo "| Story | Title | Pts | Epic |"
echo "|-------|-------|-----|------|"

# Use yq if available, otherwise fall back to grep/awk
if command -v yq &>/dev/null; then
    yq eval '
        .epics[] |
        .id as $epic_id |
        .stories[]? |
        select(.status == "backlog") |
        "| " + .id + " | " + .title + " | " + (.points | tostring) + " | " + $epic_id + " |"
    ' "$SPRINT_FILE"
else
    # Fallback: grep-based extraction
    current_epic=""
    in_stories=false

    while IFS= read -r line; do
        # Detect epic id
        if [[ "$line" =~ ^[[:space:]]*-[[:space:]]*id:[[:space:]]*(MSSCI-[0-9]+) ]]; then
            current_epic="${match[1]}"
            in_stories=false
        fi

        # Detect stories section
        if [[ "$line" =~ ^[[:space:]]*stories: ]]; then
            in_stories=true
        fi

        # Detect story with backlog status (look ahead)
        if [[ "$in_stories" == true && "$line" =~ ^[[:space:]]*-[[:space:]]*id:[[:space:]]*(MSSCI-[0-9]+) ]]; then
            story_id="${match[1]}"
            story_title=""
            story_points=""
            story_status=""

            # Read next lines for this story
            while IFS= read -r detail; do
                [[ "$detail" =~ ^[[:space:]]*-[[:space:]]*id: ]] && break
                [[ "$detail" =~ ^[[:space:]]*title:[[:space:]]*[\"\']*(.+)[\"\']*$ ]] && story_title="${match[1]}"
                [[ "$detail" =~ ^[[:space:]]*points:[[:space:]]*([0-9]+) ]] && story_points="${match[1]}"
                [[ "$detail" =~ ^[[:space:]]*status:[[:space:]]*(.+) ]] && story_status="${match[1]}"

                # If we have all fields and status is backlog, print and break
                if [[ -n "$story_title" && -n "$story_points" && "$story_status" == "backlog" ]]; then
                    echo "| $story_id | $story_title | $story_points | $current_epic |"
                    break
                fi

                # If status is not backlog, skip this story
                if [[ -n "$story_status" && "$story_status" != "backlog" ]]; then
                    break
                fi
            done
        fi
    done < "$SPRINT_FILE"
fi
