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

Ask user: **What type of release?**
- `patch` — bug fixes (x.y.Z)
- `minor` — new features (x.Y.0)
- `major` — breaking changes (X.0.0)

Compute `NEW_VERSION` from bump type.

### 1.4 Conflict Checks

```bash
# Check npm
npm view @pennyfarthing/core@$NEW_VERSION version 2>/dev/null && echo "WARNING: $NEW_VERSION already on npm!"

# Check git tags
git tag -l "v$NEW_VERSION" | grep -q . && echo "WARNING: Tag v$NEW_VERSION already exists!"
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
**Tag:** v{NEW_VERSION}

**Files to modify:**
- VERSION
- package.json
- packages/core/package.json
- packages/cyclist/package.json
- packages/shared/package.json
- README.md
- CHANGELOG.md
- package-lock.json (if present)
```

---

**[C]** Continue to version bump
**[A]** Abort release

<!-- CYCLIST:CHOICES:C,A -->
