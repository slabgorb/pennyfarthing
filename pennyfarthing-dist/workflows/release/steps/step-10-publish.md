# Step 10: Publish to npm

<purpose>
Publish all Pennyfarthing packages to the npm registry. Verifies authentication, checks for conflicts, publishes each package, and verifies registry state.
</purpose>

<instructions>
1. Verify npm authentication
2. Check that versions aren't already published
3. Publish @pennyfarthing/core (root package)
4. Publish @pennyfarthing/cyclist
5. Publish all theme packs
6. Verify published versions on registry
</instructions>

<output>
npm publish results for each package, plus registry verification.
</output>

## Execution

### 10.1 Verify npm Auth

```bash
echo "=== npm Authentication ==="
npm whoami
if [[ $? -ne 0 ]]; then
    echo "ERROR: Not logged in to npm. Run 'npm login' first."
    exit 1
fi
```

If using a token from `.env`:
```bash
if [[ -f .env ]]; then
    source .env
    npm config set //registry.npmjs.org/:_authToken "$NPM_TOKEN"
fi
```

### 10.2 Pre-Publish Check

```bash
echo "=== Pre-Publish Check ==="
for PKG_JSON in package.json packages/*/package.json; do
    PKG_NAME=$(node -e "console.log(require('./$PKG_JSON').name)")
    npm view "$PKG_NAME@{new_version}" version 2>/dev/null \
        && echo "WARNING: $PKG_NAME@{new_version} already published!" \
        || echo "✓ $PKG_NAME@{new_version} not yet published"
done
```

### 10.3 Publish Root Package (Core)

```bash
echo "Publishing @pennyfarthing/core@{new_version}..."
npm publish --access public
```

### 10.4 Publish Workspace Packages

```bash
for pkg_dir in packages/cyclist packages/shared packages/themes-*; do
    if [[ -f "$pkg_dir/package.json" ]]; then
        PKG_NAME=$(node -e "console.log(require('./$pkg_dir/package.json').name)")
        echo "Publishing $PKG_NAME@{new_version}..."
        (cd "$pkg_dir" && npm publish --access public) || echo "WARNING: Failed to publish $PKG_NAME"
    fi
done
```

### 10.5 Verify Published

```bash
echo "=== Registry Verification ==="
echo "Waiting 10s for registry propagation..."
sleep 10
for PKG_JSON in package.json packages/*/package.json; do
    PKG_NAME=$(node -e "console.log(require('./$PKG_JSON').name)")
    npm view "$PKG_NAME@{new_version}" version 2>/dev/null \
        && echo "  ✓ $PKG_NAME@{new_version}" \
        || echo "  ✗ $PKG_NAME@{new_version} NOT FOUND"
done
```

---

<!-- GATE -->

**[C]** Continue to GitHub release
**[S]** Skip GitHub release (npm is already published)

<!-- CYCLIST:CHOICES:C,S -->
