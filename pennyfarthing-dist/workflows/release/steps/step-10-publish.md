# Step 10: Publish to npm

<purpose>
Publish all Pennyfarthing packages to the npm registry. Uses `pnpm publish` to
resolve `workspace:*` dependencies to real version numbers. Verifies authentication,
checks for conflicts, publishes each package, and verifies registry state.
</purpose>

<critical>
**MUST use `pnpm publish`** — not `npm publish`. Packages use `workspace:*` protocol
for inter-package dependencies. `pnpm publish` resolves these to actual version numbers
at publish time. `npm publish` does NOT — it publishes the literal `workspace:*` string,
which breaks consumer installs.
</critical>

<instructions>
1. Verify npm authentication
2. Check that versions aren't already published
3. Publish @pennyfarthing/core (root package) via pnpm
4. Publish workspace packages via pnpm
5. Verify published versions and resolved dependencies on registry
</instructions>

<output>
pnpm publish results for each package, plus registry verification including
dependency resolution check (no workspace:* in published metadata).
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

### 10.3 Determine npm Dist-Tag

```bash
if [[ "$IS_PRERELEASE" == "true" ]]; then
    # Prerelease: publish under the prerelease channel tag (alpha, beta, rc)
    # This prevents alpha versions from becoming the "latest" tag
    NPM_TAG="--tag $PRERELEASE_CHANNEL"
    echo "Publishing as prerelease with dist-tag: $PRERELEASE_CHANNEL"
else
    # Stable: publish as "latest" (npm default)
    NPM_TAG=""
    echo "Publishing as stable release (latest)"
fi
```

### 10.4 Publish Root Package (Core)

```bash
echo "Publishing @pennyfarthing/core@{new_version}..."
pnpm publish --access public --no-git-checks $NPM_TAG
```

### 10.5 Publish Workspace Packages

```bash
for pkg_dir in packages/cyclist packages/shared packages/themes-*; do
    if [[ -f "$pkg_dir/package.json" ]]; then
        PKG_NAME=$(node -e "console.log(require('./$pkg_dir/package.json').name)")
        echo "Publishing $PKG_NAME@{new_version}..."
        (cd "$pkg_dir" && pnpm publish --access public --no-git-checks $NPM_TAG) || echo "WARNING: Failed to publish $PKG_NAME"
    fi
done
```

### 10.6 Verify Published (including workspace:* resolution)

```bash
echo "=== Registry Verification ==="
echo "Waiting 10s for registry propagation..."
sleep 10

echo ""
echo "=== Version Check ==="
for PKG_JSON in package.json packages/*/package.json; do
    PKG_NAME=$(node -e "console.log(require('./$PKG_JSON').name)")
    npm view "$PKG_NAME@{new_version}" version 2>/dev/null \
        && echo "  ✓ $PKG_NAME@{new_version}" \
        || echo "  ✗ $PKG_NAME@{new_version} NOT FOUND"
done

echo ""
echo "=== Dependency Resolution Check ==="
echo "Verifying no workspace:* references leaked to npm..."
LEAKED=0
for PKG_JSON in package.json packages/*/package.json; do
    PKG_NAME=$(node -e "console.log(require('./$PKG_JSON').name)")
    DEPS=$(npm view "$PKG_NAME@{new_version}" dependencies --json 2>/dev/null || echo "{}")
    if echo "$DEPS" | grep -q "workspace:"; then
        echo "  ✗ $PKG_NAME has workspace: refs in published dependencies!"
        echo "$DEPS" | grep "workspace:"
        LEAKED=1
    else
        echo "  ✓ $PKG_NAME — no workspace: refs"
    fi
done
if [[ $LEAKED -eq 1 ]]; then
    echo ""
    echo "ERROR: workspace:* references leaked to npm. Deprecate affected versions and re-publish."
fi

if [[ "$IS_PRERELEASE" == "true" ]]; then
    echo ""
    echo "=== Dist-Tag Verification ==="
    echo "Checking that 'latest' still points to the stable release..."
    npm view @pennyfarthing/core dist-tags 2>/dev/null
    echo ""
    echo "Users install stable: npm install @pennyfarthing/core"
    echo "Users install alpha:  npm install @pennyfarthing/core@$PRERELEASE_CHANNEL"
fi
```

---

<!-- GATE -->

**[C]** Continue to GitHub release
**[S]** Skip GitHub release (npm is already published)

<!-- CYCLIST:CHOICES:C,S -->
