#!/bin/bash
# Worktree management utilities for parallel development work
# Usage: worktree-manager.sh {create|remove|list|status|ports|cd} [args]
#
# Requires environment variables (set in .claude/project/hooks/setup-env.sh):
#   API_REPO - Name of the API repository (e.g., "conductor-api")
#   UI_REPO  - Name of the UI repository (e.g., "conductor-ui")

set -e

# Load environment
if [ -f .env ]; then
    set -a; source .env; set +a
elif [ -f ../.env ]; then
    set -a; source ../.env; set +a
fi

# Source project hooks if available
if [ -f "$PROJECT_ROOT/.claude/project/hooks/setup-env.sh" ]; then
    source "$PROJECT_ROOT/.claude/project/hooks/setup-env.sh"
fi

PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
WORKTREE_ROOT="${WORKTREE_ROOT:-$PROJECT_ROOT/worktrees}"
WORKTREE_PORT_OFFSET="${WORKTREE_PORT_OFFSET:-100}"

# Validate required environment variables
if [ -z "$API_REPO" ] || [ -z "$UI_REPO" ]; then
    echo "❌ Error: API_REPO and UI_REPO environment variables must be set"
    echo ""
    echo "Set these in .claude/project/hooks/setup-env.sh:"
    echo "  export API_REPO=\"your-api-repo\""
    echo "  export UI_REPO=\"your-ui-repo\""
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

Examples:
  # Create worktree for story 5-1a (both API and UI)
  ./scripts/worktree-manager.sh create 5-1a feat/5-1a-file-upload

  # Create worktree for API-only bug fix
  ./scripts/worktree-manager.sh create bug-123 fix/bug-123-validation api

  # Get ports for running dev servers
  eval \$(./scripts/worktree-manager.sh ports 5-1a)
  echo "API: \$API_PORT, UI: \$UI_PORT"

  # Remove worktree after merge
  ./scripts/worktree-manager.sh remove 5-1a

Naming Conventions:
  - Use underscores for consistency: wt_5_1a, wt_5_2, etc.
  - Feature: wt_5_1a, wt_5_2 (wt_epic_story format)
  - Bug: wt_bug_123, wt_bug_456
  - Chore: wt_chore_deps, wt_chore_cleanup
  - Review: wt_review_42 (PR number)

Session Files:
  - Main checkout: .session/current_work.md
  - Worktree: .session/current_work_wt_5_1a.md (matches worktree name)

Environment Variables:
  API_REPO - Name of API repository (required)
  UI_REPO  - Name of UI repository (required)
  PROJECT_ROOT - Project root directory
  WORKTREE_ROOT - Where worktrees are created (default: \$PROJECT_ROOT/worktrees)
  WORKTREE_PORT_OFFSET - Port offset between worktrees (default: 100)

EOF
}

create_worktree() {
    local WT_NAME="$1"
    local BRANCH="$2"
    local REPOS="${3:-both}"  # api, ui, or both

    if [ -z "$WT_NAME" ] || [ -z "$BRANCH" ]; then
        echo "❌ Usage: worktree-manager.sh create <name> <branch> [api|ui|both]"
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
    echo ""

    # Create API worktree
    if [ "$REPOS" = "api" ] || [ "$REPOS" = "both" ]; then
        if [ -d "$PROJECT_ROOT/$API_REPO" ]; then
            echo "📦 Creating API worktree ($API_REPO)..."
            cd "$PROJECT_ROOT/$API_REPO"

            # Check if branch exists
            if git show-ref --verify --quiet "refs/heads/$BRANCH" 2>/dev/null; then
                git worktree add "$WT_PATH/$API_REPO" "$BRANCH"
            elif git show-ref --verify --quiet "refs/remotes/origin/$BRANCH" 2>/dev/null; then
                git worktree add "$WT_PATH/$API_REPO" "$BRANCH"
            else
                # Create new branch from develop
                git worktree add -b "$BRANCH" "$WT_PATH/$API_REPO" develop
            fi
            echo "   ✅ API worktree created"
        else
            echo "   ⚠️  API repo not found: $PROJECT_ROOT/$API_REPO"
        fi
    fi

    # Create UI worktree
    if [ "$REPOS" = "ui" ] || [ "$REPOS" = "both" ]; then
        if [ -d "$PROJECT_ROOT/$UI_REPO" ]; then
            echo "📦 Creating UI worktree ($UI_REPO)..."
            cd "$PROJECT_ROOT/$UI_REPO"

            # Check if branch exists
            if git show-ref --verify --quiet "refs/heads/$BRANCH" 2>/dev/null; then
                git worktree add "$WT_PATH/$UI_REPO" "$BRANCH"
            elif git show-ref --verify --quiet "refs/remotes/origin/$BRANCH" 2>/dev/null; then
                git worktree add "$WT_PATH/$UI_REPO" "$BRANCH"
            else
                # Create new branch from develop
                git worktree add -b "$BRANCH" "$WT_PATH/$UI_REPO" develop
            fi
            echo "   ✅ UI worktree created"
        else
            echo "   ⚠️  UI repo not found: $PROJECT_ROOT/$UI_REPO"
        fi
    fi

    # Note: Session file should be created by SM agent with story details
    # Session file naming matches worktree: current_work_wt_{name}.md
    local SESSION_FILE="$PROJECT_ROOT/.session/current_work_$WT_NAME.md"
    if [ ! -f "$SESSION_FILE" ]; then
        echo ""
        echo "📝 Session file location: .session/current_work_$WT_NAME.md"
        echo "   (SM agent should create this with story details)"
    fi

    echo ""
    echo "✅ Worktree '$WT_NAME' created successfully!"
    echo ""
    echo "Next steps:"
    echo "  cd $WT_PATH/$API_REPO   # Work on API"
    echo "  cd $WT_PATH/$UI_REPO    # Work on UI"
    echo ""
    echo "Start dev servers with custom ports:"
    echo "  eval \$(./scripts/worktree-manager.sh ports $WT_NAME)"
    echo "  cd $WT_PATH/$API_REPO && API_PORT=\$API_PORT make dev"
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

    # Remove API worktree
    if [ -d "$WT_PATH/$API_REPO" ]; then
        echo "   Removing API worktree..."
        cd "$PROJECT_ROOT/$API_REPO"
        git worktree remove "$WT_PATH/$API_REPO" --force 2>/dev/null || true
    fi

    # Remove UI worktree
    if [ -d "$WT_PATH/$UI_REPO" ]; then
        echo "   Removing UI worktree..."
        cd "$PROJECT_ROOT/$UI_REPO"
        git worktree remove "$WT_PATH/$UI_REPO" --force 2>/dev/null || true
    fi

    # Clean up directory
    rm -rf "$WT_PATH"

    # Remove session file (new naming convention)
    local SESSION_FILE="$PROJECT_ROOT/.session/current_work_$WT_NAME.md"
    if [ -f "$SESSION_FILE" ]; then
        rm -f "$SESSION_FILE"
        echo "   Removed session file: current_work_$WT_NAME.md"
    fi

    # Also check for legacy naming (wt-{name}.md)
    local LEGACY_SESSION="$PROJECT_ROOT/.session/wt-$WT_NAME.md"
    if [ -f "$LEGACY_SESSION" ]; then
        rm -f "$LEGACY_SESSION"
        echo "   Removed legacy session file: wt-$WT_NAME.md"
    fi

    # Prune worktree references
    cd "$PROJECT_ROOT/$API_REPO" && git worktree prune 2>/dev/null || true
    cd "$PROJECT_ROOT/$UI_REPO" && git worktree prune 2>/dev/null || true

    echo ""
    echo "✅ Worktree '$WT_NAME' removed successfully!"
}

list_worktrees() {
    echo "=== Active Worktrees ==="
    echo ""

    if [ -d "$PROJECT_ROOT/$API_REPO" ]; then
        echo "📦 API Worktrees ($API_REPO):"
        cd "$PROJECT_ROOT/$API_REPO" && git worktree list
        echo ""
    fi

    if [ -d "$PROJECT_ROOT/$UI_REPO" ]; then
        echo "📦 UI Worktrees ($UI_REPO):"
        cd "$PROJECT_ROOT/$UI_REPO" && git worktree list
        echo ""
    fi

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

            if [ -d "$wt/$API_REPO" ]; then
                local API_BRANCH=$(cd "$wt/$API_REPO" && git branch --show-current 2>/dev/null || echo "unknown")
                local API_STATUS=$(cd "$wt/$API_REPO" && git status --short 2>/dev/null | wc -l | tr -d ' ')
                echo "   API: $API_BRANCH ($API_STATUS uncommitted)"
            fi

            if [ -d "$wt/$UI_REPO" ]; then
                local UI_BRANCH=$(cd "$wt/$UI_REPO" && git branch --show-current 2>/dev/null || echo "unknown")
                local UI_STATUS=$(cd "$wt/$UI_REPO" && git status --short 2>/dev/null | wc -l | tr -d ' ')
                echo "   UI:  $UI_BRANCH ($UI_STATUS uncommitted)"
            fi

            # Check for session file (new naming first, then legacy)
            if [ -f "$PROJECT_ROOT/.session/current_work_$WT_NAME.md" ]; then
                echo "   Session: ✅ .session/current_work_$WT_NAME.md"
            elif [ -f "$PROJECT_ROOT/.session/wt-$WT_NAME.md" ]; then
                echo "   Session: ⚠️  .session/wt-$WT_NAME.md (legacy naming)"
            else
                echo "   Session: ❌ (no session file)"
            fi

            # Show ports
            local WT_INDEX=$(ls -1 "$WORKTREE_ROOT" 2>/dev/null | grep -n "^$WT_NAME$" | cut -d: -f1)
            WT_INDEX=${WT_INDEX:-1}
            local OFFSET=$((WT_INDEX * WORKTREE_PORT_OFFSET))
            echo "   Ports: API=$((8080 + OFFSET)), UI=$((5173 + OFFSET))"
            echo ""
        fi
    done
}

get_ports() {
    local WT_NAME="$1"

    if [ -z "$WT_NAME" ]; then
        echo "❌ Usage: worktree-manager.sh ports <name>"
        exit 1
    fi

    # Calculate port offset based on worktree index
    local WT_INDEX=$(ls -1 "$WORKTREE_ROOT" 2>/dev/null | grep -n "^$WT_NAME$" | cut -d: -f1)
    WT_INDEX=${WT_INDEX:-1}
    local OFFSET=$((WT_INDEX * WORKTREE_PORT_OFFSET))

    # Output as shell variables (can be eval'd)
    echo "export API_PORT=$((8080 + OFFSET))"
    echo "export UI_PORT=$((5173 + OFFSET))"
    echo "export WS_PORT=$((8081 + OFFSET))"
    echo "export WORKTREE_PATH=$WORKTREE_ROOT/$WT_NAME"
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
