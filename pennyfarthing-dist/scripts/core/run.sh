#!/usr/bin/env zsh
# Bootstrap script - finds PROJECT_ROOT and runs the requested script
# Usage: ./scripts/run.sh <category/script-name> [args...]
#
# Scripts are organized in categorical subdirectories:
#   core/     - Essential scripts (agent-session.sh, check-context.sh)
#   workflow/ - Workflow mechanics (finish-story.sh, check.sh)
#   sprint/   - Sprint operations (sprint-status.sh, archive-story.sh)
#   story/    - Story operations (create-story.sh, size-story.sh)
#   jira/     - Jira integration (jira-claim-story.sh, jira-reconcile.sh)
#   git/      - Git operations (create-feature-branches.sh, release.sh)
#   theme/    - Theme operations (list-themes.sh)
#   test/     - Test infrastructure (test-setup.sh)
#   lib/      - Shared libraries (common.sh, logging.sh)
#   misc/     - Uncategorized utilities
#   hooks/    - Git and Claude hooks
#
# Full paths are REQUIRED to avoid ambiguity:
#   ./scripts/run.sh core/agent-session.sh start sm
#   ./scripts/run.sh jira/jira-claim-story.sh MSSCI-12345
#
# This solves the absolute path problem by:
# 1. Finding PROJECT_ROOT by looking for the .pennyfarthing/ directory
# 2. Exporting PROJECT_ROOT for the script to use
# 3. Running the script with full absolute paths

set -euo pipefail

# Find PROJECT_ROOT by looking for .pennyfarthing/ marker
find_project_root() {
    local dir="$PWD"
    while [[ ! -d "$dir/.pennyfarthing" ]] && [[ "$dir" != "/" ]]; do
        dir="$(dirname "$dir")"
    done
    if [[ -d "$dir/.pennyfarthing" ]]; then
        echo "$dir"
    else
        echo "Error: Could not find project root (no .pennyfarthing/ directory found)" >&2
        exit 1
    fi
}

PROJECT_ROOT="$(find_project_root)"
export PROJECT_ROOT

# Get the script to run
if [[ $# -lt 1 ]]; then
    echo "Usage: ./scripts/run.sh <category/script-name> [args...]" >&2
    echo "Example: ./scripts/run.sh core/agent-session.sh start sm" >&2
    echo "Example: ./scripts/run.sh jira/jira-claim-story.sh MSSCI-12345" >&2
    exit 1
fi

SCRIPT_NAME="$1"
shift

# Single source of truth: .pennyfarthing/scripts
SCRIPTS_DIR="$PROJECT_ROOT/.pennyfarthing/scripts"
if [[ ! -d "$SCRIPTS_DIR" ]]; then
    echo "Error: Scripts directory not found: $SCRIPTS_DIR" >&2
    exit 1
fi

# Full path required - script must include category
SCRIPT_PATH="$SCRIPTS_DIR/$SCRIPT_NAME"

# Python-first dispatch: prefer .py over .sh when available
# This enables transparent migration of shell scripts to Python
SCRIPT_BASE="${SCRIPT_NAME%.sh}"
PYTHON_PATH="$SCRIPTS_DIR/${SCRIPT_BASE}.py"

if [[ -f "$PYTHON_PATH" ]] && command -v python3 &>/dev/null; then
    exec python3 "$PYTHON_PATH" "$@"
fi

if [[ -f "$SCRIPT_PATH" ]]; then
    exec "$SCRIPT_PATH" "$@"
else
    echo "Error: Script not found: $SCRIPT_NAME" >&2
    echo "Full path required. Available categories:" >&2
    echo "  core/, workflow/, sprint/, story/, jira/, git/, theme/, test/, lib/, misc/, hooks/, cyclist/" >&2
    echo "Example: run.sh core/agent-session.sh start sm" >&2
    exit 1
fi
