# Step 1: Preflight Checks

<purpose>
Verify the repo is in a clean, releasable state. Compute the new version number and preview what will change. Catch problems before any files are modified.
</purpose>

<instructions>
1. Verify working directory is clean (no uncommitted changes)
2. Verify current branch is `develop`
3. Read current version from VERSION file
4. Ask user for bump type (major/minor/patch) if not already known
5. Compute new version number
6. Check npm registry for conflicts (version not already published)
7. Check git tags for conflicts (tag doesn't already exist)
8. Show summary of what will happen
</instructions>

<output>
Preflight report showing:
- Current version and new version
- Branch status
- npm registry status
- Git tag status
- List of files that will be modified
- Ready for user to continue or abort
</output>

## Execution

### 1.1 Clean Working Directory

```bash
cd {project_root}
if [[ -n $(git status --porcelain) ]]; then
    echo "ERROR: Working directory not clean"
    git status --short
    exit 1
fi
```

### 1.2 Branch Check

```bash
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "develop" ]]; then
    echo "ERROR: Must be on develop branch (currently on $CURRENT_BRANCH)"
    exit 1
fi
```

### 1.3 Version Computation

```bash
CURRENT_VERSION=$(cat VERSION)
echo "Current version: $CURRENT_VERSION"
```

**Detect if current version is already a prerelease:**

```bash
if [[ "$CURRENT_VERSION" == *-* ]]; then
    PRERELEASE_TAG="${CURRENT_VERSION#*-}"  # e.g., "alpha.0"
    BASE_VERSION="${CURRENT_VERSION%%-*}"   # e.g., "10.4.0"
    echo "Current version is a prerelease: $CURRENT_VERSION (base: $BASE_VERSION)"
fi
```

Ask user: **What type of release?**

**If current version is stable (no prerelease suffix):**
- `patch` — bug fixes (x.y.Z)
- `minor` — new features (x.Y.0)
- `major` — breaking changes (X.0.0)
- `prepatch` — prerelease for next patch (x.y.Z-alpha.0)
- `preminor` — prerelease for next minor (x.Y.0-alpha.0)
- `premajor` — prerelease for next major (X.0.0-alpha.0)

**If current version is already a prerelease (e.g., 10.4.0-alpha.0):**
- `prerelease` — bump prerelease number (x.y.z-alpha.N+1)
- `promote` — promote to stable (x.y.z, dropping the prerelease suffix)
- `graduate-beta` — graduate to beta (x.y.z-beta.0)
- `graduate-rc` — graduate to release candidate (x.y.z-rc.0)

Compute `NEW_VERSION` from bump type.

**For prerelease bumps**, also ask: **Prerelease channel?** (default: `alpha`)
- `alpha` — early testing, unstable
- `beta` — feature-complete, testing
- `rc` — release candidate, final testing

Set `IS_PRERELEASE=true` and `PRERELEASE_CHANNEL` (alpha/beta/rc) for use in later steps.

### 1.4 Conflict Checks

```bash
# Check npm (prerelease uses dist-tag, but still check exact version)
npm view @pennyfarthing/core@$NEW_VERSION version 2>/dev/null && echo "WARNING: $NEW_VERSION already on npm!"

# Check git tags
git tag -l "v$NEW_VERSION" | grep -q . && echo "WARNING: Tag v$NEW_VERSION already exists!"

# For prereleases, check what's currently on the dist-tag
if [[ "$IS_PRERELEASE" == "true" ]]; then
    echo ""
    echo "=== Current npm dist-tags ==="
    npm view @pennyfarthing/core dist-tags 2>/dev/null || echo "(not yet published)"
fi
```

### 1.5 Preview

```
## Preflight Summary

| Check              | Status |
|--------------------|--------|
| Clean working dir  | ✓/✗    |
| On develop branch  | ✓/✗    |
| npm not published  | ✓/✗    |
| Tag not exists     | ✓/✗    |

**Version:** {CURRENT_VERSION} → {NEW_VERSION}
**Release type:** {stable | prerelease (alpha/beta/rc)}
**Tag:** v{NEW_VERSION}
**npm dist-tag:** {latest | alpha | beta | rc}

**Files to modify:**
- VERSION
- package.json
- packages/*/package.json (all workspace packages)
- CHANGELOG.md
- package-lock.json (if present)
{if stable: - README.md, - CLAUDE.md}

**Steps that will be skipped for prerelease:**
{if prerelease: Steps 4 (README), 5 (CLAUDE.md), 6 (Retro), 8 (Merge to main)}
```

---

**[C]** Continue to version bump
**[A]** Abort release

<!-- CYCLIST:CHOICES:C,A -->
