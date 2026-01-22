#!/usr/bin/env zsh
# Worktree management utilities for parallel development work
# Usage: worktree-manager.sh {create|remove|list|status|ports|cd} [args]
#
# Configuration (choose one):
#   1. repos.yaml: Define repos in .claude/project/repos.yaml (recommended)
#   2. Legacy env vars: Set API_REPO and UI_REPO in .claude/project/hooks/setup-env.sh

set -e

# Load environment
if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a; source "$PROJECT_ROOT/.env"; set +a
fi

# Source project hooks if available
if [ -f "$PROJECT_ROOT/.claude/project/hooks/setup-env.sh" ]; then
    source "$PROJECT_ROOT/.claude/project/hooks/setup-env.sh"
fi

# Source repo utilities (handles repos.yaml or legacy env vars)
REPO_UTILS_LAZY=1  # Don't auto-load, we'll do it after validation
source "$PROJECT_ROOT/scripts/repo-utils.sh"

WORKTREE_ROOT="${WORKTREE_ROOT:-$PROJECT_ROOT/worktrees}"
WORKTREE_PORT_OFFSET="${WORKTREE_PORT_OFFSET:-100}"

# ============================================================================
# Services Configuration
# ============================================================================

# Load services configuration from pennyfarthing-settings.yaml
# Sets: _SERVICES_JSON, _PORT_OFFSET
# Returns 1 if no services configured
load_services_config() {
    local config_file="${PROJECT_ROOT}/.claude/project/pennyfarthing-settings.yaml"

    if [[ ! -f "$config_file" ]]; then
        _SERVICES_JSON=""
        _PORT_OFFSET=$WORKTREE_PORT_OFFSET
        return 1
    fi

    # Parse services config using yq (preferred) or Python fallback
    local config
    if command -v yq &>/dev/null; then
        # Check if services section exists
        local has_services
        has_services=$(yq '.services.definitions' "$config_file" 2>/dev/null)
        if [[ -z "$has_services" || "$has_services" == "null" ]]; then
            _SERVICES_JSON=""
            _PORT_OFFSET=$WORKTREE_PORT_OFFSET
            return 1
        fi

        local port_offset
        port_offset=$(yq '.services.port_offset // 100' "$config_file" 2>/dev/null)
        local definitions_json
        definitions_json=$(yq -o=json '.services.definitions' "$config_file" 2>/dev/null)

        _PORT_OFFSET=$port_offset
        _SERVICES_JSON="$definitions_json"
        return 0
    elif command -v python3 &>/dev/null; then
        config=$(python3 -c "
import yaml
import json
import sys

try:
    with open('$config_file', 'r') as f:
        settings = yaml.safe_load(f)

    if not settings or 'services' not in settings or 'definitions' not in settings['services']:
        sys.exit(1)

    svc = settings['services']
    port_offset = svc.get('port_offset', ${WORKTREE_PORT_OFFSET})
    definitions = svc['definitions']

    # Ensure env_var is set for each service
    for d in definitions:
        if 'env_var' not in d:
            d['env_var'] = d['name'].upper().replace(' ', '_').replace('-', '_') + '_PORT'

    print(f'_PORT_OFFSET={port_offset}')
    print(f\"_SERVICES_JSON='{json.dumps(definitions)}'\")
except Exception:
    sys.exit(1)
" 2>/dev/null)

        if [[ $? -eq 0 && -n "$config" ]]; then
            eval "$config"
            return 0
        fi
    fi

    _SERVICES_JSON=""
    _PORT_OFFSET=$WORKTREE_PORT_OFFSET
    return 1
}

# Load and validate repo configuration
load_repos_config

if [ "$(get_repo_count)" -eq 0 ]; then
    echo "❌ Error: No repositories configured"
    echo ""
    echo "Option 1: Create .claude/project/repos.yaml (recommended for multi-repo projects)"
    echo "Option 2: Set API_REPO and UI_REPO in .claude/project/hooks/setup-env.sh"
    exit 1
fi

# Ensure worktree root exists
mkdir -p "$WORKTREE_ROOT"

show_help() {
    cat << EOF
Worktree Manager - Parallel Development Tool

Usage: worktree-manager.sh <command> [options]

Commands:
  create <name> <branch> [repos]   Create worktree(s) for parallel work
  remove <name>                    Remove worktree and clean up
  list                             List all active worktrees
  status                           Show detailed worktree status
  ports <name>                     Get port configuration for worktree
  cd <name>                        Print path to worktree (use with: cd \$(./scripts/worktree-manager.sh cd <name>))
  config                           Show current repo configuration

Examples:
  # Create worktree for all repos
  ./scripts/worktree-manager.sh create 5-1a feat/5-1a-file-upload

  # Create worktree for specific repo type
  ./scripts/worktree-manager.sh create bug-123 fix/bug-123-validation api

  # Create worktree for specific repos (comma-separated)
  ./scripts/worktree-manager.sh create feat-x feat/x-feature adapter-a,adapter-b

  # Get ports for running dev servers
  eval \$(./scripts/worktree-manager.sh ports 5-1a)
  echo "API: \$API_PORT, UI: \$UI_PORT"

  # Remove worktree after merge
  ./scripts/worktree-manager.sh remove 5-1a

  # Show repo configuration
  ./scripts/worktree-manager.sh config

Repos Filter (third argument):
  all           - All configured repos (default)
  api           - Only repos of type 'api'
  ui            - Only repos of type 'ui'
  adapter       - Only repos of type 'adapter'
  service       - Only repos of type 'service'
  repo1,repo2   - Comma-separated list of specific repo names

Configuration:
  Option 1 (recommended): Create .claude/project/repos.yaml
  Option 2 (legacy): Set API_REPO and UI_REPO environment variables

Session Files:
  Session files are named after story IDs: .session/{story-id}-session.md
  Example: .session/5-1a-session.md (with worktree field inside)
  Session files are managed by SM agent, not worktree-manager.

Environment Variables:
  PROJECT_ROOT - Project root directory
  WORKTREE_ROOT - Where worktrees are created (default: \$PROJECT_ROOT/worktrees)
  WORKTREE_PORT_OFFSET - Port offset between worktrees (default: 100)

EOF
}

create_worktree() {
    local WT_NAME="$1"
    local BRANCH="$2"
    local REPOS_FILTER="${3:-all}"  # all, api, ui, adapter, service, or comma-separated names

    if [ -z "$WT_NAME" ] || [ -z "$BRANCH" ]; then
        echo "❌ Usage: worktree-manager.sh create <name> <branch> [repos-filter]"
        echo "   repos-filter: all, api, ui, adapter, service, or comma-separated names"
        exit 1
    fi

    local WT_PATH="$WORKTREE_ROOT/$WT_NAME"

    # Check if worktree already exists
    if [ -d "$WT_PATH" ]; then
        echo "❌ Worktree '$WT_NAME' already exists at $WT_PATH"
        exit 1
    fi

    mkdir -p "$WT_PATH"

    echo "🔧 Creating worktree: $WT_NAME"
    echo "   Branch: $BRANCH"
    echo "   Path: $WT_PATH"
    echo "   Repos: $REPOS_FILTER"
    echo ""

    # Get repos to create worktrees for (handle legacy 'both' as 'all')
    local repos_filter="$REPOS_FILTER"
    [ "$repos_filter" = "both" ] && repos_filter="all"

    local repos_to_create
    repos_to_create=$(filter_repos "$repos_filter")

    local created_repos=()

    while IFS= read -r repo; do
        [ -z "$repo" ] && continue

        local repo_path
        repo_path=$(get_repo_path "$repo")
        local full_path="$PROJECT_ROOT/$repo_path"
        local repo_type
        repo_type=$(get_repo_type "$repo")

        if [ -d "$full_path" ]; then
            echo "📦 Creating worktree for $repo ($repo_type)..."
            cd "$full_path"

            # Check if branch exists locally, remotely, or needs to be created
            if git show-ref --verify --quiet "refs/heads/$BRANCH" 2>/dev/null; then
                git worktree add "$WT_PATH/$repo" "$BRANCH"
            elif git show-ref --verify --quiet "refs/remotes/origin/$BRANCH" 2>/dev/null; then
                git worktree add "$WT_PATH/$repo" "$BRANCH"
            else
                # Create new branch from develop (or main if develop doesn't exist)
                local base_branch="develop"
                if ! git show-ref --verify --quiet "refs/heads/develop" 2>/dev/null; then
                    base_branch="main"
                fi
                git worktree add -b "$BRANCH" "$WT_PATH/$repo" "$base_branch"
            fi
            echo "   ✅ $repo worktree created"
            created_repos+=("$repo")
        else
            echo "   ⚠️  Repo not found: $full_path"
        fi
    done <<< "$repos_to_create"

    echo ""
    echo "✅ Worktree '$WT_NAME' created successfully!"
    echo ""
    echo "📝 Session file: Use /sm to create .session/{story-id}-session.md"
    echo ""
    echo "Next steps:"
    for repo in "${created_repos[@]}"; do
        echo "  cd $WT_PATH/$repo"
    done
    echo ""
    echo "Start dev servers with custom ports:"
    echo "  eval \$(./scripts/worktree-manager.sh ports $WT_NAME)"
}

remove_worktree() {
    local WT_NAME="$1"

    if [ -z "$WT_NAME" ]; then
        echo "❌ Usage: worktree-manager.sh remove <name>"
        exit 1
    fi

    local WT_PATH="$WORKTREE_ROOT/$WT_NAME"

    if [ ! -d "$WT_PATH" ]; then
        echo "❌ Worktree '$WT_NAME' not found at $WT_PATH"
        exit 1
    fi

    echo "🗑️  Removing worktree: $WT_NAME"

    # Remove worktrees for all configured repos
    for repo in $(get_repos); do
        local repo_path
        repo_path=$(get_repo_path "$repo")

        if [ -d "$WT_PATH/$repo" ]; then
            echo "   Removing $repo worktree..."
            cd "$PROJECT_ROOT/$repo_path"
            git worktree remove "$WT_PATH/$repo" --force 2>/dev/null || true
        fi
    done

    # Clean up directory
    rm -rf "$WT_PATH"

    # Note: Session files are managed by SM agent
    # Use /sm to finish work and archive the session file
    echo ""
    echo "   Note: Session file (if any) should be archived via /sm finish"

    # Prune worktree references for all repos
    for repo in $(get_repos); do
        local repo_path
        repo_path=$(get_repo_path "$repo")
        if [ -d "$PROJECT_ROOT/$repo_path" ]; then
            cd "$PROJECT_ROOT/$repo_path" && git worktree prune 2>/dev/null || true
        fi
    done

    echo ""
    echo "✅ Worktree '$WT_NAME' removed successfully!"
}

list_worktrees() {
    echo "=== Active Worktrees ==="
    echo ""

    for repo in $(get_repos); do
        local repo_path
        repo_path=$(get_repo_path "$repo")
        local repo_type
        repo_type=$(get_repo_type "$repo")

        if [ -d "$PROJECT_ROOT/$repo_path" ]; then
            echo "📦 $repo ($repo_type):"
            cd "$PROJECT_ROOT/$repo_path" && git worktree list
            echo ""
        fi
    done

    echo "📁 Worktree Directory:"
    if [ -d "$WORKTREE_ROOT" ] && [ "$(ls -A "$WORKTREE_ROOT" 2>/dev/null)" ]; then
        ls -la "$WORKTREE_ROOT"
    else
        echo "   (empty)"
    fi
}

show_status() {
    echo "=== Worktree Status ==="
    echo ""

    if [ ! -d "$WORKTREE_ROOT" ] || [ -z "$(ls -A "$WORKTREE_ROOT" 2>/dev/null)" ]; then
        echo "No active worktrees."
        echo ""
        echo "Create one with:"
        echo "  ./scripts/worktree-manager.sh create <name> <branch>"
        return
    fi

    for wt in "$WORKTREE_ROOT"/*/; do
        if [ -d "$wt" ]; then
            local WT_NAME=$(basename "$wt")
            echo "📁 $WT_NAME"
            echo "   Path: $wt"

            # Show status for each configured repo
            for repo in $(get_repos); do
                if [ -d "$wt/$repo" ]; then
                    local repo_type
                    repo_type=$(get_repo_type "$repo")
                    local branch=$(cd "$wt/$repo" && git branch --show-current 2>/dev/null || echo "unknown")
                    local status_count=$(cd "$wt/$repo" && git status --short 2>/dev/null | wc -l | tr -d ' ')
                    echo "   $repo ($repo_type): $branch ($status_count uncommitted)"
                fi
            done

            # Check for session files that reference this worktree
            local found_session=""
            for sf in "$PROJECT_ROOT"/.session/*-session.md; do
                if [ -f "$sf" ] && grep -q "worktree: $WT_NAME" "$sf" 2>/dev/null; then
                    found_session=$(basename "$sf")
                    break
                fi
            done
            if [ -n "$found_session" ]; then
                echo "   Session: ✅ .session/$found_session"
            else
                echo "   Session: ❌ (no session file references this worktree)"
            fi

            # Show ports (from services config)
            local WT_INDEX=$(ls -1 "$WORKTREE_ROOT" 2>/dev/null | grep -n "^$WT_NAME$" | cut -d: -f1)
            WT_INDEX=${WT_INDEX:-1}
            if load_services_config; then
                local OFFSET=$((_PORT_OFFSET * WT_INDEX))
                local ports_display
                ports_display=$(python3 -c "
import json
services = $_SERVICES_JSON
offset = $OFFSET
parts = []
for svc in services:
    name = svc['name']
    port = svc['base_port'] + offset
    parts.append(f'{name}={port}')
print(', '.join(parts))
" 2>/dev/null)
                echo "   Ports: $ports_display"
            else
                echo "   Ports: (no services configured)"
            fi
            echo ""
        fi
    done
}

get_ports() {
    local WT_NAME="$1"

    if [ -z "$WT_NAME" ]; then
        echo "# Usage: worktree-manager.sh ports <name>" >&2
        echo "# Outputs shell variables for service ports" >&2
        exit 1
    fi

    # Load services configuration
    if ! load_services_config; then
        echo "# No services configured in .claude/project/pennyfarthing-settings.yaml" >&2
        echo "# Add a 'services' section with 'definitions' array" >&2
        exit 1
    fi

    # Calculate port offset based on worktree index
    local WT_INDEX=$(ls -1 "$WORKTREE_ROOT" 2>/dev/null | grep -n "^$WT_NAME$" | cut -d: -f1)
    WT_INDEX=${WT_INDEX:-1}
    local OFFSET=$((_PORT_OFFSET * WT_INDEX))

    # Output worktree info
    echo "export WORKTREE_PATH=$WORKTREE_ROOT/$WT_NAME"
    echo "export WORKTREE_INDEX=$WT_INDEX"
    echo "export WORKTREE_PORT_OFFSET=$OFFSET"

    # Generate exports for each configured service
    python3 -c "
import json

services = $_SERVICES_JSON
offset = $OFFSET

for svc in services:
    env_var = svc.get('env_var', svc['name'].upper().replace(' ', '_').replace('-', '_') + '_PORT')
    port = svc['base_port'] + offset
    print(f'export {env_var}={port}')
" 2>/dev/null
}

get_path() {
    local WT_NAME="$1"

    if [ -z "$WT_NAME" ]; then
        echo "❌ Usage: worktree-manager.sh cd <name>"
        exit 1
    fi

    local WT_PATH="$WORKTREE_ROOT/$WT_NAME"

    if [ ! -d "$WT_PATH" ]; then
        echo "❌ Worktree '$WT_NAME' not found" >&2
        exit 1
    fi

    echo "$WT_PATH"
}

# Main command dispatch
case "${1:-help}" in
    create)
        create_worktree "$2" "$3" "$4"
        ;;
    remove|rm|delete)
        remove_worktree "$2"
        ;;
    list|ls)
        list_worktrees
        ;;
    status|st)
        show_status
        ;;
    ports)
        get_ports "$2"
        ;;
    cd|path)
        get_path "$2"
        ;;
    config)
        show_config
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "❌ Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
