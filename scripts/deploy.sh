#!/usr/bin/env zsh
set -euo pipefail

# Deploy script for Pennyfarthing
# Usage: ./scripts/deploy.sh [major|minor|patch]
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

# Validate arguments
BUMP_TYPE="${1:-}"
if [[ ! "$BUMP_TYPE" =~ ^(major|minor|patch)$ ]]; then
    echo "Usage: $0 [major|minor|patch]"
    echo ""
    echo "Examples:"
    echo "  $0 patch   # 1.2.3 -> 1.2.4"
    echo "  $0 minor   # 1.2.3 -> 1.3.0"
    echo "  $0 major   # 1.2.3 -> 2.0.0"
    exit 1
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

# Confirm with user
echo ""
echo "This will:"
echo "  1. Bump version: $CURRENT_VERSION -> $NEW_VERSION"
echo "     - VERSION, package.json, README.md"
echo "  2. Merge to develop (if needed)"
echo "  3. Merge develop to main"
echo "  4. Create tag: v$NEW_VERSION"
echo "  5. Push develop, main, and tags"
echo ""
read -p "Continue? [y/N] " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_warn "Aborted."
    exit 0
fi

# Step 1: Update version files
echo "$NEW_VERSION" > "$VERSION_FILE"
log_info "Updated VERSION file"

# Update package.json version
if [[ -f "$PROJECT_ROOT/package.json" ]]; then
    sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$PROJECT_ROOT/package.json"
    log_info "Updated package.json"
fi

# Update README.md version badge
if [[ -f "$PROJECT_ROOT/README.md" ]]; then
    sed -i '' "s/\*\*v$CURRENT_VERSION\*\*/\*\*v$NEW_VERSION\*\*/" "$PROJECT_ROOT/README.md"
    log_info "Updated README.md"
fi

# Regenerate package-lock.json if package.json was updated
if [[ -f "$PROJECT_ROOT/package.json" ]]; then
    (cd "$PROJECT_ROOT" && npm install --package-lock-only --silent 2>/dev/null) || true
    log_info "Updated package-lock.json"
fi

# Step 2: Commit version bump
git -C "$PROJECT_ROOT" add VERSION package.json package-lock.json README.md 2>/dev/null || true
git -C "$PROJECT_ROOT" commit -m "chore: bump version to $NEW_VERSION"
log_info "Committed version bump"

# Step 3: Merge to develop if not already on develop
if [[ "$CURRENT_BRANCH" != "develop" ]]; then
    log_info "Merging $CURRENT_BRANCH to develop..."
    git -C "$PROJECT_ROOT" checkout develop
    git -C "$PROJECT_ROOT" pull origin develop --ff-only || {
        log_warn "Could not fast-forward develop. Attempting merge..."
        git -C "$PROJECT_ROOT" pull origin develop --no-rebase
    }
    git -C "$PROJECT_ROOT" merge "$CURRENT_BRANCH" -m "Merge $CURRENT_BRANCH into develop for release $NEW_VERSION"
    log_info "Merged to develop"
else
    log_info "Already on develop, skipping merge"
fi

# Step 4: Merge develop to main
log_info "Merging develop to main..."
git -C "$PROJECT_ROOT" checkout main

git -C "$PROJECT_ROOT" pull origin main --ff-only || {
    log_warn "Could not fast-forward main. Attempting merge..."
    git -C "$PROJECT_ROOT" pull origin main --no-rebase
}
git -C "$PROJECT_ROOT" merge develop -m "Merge develop into main for release $NEW_VERSION"
log_info "Merged to main"

# Step 5: Create annotated tag
TAG_NAME="v$NEW_VERSION"
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

echo ""
log_info "Deploy complete!"
echo ""
echo "  Version: $NEW_VERSION"
echo "  Tag: $TAG_NAME"
echo "  Branches pushed: develop, main"
echo ""
