# Step 10: Publish to npm and PyPI

<purpose>
Publish all Pennyfarthing packages to npm and the pf CLI to PyPI. Uses `pnpm publish`
for npm (to resolve `workspace:*` dependencies) and `python -m build` + `twine` for PyPI.
Verifies authentication, checks for conflicts, publishes, and verifies registry state.
</purpose>

<critical>
**npm: MUST use `pnpm publish`** — not `npm publish`. Packages use `workspace:*` protocol
for inter-package dependencies. `pnpm publish` resolves these to actual version numbers
at publish time. `npm publish` does NOT — it publishes the literal `workspace:*` string,
which breaks consumer installs.
</critical>

<instructions>
1. Verify npm and PyPI authentication
2. Check that versions aren't already published on either registry
3. Publish @pennyfarthing/core (root package) via pnpm
4. Publish workspace packages via pnpm
5. Build and publish pf CLI to PyPI via twine
6. Verify published versions on both registries
</instructions>

<output>
Publish results for each package on both registries, plus verification including
dependency resolution check (no workspace:* in published npm metadata).
</output>

## Execution

### 10.1 Verify Authentication

```bash
echo "=== npm Authentication ==="
npm whoami
if [[ $? -ne 0 ]]; then
    echo "ERROR: Not logged in to npm. Run 'npm login' first."
    exit 1
fi

echo ""
echo "=== PyPI Authentication ==="
# Verify twine is available and credentials are configured
python -m twine --version || echo "ERROR: twine not installed. Run 'pip install twine build'"
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
echo "=== npm Pre-Publish Check ==="
for PKG_JSON in package.json packages/*/package.json; do
    PKG_NAME=$(node -e "console.log(require('./$PKG_JSON').name)")
    npm view "$PKG_NAME@{new_version}" version 2>/dev/null \
        && echo "WARNING: $PKG_NAME@{new_version} already published!" \
        || echo "✓ $PKG_NAME@{new_version} not yet published"
done

echo ""
echo "=== PyPI Pre-Publish Check ==="
pip index versions pennyfarthing-scripts 2>/dev/null | grep -q "{new_version}" \
    && echo "WARNING: pennyfarthing-scripts@{new_version} already on PyPI!" \
    || echo "✓ pennyfarthing-scripts@{new_version} not yet published"
```

### 10.3 Determine Dist-Tags

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

### 10.4 Publish npm — Root Package (Core)

```bash
echo "Publishing @pennyfarthing/core@{new_version}..."
pnpm publish --access public --no-git-checks $NPM_TAG
```

### 10.5 Publish npm — Workspace Packages

```bash
for pkg_dir in packages/cyclist packages/shared packages/themes-*; do
    if [[ -f "$pkg_dir/package.json" ]]; then
        PKG_NAME=$(node -e "console.log(require('./$pkg_dir/package.json').name)")
        echo "Publishing $PKG_NAME@{new_version}..."
        (cd "$pkg_dir" && pnpm publish --access public --no-git-checks $NPM_TAG) || echo "WARNING: Failed to publish $PKG_NAME"
    fi
done
```

### 10.6 Publish PyPI — pf CLI

```bash
echo ""
echo "=== Building pf CLI for PyPI ==="
cd pennyfarthing-dist

# Clean previous builds
rm -rf dist/ build/ *.egg-info

# Build sdist and wheel
python -m build
echo ""
echo "Built artifacts:"
ls -la dist/

echo ""
echo "=== Publishing to PyPI ==="
if [[ "$IS_PRERELEASE" == "true" ]]; then
    echo "Prerelease — publishing to PyPI (pip install --pre pennyfarthing-scripts)"
fi
python -m twine upload dist/*

cd ..
```

### 10.7 Verify Published

```bash
echo "=== Registry Verification ==="
echo "Waiting 10s for registry propagation..."
sleep 10

echo ""
echo "=== npm Version Check ==="
for PKG_JSON in package.json packages/*/package.json; do
    PKG_NAME=$(node -e "console.log(require('./$PKG_JSON').name)")
    npm view "$PKG_NAME@{new_version}" version 2>/dev/null \
        && echo "  ✓ $PKG_NAME@{new_version}" \
        || echo "  ✗ $PKG_NAME@{new_version} NOT FOUND"
done

echo ""
echo "=== PyPI Version Check ==="
pip index versions pennyfarthing-scripts 2>/dev/null | grep -q "{new_version}" \
    && echo "  ✓ pennyfarthing-scripts@{new_version}" \
    || echo "  ✗ pennyfarthing-scripts@{new_version} NOT FOUND"

echo ""
echo "=== npm Dependency Resolution Check ==="
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
    echo "npm stable:  npm install @pennyfarthing/core"
    echo "npm alpha:   npm install @pennyfarthing/core@$PRERELEASE_CHANNEL"
    echo "pip stable:  pip install pennyfarthing-scripts"
    echo "pip pre:     pip install --pre pennyfarthing-scripts"
fi
```

---

<!-- GATE -->

**[C]** Continue to GitHub release
**[S]** Skip GitHub release (packages are already published)

<!-- CYCLIST:CHOICES:C,S -->
