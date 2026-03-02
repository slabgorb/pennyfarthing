# Step 2: Bump Version

<purpose>
Update all version files (VERSION, package.json, workspace packages, Python pf CLI, README, CHANGELOG) and show the full diff for review before committing anything.
</purpose>

<instructions>
1. Write new version to VERSION file
2. Update root package.json version
3. Update all workspace package versions (core, cyclist, shared, theme packs)
4. Update Python pf CLI version (`pennyfarthing-dist/src/pf/__init__.py`)
5. Update README.md version badge
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

### 2.4 Update Python pf CLI Version

```bash
# Update __version__ in pf/__init__.py (source of truth for PyPI package)
sed -i '' -E 's/__version__ = "[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?"/__version__ = "{new_version}"/' pennyfarthing-dist/src/pf/__init__.py
echo "Updated pennyfarthing-dist/src/pf/__init__.py"
```

### 2.5 Update README.md

**Skip for prerelease** — README should always reflect the latest stable version.

```bash
if [[ "$IS_PRERELEASE" != "true" ]]; then
    sed -i '' 's/\*\*v{current_version}\*\*/\*\*v{new_version}\*\*/' README.md
fi
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
| `pennyfarthing-dist/src/pf/__init__.py` | `__version__ = "{new_version}"` |
| `README.md` | Badge updated (stable only) |
| `CHANGELOG.md` | New version header |

**For prerelease:** README.md should NOT appear in the diff.

---

<!-- GATE -->

**[C]** Continue to commit
**[R]** Revise a file before committing
**[A]** Abort release (revert all changes with `git checkout .`)

<!-- CYCLIST:CHOICES:C,R,A -->

<switch tool="AskUserQuestion">
  <case value="continue-to-commit" next="step-03-changelog">
    Continue to commit
  </case>
  <case value="revise-a-file-before-committing" next="LOOP">
    Revise a file before committing
  </case>
  <case value="abort-release" next="EXIT">
    Abort release (revert all changes with `git checkout .`)
  </case>
</switch>
