#!/bin/bash
# install-git-hooks.sh - Install Pennyfarthing git hooks for framework development
#
# Usage: ./pennyfarthing-dist/scripts/install-git-hooks.sh
#
# For the pennyfarthing framework repo and orchestrator repos that inline it.
# End-user projects use `pennyfarthing init` which copies hooks from node_modules.
# This script creates .d/ directories with symlinks so hook changes in
# pennyfarthing-dist/ take effect immediately.

set -euo pipefail

# Self-locate and set up PROJECT_ROOT
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/../lib/find-root.sh"
HOOKS_SOURCE="$PROJECT_ROOT/pennyfarthing-dist/scripts/hooks"
HOOKS_DEST="$PROJECT_ROOT/.git/hooks"

DISPATCHER_MARKER="pennyfarthing-dispatcher"
PF_PREFIX="10"
MIGRATED_PREFIX="50"

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

echo "Installing git hooks with .d/ dispatcher pattern..."
echo "  Source: pennyfarthing-dist/scripts/hooks/"
echo "  Dest:   .git/hooks/"
echo ""

# Shared dispatcher template — single source of truth
DISPATCHER_TEMPLATE="$PROJECT_ROOT/pennyfarthing-dist/scripts/hooks/dispatcher-template.sh"

if [[ ! -f "$DISPATCHER_TEMPLATE" ]]; then
    echo "Error: dispatcher-template.sh not found at $DISPATCHER_TEMPLATE"
    exit 1
fi

# Generate a dispatcher script for a given hook name
generate_dispatcher() {
    local hook_name="$1"
    sed "s/__HOOK_NAME__/${hook_name}/g" "$DISPATCHER_TEMPLATE"
}

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
    d_dir="$HOOKS_DEST/${dest_name}.d"
    pf_hook_name="${PF_PREFIX}-pennyfarthing-${dest_name}.sh"
    pf_hook_path="${d_dir}/${pf_hook_name}"

    if [[ ! -f "$source_path" ]]; then
        echo "  SKIP $dest_name (source not found)"
        continue
    fi

    # Create .d/ directory
    mkdir -p "$d_dir"

    # Handle existing hook at the dest path
    if [[ -e "$dest_path" ]]; then
        if [[ -f "$dest_path" ]] && grep -q "$DISPATCHER_MARKER" "$dest_path" 2>/dev/null; then
            echo "  OK   $dest_name dispatcher (already installed)"
        elif [[ -L "$dest_path" ]]; then
            # Old-style symlink — migrate to .d/ pattern
            rm "$dest_path"
            generate_dispatcher "$dest_name" > "$dest_path"
            chmod 755 "$dest_path"
            echo "  UPD  $dest_name → dispatcher"
        elif [[ -f "$dest_path" ]]; then
            existing_content="$(cat "$dest_path")"
            if echo "$existing_content" | grep -q "pennyfarthing"; then
                # Old pennyfarthing single-file hook — replace with dispatcher
                generate_dispatcher "$dest_name" > "$dest_path"
                chmod 755 "$dest_path"
                echo "  UPD  $dest_name → dispatcher (was single-file pf hook)"
            else
                # Non-pennyfarthing hook — migrate into .d/
                migrated_name="${MIGRATED_PREFIX}-migrated-${dest_name}.sh"
                migrated_path="${d_dir}/${migrated_name}"
                if [[ ! -f "$migrated_path" ]]; then
                    mv "$dest_path" "$migrated_path"
                    chmod 755 "$migrated_path"
                    echo "  MIG  $dest_name → ${dest_name}.d/${migrated_name}"
                fi
                generate_dispatcher "$dest_name" > "$dest_path"
                chmod 755 "$dest_path"
                echo "  NEW  $dest_name dispatcher"
            fi
        fi
    else
        # No existing hook — install fresh dispatcher
        generate_dispatcher "$dest_name" > "$dest_path"
        chmod 755 "$dest_path"
        echo "  NEW  $dest_name dispatcher"
    fi

    # Symlink pennyfarthing hook into .d/ (framework dev — symlink for live edits)
    # From .git/hooks/{hook}.d/ we need ../../.../pennyfarthing-dist/scripts/hooks/
    relative_path="../../../pennyfarthing-dist/scripts/hooks/$source_file"

    if [[ -L "$pf_hook_path" ]]; then
        current_target=$(readlink "$pf_hook_path")
        if [[ "$current_target" == "$relative_path" ]]; then
            echo "  OK   ${dest_name}.d/${pf_hook_name} (already linked)"
        else
            rm "$pf_hook_path"
            ln -sf "$relative_path" "$pf_hook_path"
            echo "  UPD  ${dest_name}.d/${pf_hook_name} → $relative_path"
        fi
    elif [[ -f "$pf_hook_path" ]]; then
        # Regular file — replace with symlink for dev
        rm "$pf_hook_path"
        ln -sf "$relative_path" "$pf_hook_path"
        echo "  UPD  ${dest_name}.d/${pf_hook_name} → $relative_path (was copy)"
    else
        ln -sf "$relative_path" "$pf_hook_path"
        echo "  NEW  ${dest_name}.d/${pf_hook_name} → $relative_path"
    fi
done

echo ""
echo "Done. Verify with: ls -la .git/hooks/*.d/"
