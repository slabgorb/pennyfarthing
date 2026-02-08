#!/bin/bash
# install-git-hooks.sh - Install Pennyfarthing git hooks for framework development
#
# Usage: ./pennyfarthing-dist/scripts/install-git-hooks.sh
#
# For the pennyfarthing framework repo and orchestrator repos that inline it.
# End-user projects use `pennyfarthing init` which copies hooks from node_modules.
# This script creates symlinks so hook changes in pennyfarthing-dist/ take effect immediately.

set -euo pipefail

# Self-locate and set up PROJECT_ROOT
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/../lib/find-root.sh"
HOOKS_SOURCE="$PROJECT_ROOT/pennyfarthing-dist/scripts/hooks"
HOOKS_DEST="$PROJECT_ROOT/.git/hooks"

# Check we're in a repo with pennyfarthing-dist (framework or orchestrator)
if [[ ! -d "$PROJECT_ROOT/pennyfarthing-dist" ]]; then
    echo "Error: This script requires pennyfarthing-dist/ at the project root"
    echo "       (framework repo or orchestrator with inlined pennyfarthing/)"
    echo "       End-user projects should use: pennyfarthing init"
    exit 1
fi

# Check .git exists
if [[ ! -d "$PROJECT_ROOT/.git" ]]; then
    echo "Error: Not a git repository"
    exit 1
fi

echo "Installing git hooks for dogfooding..."
echo "  Source: pennyfarthing-dist/scripts/hooks/"
echo "  Dest:   .git/hooks/"
echo ""

# Define hooks to install
HOOKS=(
    "pre-commit.sh:pre-commit"
    "pre-push.sh:pre-push"
    "post-merge.sh:post-merge"
)

for hook_pair in "${HOOKS[@]}"; do
    source_file="${hook_pair%%:*}"
    dest_name="${hook_pair##*:}"

    source_path="$HOOKS_SOURCE/$source_file"
    dest_path="$HOOKS_DEST/$dest_name"

    if [[ ! -f "$source_path" ]]; then
        echo "  SKIP $dest_name (source not found)"
        continue
    fi

    # Create relative symlink
    # From .git/hooks/ we need to go ../../pennyfarthing-dist/scripts/hooks/
    relative_path="../../pennyfarthing-dist/scripts/hooks/$source_file"

    if [[ -L "$dest_path" ]]; then
        # Already a symlink - check if it points to our file
        current_target=$(readlink "$dest_path")
        if [[ "$current_target" == "$relative_path" ]]; then
            echo "  OK   $dest_name (already installed)"
            continue
        fi
        # Different symlink - remove and recreate
        rm "$dest_path"
    elif [[ -f "$dest_path" ]]; then
        # Regular file - backup first
        backup_path="${dest_path}.backup"
        mv "$dest_path" "$backup_path"
        echo "  BACK $dest_name -> ${dest_name}.backup"
    fi

    ln -sf "$relative_path" "$dest_path"
    echo "  NEW  $dest_name -> $relative_path"
done

echo ""
echo "Done. Verify with: ls -la .git/hooks/ | grep -v sample"
