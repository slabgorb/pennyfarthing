# Step 3: Commit Version Bump

<purpose>
Stage all version-bumped files, create a release branch, commit, merge to develop, and verify every file was included. This is where the old deploy.sh silently failed — we verify explicitly.
</purpose>

<instructions>
1. Create release branch from develop
2. Stage all version files explicitly (no || true)
3. Verify staged files match expected list
4. Commit with conventional message
5. Merge release branch back to develop
6. Clean up release branch
7. Show verification: committed files vs expected files
</instructions>

<output>
Commit verification showing exactly which files were committed and confirming all expected files are present.
</output>

## Execution

### 3.1 Create Release Branch

```bash
RELEASE_BRANCH="release/{new_version}"
git checkout -b "$RELEASE_BRANCH"
```

### 3.2 Stage Files Explicitly

```bash
# Root files
git add VERSION package.json README.md CHANGELOG.md
[[ -f package-lock.json ]] && git add package-lock.json

# Workspace packages
for pkg in core cyclist shared; do
    [[ -f "packages/$pkg/package.json" ]] && git add "packages/$pkg/package.json"
done
```

### 3.3 Verify Staging

**CRITICAL: This is the check that was missing in deploy.sh.**

```bash
echo "=== Staged Files ==="
git diff --cached --name-only

echo ""
echo "=== Verification ==="
# Check each expected file is staged
for f in VERSION package.json README.md CHANGELOG.md packages/core/package.json packages/cyclist/package.json packages/shared/package.json; do
    if git diff --cached --name-only | grep -q "^$f$"; then
        echo "  ✓ $f"
    else
        echo "  ✗ $f (MISSING from staging!)"
    fi
done
```

If any file is missing, **stop and investigate** before committing.

### 3.4 Commit

```bash
git commit -m "chore: bump version to {new_version}"
```

### 3.5 Merge to Develop

```bash
git checkout develop
git merge "$RELEASE_BRANCH" --no-edit
git branch -d "$RELEASE_BRANCH"
```

### 3.6 Post-Commit Verification

```bash
echo "=== Post-Commit Check ==="
echo "VERSION file: $(cat VERSION)"
echo "package.json: $(grep '"version"' package.json)"
echo "core: $(grep '"version"' packages/core/package.json)"
echo "cyclist: $(grep '"version"' packages/cyclist/package.json)"
echo "shared: $(grep '"version"' packages/shared/package.json)"
```

All should read `{new_version}`. If any don't match, **abort before pushing.**

---

<!-- GATE -->

**[C]** Continue to merge to main
**[R]** Revise (amend commit or fix an issue)
**[A]** Abort release (reset develop to before the merge)

<!-- CYCLIST:CHOICES:C,R,A -->
