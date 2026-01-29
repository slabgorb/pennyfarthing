#!/bin/bash
# pre-push.sh - Git hook to remind about Jira sync before push
#
# Checks if sprint files were modified and reminds to sync to Jira.
#
# Installation:
#   Installed to .git/hooks/pre-push by pennyfarthing init or doctor --fix
#   Or symlink: ln -sf ../../pennyfarthing-dist/scripts/hooks/pre-push.sh .git/hooks/pre-push

set -uo pipefail

# Self-locate and set up PROJECT_ROOT
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd -P)"
if ! source "$SCRIPT_DIR/../lib/find-root.sh" 2>/dev/null; then
    exit 0
fi

SPRINT_FILE="$PROJECT_ROOT/sprint/current-sprint.yaml"

# Check if there are uncommitted changes to sprint file
if git diff --name-only | grep -q "sprint/current-sprint.yaml"; then
    echo "Warning: current-sprint.yaml has uncommitted changes"
    echo "   Consider committing before pushing"
    echo ""
fi

# Get the range of commits being pushed
REMOTE="$1"
URL="$2"

while read local_ref local_sha remote_ref remote_sha; do
    if [ "$local_sha" != "0000000000000000000000000000000000000000" ]; then
        # Check if sprint file changed in this push
        if git diff --name-only "$remote_sha..$local_sha" 2>/dev/null | grep -q "sprint/current-sprint.yaml"; then
            echo "Sprint changes detected in push"
            echo "   Reminder: Sync to Jira if story statuses changed"
            echo ""
        fi
    fi
done

exit 0
