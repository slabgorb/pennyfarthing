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
# 2. Commit version bump on release/<version> branch, merge to develop
# 3. Merge develop to main
# 4. Tag the release on main
# 5. Push everything (develop, main, tags)
# 6. Return to develop

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
PRERELEASE_CHANNEL=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --alpha|--beta|--rc)
            PRERELEASE_CHANNEL="${1#--}"
            shift
            ;;
        major|minor|patch|premajor|preminor|prepatch|prerelease|promote)
            BUMP_TYPE="$1"
            shift
            ;;
        *)
            echo "Usage: $0 [--dry-run] [--alpha|--beta|--rc] <major|minor|patch|premajor|preminor|prepatch|prerelease|promote>"
            echo ""
            echo "Options:"
            echo "  --dry-run       Show what would happen without executing"
            echo "  --alpha         Set prerelease channel to alpha (default for pre* bumps)"
            echo "  --beta          Set prerelease channel to beta"
            echo "  --rc            Set prerelease channel to rc"
            echo ""
            echo "Bump types:"
            echo "  patch           Bug fix:        1.2.3 -> 1.2.4"
            echo "  minor           New feature:    1.2.3 -> 1.3.0"
            echo "  major           Breaking:       1.2.3 -> 2.0.0"
            echo "  prepatch        Alpha patch:    1.2.3 -> 1.2.4-alpha.0"
            echo "  preminor        Alpha minor:    1.2.3 -> 1.3.0-alpha.0"
            echo "  premajor        Alpha major:    1.2.3 -> 2.0.0-alpha.0"
            echo "  prerelease      Bump pre-num:   1.3.0-alpha.0 -> 1.3.0-alpha.1"
            echo "  promote         Go stable:      1.3.0-alpha.1 -> 1.3.0"
            exit 1
            ;;
    esac
done

if [[ -z "$BUMP_TYPE" ]]; then
    echo "Usage: $0 [--dry-run] [--alpha|--beta|--rc] <major|minor|patch|premajor|preminor|prepatch|prerelease|promote>"
    exit 1
fi

# Default prerelease channel to alpha for pre* bumps
if [[ "$BUMP_TYPE" == pre* && -z "$PRERELEASE_CHANNEL" ]]; then
    PRERELEASE_CHANNEL="alpha"
fi

IS_PRERELEASE=false
if [[ "$BUMP_TYPE" == pre* ]]; then
    IS_PRERELEASE=true
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

# Parse version components (handle prerelease suffix)
BASE_VERSION="${CURRENT_VERSION%%-*}"  # Strip prerelease suffix if present
PRERELEASE_SUFFIX="${CURRENT_VERSION#*-}"  # Get prerelease suffix
[[ "$PRERELEASE_SUFFIX" == "$CURRENT_VERSION" ]] && PRERELEASE_SUFFIX=""  # No suffix found

IFS='.' read -r MAJOR MINOR PATCH <<< "$BASE_VERSION"

# Bump version
case "$BUMP_TYPE" in
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
        ;;
    patch)
        PATCH=$((PATCH + 1))
        NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
        ;;
    premajor)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}-${PRERELEASE_CHANNEL}.0"
        ;;
    preminor)
        MINOR=$((MINOR + 1))
        PATCH=0
        NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}-${PRERELEASE_CHANNEL}.0"
        ;;
    prepatch)
        PATCH=$((PATCH + 1))
        NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}-${PRERELEASE_CHANNEL}.0"
        ;;
    prerelease)
        if [[ -z "$PRERELEASE_SUFFIX" ]]; then
            log_error "Current version ($CURRENT_VERSION) is not a prerelease. Use premajor/preminor/prepatch instead."
            exit 1
        fi
        # Parse existing prerelease: "alpha.0" -> channel="alpha", num=0
        PRE_CHANNEL="${PRERELEASE_SUFFIX%.*}"
        PRE_NUM="${PRERELEASE_SUFFIX##*.}"
        PRE_NUM=$((PRE_NUM + 1))
        [[ -n "$PRERELEASE_CHANNEL" ]] && PRE_CHANNEL="$PRERELEASE_CHANNEL"
        NEW_VERSION="${BASE_VERSION}-${PRE_CHANNEL}.${PRE_NUM}"
        PRERELEASE_CHANNEL="$PRE_CHANNEL"
        ;;
    promote)
        if [[ -z "$PRERELEASE_SUFFIX" ]]; then
            log_error "Current version ($CURRENT_VERSION) is not a prerelease. Nothing to promote."
            exit 1
        fi
        NEW_VERSION="$BASE_VERSION"
        IS_PRERELEASE=false
        ;;
esac

log_info "New version: $NEW_VERSION"
if $IS_PRERELEASE; then
    log_info "Prerelease channel: $PRERELEASE_CHANNEL"
fi


# Step 1: Update version files
if $DRY_RUN; then
    log_dry "echo $NEW_VERSION > VERSION"
    log_dry "Update package.json: $CURRENT_VERSION -> $NEW_VERSION"
    for pkg in core cyclist shared themes-comedy themes-literary themes-mythology-fantasy themes-prestige-tv themes-realistic themes-scifi themes-superheroes; do
        log_dry "Update packages/$pkg/package.json -> $NEW_VERSION"
    done
    log_dry "Update README.md version badge"
    log_dry "Update package-lock.json"
    log_dry "Update CHANGELOG.md version links and header"
else
    echo "$NEW_VERSION" > "$VERSION_FILE"
    log_info "Updated VERSION file"

    if [[ -f "$PROJECT_ROOT/package.json" ]]; then
        # Use flexible regex to handle version drift between VERSION file and package.json
        sed -i '' -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?\"/\"version\": \"$NEW_VERSION\"/" "$PROJECT_ROOT/package.json"
        log_info "Updated package.json"
    fi

    # Update workspace package versions
    for pkg in core cyclist shared themes-comedy themes-literary themes-mythology-fantasy themes-prestige-tv themes-realistic themes-scifi themes-superheroes; do
        PKG_JSON="$PROJECT_ROOT/packages/$pkg/package.json"
        if [[ -f "$PKG_JSON" ]]; then
            # Regex handles both stable (x.y.z) and prerelease (x.y.z-tag.N) versions
            sed -i '' -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?\"/\"version\": \"$NEW_VERSION\"/" "$PKG_JSON"
            log_info "Updated packages/$pkg/package.json"
        fi
    done

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

        # Check if [Unreleased] section has content or just placeholder
        if grep -q "^\*No unreleased changes\*$" "$PROJECT_ROOT/CHANGELOG.md"; then
            log_warn "CHANGELOG.md has no unreleased changes documented"
            log_warn "Consider adding release notes before pushing"
        fi

        # Add new version header if not present
        if ! grep -q "## \[$NEW_VERSION\]" "$PROJECT_ROOT/CHANGELOG.md"; then
            sed -i '' "s|## \[Unreleased\]|## [Unreleased]\n\n*No unreleased changes*\n\n---\n\n## [$NEW_VERSION] - $TODAY|" "$PROJECT_ROOT/CHANGELOG.md"
            log_info "Added CHANGELOG.md version header for $NEW_VERSION"
        fi

        # Regenerate comparison links from version headers (replaces fragile sed matching)
        LINKS_SCRIPT="$PROJECT_ROOT/pennyfarthing-dist/scripts/git/changelog-links.sh"
        if [[ -x "$LINKS_SCRIPT" ]]; then
            "$LINKS_SCRIPT" --fix --changelog "$PROJECT_ROOT/CHANGELOG.md"
            log_info "Regenerated CHANGELOG.md comparison links"
        else
            log_warn "changelog-links.sh not found — skipping link regeneration"
        fi
    fi
fi

# Step 2: Commit version bump on a release branch
RELEASE_BRANCH="release/$NEW_VERSION"
if $DRY_RUN; then
    log_dry "git checkout -b $RELEASE_BRANCH"
    log_dry "git commit -m 'chore: bump version to $NEW_VERSION'"
    log_dry "git checkout develop && git merge $RELEASE_BRANCH"
else
    cd "$PROJECT_ROOT"
    git checkout -b "$RELEASE_BRANCH"

    # Stage root files
    git add VERSION package.json README.md CHANGELOG.md
    [[ -f package-lock.json ]] && git add package-lock.json

    # Stage workspace package files
    for pkg in core cyclist shared themes-comedy themes-literary themes-mythology-fantasy themes-prestige-tv themes-realistic themes-scifi themes-superheroes; do
        [[ -f "packages/$pkg/package.json" ]] && git add "packages/$pkg/package.json"
    done

    # Verify something was staged
    if git diff --cached --quiet; then
        log_error "No files staged for version bump commit!"
        git checkout develop
        git branch -d "$RELEASE_BRANCH" 2>/dev/null
        exit 1
    fi

    log_info "Staged files for version bump:"
    git diff --cached --name-only

    git commit -m "chore: bump version to $NEW_VERSION"
    log_info "Committed version bump on $RELEASE_BRANCH"

    # Merge release branch to develop
    git -C "$PROJECT_ROOT" checkout develop
    git -C "$PROJECT_ROOT" merge "$RELEASE_BRANCH" --no-edit
    log_info "Merged $RELEASE_BRANCH to develop"

    # Clean up release branch
    git -C "$PROJECT_ROOT" branch -d "$RELEASE_BRANCH"
fi

# Step 4: Merge develop to main
TAG_NAME="v$NEW_VERSION"
if $DRY_RUN; then
    if $IS_PRERELEASE; then
        log_dry "Prerelease: skipping merge to main"
        log_dry "git tag -a $TAG_NAME -m 'Release $NEW_VERSION'"
        log_dry "git push origin develop --tags"
        log_dry "pnpm publish --access public --no-git-checks --tag $PRERELEASE_CHANNEL (@pennyfarthing/core)"
        log_dry "gh release create $TAG_NAME --prerelease"
        log_dry "python -m build --sdist"
        log_dry "gh release upload $TAG_NAME dist/pennyfarthing_scripts-${NEW_VERSION}.tar.gz"
        log_dry "gh api repos/1898andCo/homebrew-pf/dispatches (formula-update)"
    else
        log_dry "git checkout main && git merge develop"
        log_dry "git tag -a $TAG_NAME -m 'Release $NEW_VERSION'"
        log_dry "git push origin develop main --tags"
        log_dry "git checkout develop"
        log_dry "pnpm publish --access public --no-git-checks (@pennyfarthing/core)"
        log_dry "gh release create $TAG_NAME"
        log_dry "python -m build --sdist"
        log_dry "gh release upload $TAG_NAME dist/pennyfarthing_scripts-${NEW_VERSION}.tar.gz"
        log_dry "gh api repos/1898andCo/homebrew-pf/dispatches (formula-update)"
    fi
else
    # Step 4: Merge to main (stable only — prereleases stay on develop)
    if $IS_PRERELEASE; then
        log_info "Prerelease: skipping merge to main (stays on develop)"
    else
        log_info "Merging develop to main..."
        git -C "$PROJECT_ROOT" checkout main
        git -C "$PROJECT_ROOT" pull origin main --ff-only || {
            log_warn "Could not fast-forward main. Attempting merge..."
            git -C "$PROJECT_ROOT" pull origin main --no-rebase
        }
        git -C "$PROJECT_ROOT" merge develop -m "Merge develop into main for release $NEW_VERSION"
        log_info "Merged to main"
    fi

    # Step 5: Create annotated tag
    log_info "Creating tag: $TAG_NAME"
    git -C "$PROJECT_ROOT" tag -a "$TAG_NAME" -m "Release $NEW_VERSION"

    # Step 6: Push everything
    log_info "Pushing develop..."
    git -C "$PROJECT_ROOT" push origin develop

    if ! $IS_PRERELEASE; then
        log_info "Pushing main..."
        git -C "$PROJECT_ROOT" push origin main
    fi

    log_info "Pushing tags..."
    git -C "$PROJECT_ROOT" push origin --tags

    # Step 7: Return to develop
    log_info "Returning to develop..."
    git -C "$PROJECT_ROOT" checkout develop

    # Step 8: Publish to npm
    log_info "Publishing to npm..."
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        source "$PROJECT_ROOT/.env"
        npm config set //registry.npmjs.org/:_authToken "$NPM_TOKEN"
    fi

    # Determine npm publish flags
    NPM_TAG_FLAG=""
    if $IS_PRERELEASE; then
        NPM_TAG_FLAG="--tag $PRERELEASE_CHANNEL"
        log_info "Publishing with dist-tag: $PRERELEASE_CHANNEL"
    fi

    # Publish root package (@pennyfarthing/core)
    # IMPORTANT: Use pnpm publish, not npm publish. npm publish does not resolve
    # workspace:* protocol refs and will leak them into the published tarball.
    (cd "$PROJECT_ROOT" && pnpm publish --access public --no-git-checks $NPM_TAG_FLAG)
    log_info "Published @pennyfarthing/core@$NEW_VERSION to npm"

    # Publish all workspace packages (pnpm resolves workspace:* protocols)
    for pkg_dir in "$PROJECT_ROOT"/packages/*/; do
        if [[ -f "$pkg_dir/package.json" ]]; then
            PKG_NAME=$(node -e "console.log(require('$pkg_dir/package.json').name)")
            log_info "Publishing $PKG_NAME..."
            (cd "$pkg_dir" && pnpm publish --access public --no-git-checks $NPM_TAG_FLAG) || log_warn "Failed to publish $PKG_NAME"
            log_info "Published $PKG_NAME@$NEW_VERSION to npm"
        fi
    done

    # Step 9: Create GitHub release
    log_info "Creating GitHub release..."
    GH_PRERELEASE_FLAG=""
    if $IS_PRERELEASE; then
        GH_PRERELEASE_FLAG="--prerelease"
    fi
    gh release create "$TAG_NAME" --title "v$NEW_VERSION" --notes "See [CHANGELOG.md](https://github.com/1898andCo/pennyfarthing/blob/main/CHANGELOG.md#${NEW_VERSION//\.}-${TODAY//-}) for details." $GH_PRERELEASE_FLAG || log_warn "GitHub release creation failed (may already exist)"

    # Step 10: Build Python sdist and attach to release
    log_info "Building Python sdist..."
    (cd "$PROJECT_ROOT" && python -m build --sdist) || log_warn "sdist build failed"
    SDIST="$PROJECT_ROOT/dist/pennyfarthing_scripts-${NEW_VERSION}.tar.gz"
    if [[ -f "$SDIST" ]]; then
        log_info "Uploading sdist to release..."
        gh release upload "$TAG_NAME" "$SDIST" || log_warn "sdist upload failed"
        log_info "Attached $SDIST to release $TAG_NAME"
    else
        log_warn "sdist not found at $SDIST — skipping release asset upload"
    fi

    # Step 11: Notify Homebrew tap to update formula
    log_info "Triggering Homebrew formula update..."
    gh api repos/1898andCo/homebrew-pf/dispatches \
        -f event_type=formula-update \
        -f "client_payload[version]=$NEW_VERSION" \
        || log_warn "Homebrew tap dispatch failed (repo may not exist yet)"
fi

echo ""
if $DRY_RUN; then
    log_info "Dry run complete. No changes made."
    echo ""
    echo "  Would release version: $NEW_VERSION"
    echo "  Would create tag: $TAG_NAME"
    if $IS_PRERELEASE; then
        echo "  Type: prerelease ($PRERELEASE_CHANNEL)"
        echo "  npm dist-tag: $PRERELEASE_CHANNEL"
        echo "  Branches: develop only (main unchanged)"
    fi
    echo "  Would publish:"
    echo "    - @pennyfarthing/core@$NEW_VERSION"
    for pkg_dir in "$PROJECT_ROOT"/packages/*/; do
        [[ -f "$pkg_dir/package.json" ]] && echo "    - $(node -e "console.log(require('$pkg_dir/package.json').name)")@$NEW_VERSION"
    done
    echo "  Would attach: pennyfarthing_scripts-${NEW_VERSION}.tar.gz (sdist)"
    echo "  Would notify: 1898andCo/homebrew-pf (formula update)"
else
    log_info "Deploy complete!"
    echo ""
    echo "  Version: $NEW_VERSION"
    echo "  Tag: $TAG_NAME"
    if $IS_PRERELEASE; then
        echo "  Type: prerelease ($PRERELEASE_CHANNEL)"
        echo "  npm dist-tag: $PRERELEASE_CHANNEL"
        echo "  Branch pushed: develop (main unchanged)"
        echo "  Install: npm install @pennyfarthing/core@$PRERELEASE_CHANNEL"
    else
        echo "  Branches pushed: develop, main"
    fi
    echo "  npm packages:"
    echo "    - @pennyfarthing/core@$NEW_VERSION"
    for pkg_dir in "$PROJECT_ROOT"/packages/*/; do
        [[ -f "$pkg_dir/package.json" ]] && echo "    - $(node -e "console.log(require('$pkg_dir/package.json').name)")@$NEW_VERSION"
    done
    echo "  sdist: pennyfarthing_scripts-${NEW_VERSION}.tar.gz (attached to release)"
    echo "  Homebrew: formula update dispatched to 1898andCo/homebrew-pf"
fi
echo ""
