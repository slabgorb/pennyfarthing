# Step 2: Bump Version

<purpose>
Update all version files (VERSION, package.json, workspace packages, README, CHANGELOG) and show the full diff for review before committing anything.
</purpose>

<instructions>
1. Write new version to VERSION file
2. Update root package.json version
3. Update all workspace package versions (core, cyclist, shared, theme packs)
4. Update README.md version badge
5. Update package-lock.json
6. Update CHANGELOG.md (version links and header)
7. Show complete diff of all changes for review
</instructions>

<output>
Full git diff showing every version change. User reviews before approving the commit step.
</output>

## Execution

### 2.1 Update VERSION File

```bash
echo "{new_version}" > VERSION
```

### 2.2 Update Root package.json

```bash
sed -i '' 's/"version": "{current_version}"/"version": "{new_version}"/' package.json
```

### 2.3 Update Workspace Packages

```bash
# Bump all workspace packages (auto-discovered)
# Regex handles both stable (x.y.z) and prerelease (x.y.z-tag.N) versions
for PKG_JSON in packages/*/package.json; do
    if [[ -f "$PKG_JSON" ]]; then
        sed -i '' -E 's/"version": "[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?"/"version": "{new_version}"/' "$PKG_JSON"
        echo "Updated $PKG_JSON"
    fi
done
```

### 2.4 Update README.md

**Skip for prerelease** — README should always reflect the latest stable version.

```bash
if [[ "$IS_PRERELEASE" != "true" ]]; then
    sed -i '' 's/\*\*v{current_version}\*\*/\*\*v{new_version}\*\*/' README.md
fi
```

### 2.5 Update package-lock.json

```bash
[[ -f package.json ]] && npm install --package-lock-only --silent 2>/dev/null
```

### 2.6 Update CHANGELOG.md

```bash
TODAY=$(date +%Y-%m-%d)
# Update [Unreleased] link, add new version header
# See deploy.sh for full sed commands
```

### 2.7 Show Diff for Review

```bash
echo "=== Version Bump Diff ==="
git diff
echo ""
echo "=== Files Changed ==="
git diff --stat
```

**Review the diff carefully.** Every version file should show `{current_version}` → `{new_version}`.

| File | Expected Change |
|------|----------------|
| `VERSION` | `{new_version}` |
| `package.json` | `"version": "{new_version}"` |
| `packages/*/package.json` | `"version": "{new_version}"` (all workspace packages) |
| `README.md` | Badge updated (stable only) |
| `CHANGELOG.md` | New version header |

**For prerelease:** README.md should NOT appear in the diff.

---

<!-- GATE -->

**[C]** Continue to commit
**[R]** Revise a file before committing
**[A]** Abort release (revert all changes with `git checkout .`)

<!-- CYCLIST:CHOICES:C,R,A -->
