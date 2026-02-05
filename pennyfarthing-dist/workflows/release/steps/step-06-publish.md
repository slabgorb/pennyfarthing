# Step 6: Publish to npm

<purpose>
Publish @pennyfarthing/core and @pennyfarthing/cyclist to the npm registry. Verifies authentication and shows published package info.
</purpose>

<instructions>
1. Verify npm authentication
2. Check that versions aren't already published
3. Publish @pennyfarthing/core (root package)
4. Publish @pennyfarthing/cyclist
5. Verify published versions on registry
</instructions>

<output>
npm publish results for each package, plus registry verification.
</output>

## Execution

### 6.1 Verify npm Auth

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

### 6.2 Pre-Publish Check

```bash
echo "=== Pre-Publish Check ==="
npm view @pennyfarthing/core@{new_version} version 2>/dev/null && echo "WARNING: core@{new_version} already published!" || echo "✓ core@{new_version} not yet published"
npm view @pennyfarthing/cyclist@{new_version} version 2>/dev/null && echo "WARNING: cyclist@{new_version} already published!" || echo "✓ cyclist@{new_version} not yet published"
```

### 6.3 Publish Core

```bash
echo "Publishing @pennyfarthing/core@{new_version}..."
npm publish --access public
```

### 6.4 Publish Cyclist

```bash
echo "Publishing @pennyfarthing/cyclist@{new_version}..."
cd packages/cyclist
npm publish --access public
cd ../..
```

### 6.5 Verify Published

```bash
echo "=== Registry Verification ==="
echo "Waiting 10s for registry propagation..."
sleep 10
npm view @pennyfarthing/core@{new_version} version
npm view @pennyfarthing/cyclist@{new_version} version
```

---

<!-- GATE -->

**[C]** Continue to GitHub release
**[S]** Skip GitHub release (npm is already published)

<!-- CYCLIST:CHOICES:C,S -->
