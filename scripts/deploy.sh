#!/usr/bin/env zsh
set -euo pipefail

# Deploy script for Pennyfarthing
# Usage: ./scripts/deploy.sh [OPTIONS] <major|minor|patch>
#
# Options:
#   -y, --yes       Skip confirmation prompt
#   --dry-run       Show what would happen without executing
#
# Steps:
# 1. Bump version in VERSION, package.json, README.md
# 2. Commit version bump to current branch
# 3. Merge to develop (if not already on develop)
# 4. Merge develop to main
# 5. Tag the release on main
# 6. Push everything (develop, main, tags)
# 7. Return to develop

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
VERSION_FILE="$PROJECT_ROOT/VERSION"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_dry() { echo -e "${YELLOW}[DRY-RUN]${NC} $1"; }

# Parse arguments
BUMP_TYPE=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        major|minor|patch)
            BUMP_TYPE="$1"
            shift
            ;;
        *)
            echo "Usage: $0 [--dry-run] <major|minor|patch>"
            echo ""
            echo "Options:"
            echo "  --dry-run    Show what would happen without executing"
            echo ""
            echo "Examples:"
            echo "  $0 patch           # 1.2.3 -> 1.2.4"
            echo "  $0 minor           # 1.2.3 -> 1.3.0"
            echo "  $0 major --dry-run # Preview major bump"
            exit 1
            ;;
    esac
done

if [[ -z "$BUMP_TYPE" ]]; then
    echo "Usage: $0 [--dry-run] <major|minor|patch>"
    exit 1
fi

# Helper to run or log commands
run() {
    if $DRY_RUN; then
        log_dry "$*"
    else
        "$@"
    fi
}

if $DRY_RUN; then
    echo -e "${YELLOW}=== DRY RUN MODE - No changes will be made ===${NC}"
    echo ""
fi

# Check for clean working directory
if [[ -n $(git -C "$PROJECT_ROOT" status --porcelain) ]]; then
    log_error "Working directory is not clean. Commit or stash changes first."
    git -C "$PROJECT_ROOT" status --short
    exit 1
fi

# Get current branch
CURRENT_BRANCH=$(git -C "$PROJECT_ROOT" branch --show-current)
log_info "Current branch: $CURRENT_BRANCH"

# Read current version (create VERSION file if it doesn't exist)
if [[ ! -f "$VERSION_FILE" ]]; then
    echo "0.0.0" > "$VERSION_FILE"
    log_warn "Created VERSION file with initial version 0.0.0"
fi

CURRENT_VERSION=$(cat "$VERSION_FILE")
log_info "Current version: $CURRENT_VERSION"

# Parse version components
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Bump version
case "$BUMP_TYPE" in
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    patch)
        PATCH=$((PATCH + 1))
        ;;
esac

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
log_info "New version: $NEW_VERSION"


# Step 1: Update version files
if $DRY_RUN; then
    log_dry "echo $NEW_VERSION > VERSION"
    log_dry "Update package.json: $CURRENT_VERSION -> $NEW_VERSION"
    log_dry "Update README.md version badge"
    log_dry "Update package-lock.json"
    log_dry "Update CHANGELOG.md version links and header"
else
    echo "$NEW_VERSION" > "$VERSION_FILE"
    log_info "Updated VERSION file"

    if [[ -f "$PROJECT_ROOT/package.json" ]]; then
        sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$PROJECT_ROOT/package.json"
        log_info "Updated package.json"
    fi

    if [[ -f "$PROJECT_ROOT/README.md" ]]; then
        sed -i '' "s/\*\*v$CURRENT_VERSION\*\*/\*\*v$NEW_VERSION\*\*/" "$PROJECT_ROOT/README.md"
        log_info "Updated README.md"
    fi

    if [[ -f "$PROJECT_ROOT/package.json" ]]; then
        (cd "$PROJECT_ROOT" && npm install --package-lock-only --silent 2>/dev/null) || true
        log_info "Updated package-lock.json"
    fi

    # Update CHANGELOG.md - add version entry and update links
    if [[ -f "$PROJECT_ROOT/CHANGELOG.md" ]]; then
        TODAY=$(date +%Y-%m-%d)

        # Update [Unreleased] link to point to new version
        sed -i '' "s|\[Unreleased\]: https://github.com/1898andCo/pennyfarthing/compare/v$CURRENT_VERSION...HEAD|[Unreleased]: https://github.com/1898andCo/pennyfarthing/compare/v$NEW_VERSION...HEAD\n[$NEW_VERSION]: https://github.com/1898andCo/pennyfarthing/compare/v$CURRENT_VERSION...v$NEW_VERSION|" "$PROJECT_ROOT/CHANGELOG.md"

        # Check if [Unreleased] section has content or just placeholder
        if grep -q "^\*No unreleased changes\*$" "$PROJECT_ROOT/CHANGELOG.md"; then
            log_warn "CHANGELOG.md has no unreleased changes documented"
            log_warn "Consider adding release notes before pushing"
        else
            # Move [Unreleased] content to new version section
            # This is complex - for now just add an empty version header
            log_info "Updated CHANGELOG.md version links"
        fi

        # Add new version header if not present
        if ! grep -q "## \[$NEW_VERSION\]" "$PROJECT_ROOT/CHANGELOG.md"; then
            sed -i '' "s|## \[Unreleased\]|## [Unreleased]\n\n*No unreleased changes*\n\n---\n\n## [$NEW_VERSION] - $TODAY|" "$PROJECT_ROOT/CHANGELOG.md"
            log_info "Added CHANGELOG.md version header for $NEW_VERSION"
        fi
    fi
fi

# Step 2: Commit version bump
if $DRY_RUN; then
    log_dry "git commit -m 'chore: bump version to $NEW_VERSION'"
else
    git -C "$PROJECT_ROOT" add VERSION package.json package-lock.json README.md CHANGELOG.md 2>/dev/null || true
    git -C "$PROJECT_ROOT" commit -m "chore: bump version to $NEW_VERSION"
    log_info "Committed version bump"
fi

# Step 3: Merge to develop if not already on develop
if [[ "$CURRENT_BRANCH" != "develop" ]]; then
    if $DRY_RUN; then
        log_dry "git checkout develop && git merge $CURRENT_BRANCH"
    else
        log_info "Merging $CURRENT_BRANCH to develop..."
        git -C "$PROJECT_ROOT" checkout develop
        git -C "$PROJECT_ROOT" pull origin develop --ff-only || {
            log_warn "Could not fast-forward develop. Attempting merge..."
            git -C "$PROJECT_ROOT" pull origin develop --no-rebase
        }
        git -C "$PROJECT_ROOT" merge "$CURRENT_BRANCH" -m "Merge $CURRENT_BRANCH into develop for release $NEW_VERSION"
        log_info "Merged to develop"
    fi
else
    log_info "Already on develop, skipping merge"
fi

# Step 4: Merge develop to main
TAG_NAME="v$NEW_VERSION"
if $DRY_RUN; then
    log_dry "git checkout main && git merge develop"
    log_dry "git tag -a $TAG_NAME -m 'Release $NEW_VERSION'"
    log_dry "git push origin develop main --tags"
    log_dry "git checkout develop"
else
    log_info "Merging develop to main..."
    git -C "$PROJECT_ROOT" checkout main
    git -C "$PROJECT_ROOT" pull origin main --ff-only || {
        log_warn "Could not fast-forward main. Attempting merge..."
        git -C "$PROJECT_ROOT" pull origin main --no-rebase
    }
    git -C "$PROJECT_ROOT" merge develop -m "Merge develop into main for release $NEW_VERSION"
    log_info "Merged to main"

    # Step 5: Create annotated tag
    log_info "Creating tag: $TAG_NAME"
    git -C "$PROJECT_ROOT" tag -a "$TAG_NAME" -m "Release $NEW_VERSION"

    # Step 6: Push everything
    log_info "Pushing develop..."
    git -C "$PROJECT_ROOT" push origin develop

    log_info "Pushing main..."
    git -C "$PROJECT_ROOT" push origin main

    log_info "Pushing tags..."
    git -C "$PROJECT_ROOT" push origin --tags

    # Step 7: Return to develop
    log_info "Returning to develop..."
    git -C "$PROJECT_ROOT" checkout develop
fi

echo ""
if $DRY_RUN; then
    log_info "Dry run complete. No changes made."
    echo ""
    echo "  Would release version: $NEW_VERSION"
    echo "  Would create tag: $TAG_NAME"
else
    log_info "Deploy complete!"
    echo ""
    echo "  Version: $NEW_VERSION"
    echo "  Tag: $TAG_NAME"
    echo "  Branches pushed: develop, main"
fi
echo ""
