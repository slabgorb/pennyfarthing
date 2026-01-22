#!/usr/bin/env zsh
# Create or checkout feature branches in Pennyfarthing repos
# Idempotent, worktree-aware, branches from develop

set -e

# Load environment
if [ -f .env ]; then
    set -a; source .env; set +a
elif [ -f ../.env ]; then
    set -a; source ../.env; set +a
fi

show_help() {
    cat << EOF
Create Feature Branches - Idempotent branch creation/checkout

Usage: ./create-feature-branches.sh <branch-name> [repos]

Arguments:
  branch-name    Branch name (e.g., feat/11-2-file-preview)
  repos          Which repos to branch (default: all)
                 Options: api, ui, all

Repo Options:
  api     - Pennyfarthing-api only
  ui      - Pennyfarthing-ui only
  all     - both repos (default)

Examples:
  # All repos (default)
  ./create-feature-branches.sh feat/cross-repo-feature

  # Pennyfarthing UI only
  ./create-feature-branches.sh feat/11-2-ui-component ui

  # Pennyfarthing API only
  ./create-feature-branches.sh fix/validation-bug api

Behavior:
  - Idempotent: Checks out existing branches or creates new ones
  - Worktree-aware: Detects main checkout vs worktree
  - Always branches from develop
  - Fetches latest develop before branching

EOF
}

if [ -z "$1" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_help
    exit 0
fi

BRANCH_NAME="$1"
REPOS="${2:-all}"

# Validate repos parameter
if [[ ! "$REPOS" =~ ^(api|ui|all)$ ]]; then
    echo "❌ Error: repos must be one of: api, ui, all"
    echo "   Got: $REPOS"
    echo ""
    echo "Options:"
    echo "  api     - Pennyfarthing-api only"
    echo "  ui      - Pennyfarthing-ui only"
    echo "  all     - both repos (default)"
    exit 1
fi

# Detect if we're in a worktree
CURRENT_DIR=$(pwd)
if [[ "$CURRENT_DIR" == *"/worktrees/"* ]]; then
    # Extract worktree name from path
    WORKTREE_NAME=$(echo "$CURRENT_DIR" | sed -E 's|.*/worktrees/([^/]+).*|\1|')
    REPO_BASE="$PROJECT_ROOT/worktrees/$WORKTREE_NAME"
    echo "📂 Detected worktree: $WORKTREE_NAME"
else
    REPO_BASE="$PROJECT_ROOT"
    echo "📂 Using main checkout"
fi

# Array to track processed repos for verification
declare -a PROCESSED_REPOS

# Function to create or checkout branch in a repo
create_or_checkout_branch() {
    local repo_path=$1
    local repo_name=$2

    if [ ! -d "$repo_path" ]; then
        echo "⚠️  Skipping $repo_name: directory not found at $repo_path"
        return
    fi

    cd "$repo_path"

    echo ""
    echo "🔧 Processing $repo_name..."

    # Fetch latest from remote
    echo "   Fetching from origin..."
    git fetch origin --quiet

    # Check if branch exists locally
    if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
        echo "   ✅ Branch exists locally, checking out: $BRANCH_NAME"
        git checkout "$BRANCH_NAME"
    # Check if branch exists on remote
    elif git show-ref --verify --quiet "refs/remotes/origin/$BRANCH_NAME"; then
        echo "   ✅ Branch exists on remote, checking out and tracking: $BRANCH_NAME"
        git checkout -b "$BRANCH_NAME" "origin/$BRANCH_NAME"
    else
        # Branch doesn't exist, create from develop
        echo "   🌿 Creating new branch from develop: $BRANCH_NAME"

        # Make sure we have latest develop
        git fetch origin develop:develop --quiet 2>/dev/null || true

        # Checkout develop first
        if git show-ref --verify --quiet "refs/heads/develop"; then
            git checkout develop --quiet
            git pull origin develop --quiet
        else
            echo "   ⚠️  Local develop doesn't exist, fetching from remote"
            git fetch origin develop:develop --quiet
            git checkout develop --quiet
        fi

        # Create new branch
        git checkout -b "$BRANCH_NAME"
        echo "   ✅ Created: $BRANCH_NAME"
    fi

    # Show current status
    CURRENT_BRANCH=$(git branch --show-current)
    echo "   📍 Now on: $CURRENT_BRANCH"

    # Track this repo for verification
    PROCESSED_REPOS+=("$repo_path:$repo_name")
}

echo "🌿 Creating/checking out feature branches..."
echo "   Branch: $BRANCH_NAME"
echo "   Repos: $REPOS"

# Process repos based on selection
case "$REPOS" in
    api)
        create_or_checkout_branch "$REPO_BASE/Pennyfarthing-api" "Pennyfarthing-api"
        ;;
    ui)
        create_or_checkout_branch "$REPO_BASE/Pennyfarthing-ui" "Pennyfarthing-ui"
        ;;
    all)
        create_or_checkout_branch "$REPO_BASE/Pennyfarthing-api" "Pennyfarthing-api"
        create_or_checkout_branch "$REPO_BASE/Pennyfarthing-ui" "Pennyfarthing-ui"
        ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Verification Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Verify each processed repo
for repo_info in "${PROCESSED_REPOS[@]}"; do
    repo_path="${repo_info%%:*}"
    repo_name="${repo_info##*:}"

    if [ -d "$repo_path" ]; then
        cd "$repo_path"

        echo ""
        echo "📦 $repo_name"
        echo "   Path: $repo_path"

        # Current branch
        CURRENT_BRANCH=$(git branch --show-current)
        echo "   Branch: $CURRENT_BRANCH"

        # Check if branch matches expected
        if [ "$CURRENT_BRANCH" = "$BRANCH_NAME" ]; then
            echo "   ✅ Branch matches: $BRANCH_NAME"
        else
            echo "   ⚠️  Branch mismatch! Expected: $BRANCH_NAME, Got: $CURRENT_BRANCH"
        fi

        # Latest commit
        COMMIT_INFO=$(git log -1 --format="%h - %s" 2>/dev/null)
        echo "   Commit: $COMMIT_INFO"

        # Check remote tracking
        UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "none")
        if [ "$UPSTREAM" != "none" ]; then
            echo "   Remote: $UPSTREAM"

            # Check if up to date with remote
            git fetch origin "$CURRENT_BRANCH" --quiet 2>/dev/null || true
            LOCAL=$(git rev-parse @ 2>/dev/null)
            REMOTE=$(git rev-parse @{u} 2>/dev/null || echo "none")

            if [ "$LOCAL" = "$REMOTE" ]; then
                echo "   Status: ✅ Up to date with remote"
            elif [ "$REMOTE" = "none" ]; then
                echo "   Status: ⚠️  No remote branch yet (push needed)"
            else
                BEHIND=$(git rev-list --count HEAD..@{u} 2>/dev/null || echo "0")
                AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "0")
                if [ "$AHEAD" -gt 0 ] && [ "$BEHIND" -gt 0 ]; then
                    echo "   Status: ⚠️  Diverged ($AHEAD ahead, $BEHIND behind)"
                elif [ "$AHEAD" -gt 0 ]; then
                    echo "   Status: ⬆️  $AHEAD commit(s) ahead of remote"
                elif [ "$BEHIND" -gt 0 ]; then
                    echo "   Status: ⬇️  $BEHIND commit(s) behind remote"
                fi
            fi
        else
            echo "   Remote: none (local branch only)"
            echo "   Status: ⚠️  Not tracking remote (push with -u needed)"
        fi
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Done! All branches verified and ready."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
