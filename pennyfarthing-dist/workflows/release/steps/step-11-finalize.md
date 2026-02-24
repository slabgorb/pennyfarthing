# Step 11: Finalize Release

<purpose>
Create a GitHub release with release notes, verify everything is consistent, and produce a final summary.
</purpose>

<instructions>
1. Create GitHub release from tag
2. Verify final state across all systems
3. Print release summary
</instructions>

<output>
Release summary with links to GitHub release, npm packages, PyPI package, and git tag.
</output>

## Execution

### 11.1 Create GitHub Release

```bash
TAG="v{new_version}"
TODAY=$(date +%Y-%m-%d)

PRERELEASE_FLAG=""
if [[ "$IS_PRERELEASE" == "true" ]]; then
    PRERELEASE_FLAG="--prerelease"
fi

gh release create "$TAG" \
    --title "v{new_version}" \
    --notes "See [CHANGELOG.md](https://github.com/1898andCo/pennyfarthing/blob/main/CHANGELOG.md) for details." \
    $PRERELEASE_FLAG \
    || echo "WARNING: GitHub release creation failed (may already exist)"
```

### 11.2 Final Verification

```bash
echo "=== Final State ==="
echo ""
echo "Git:"
echo "  Branch: $(git branch --show-current)"
echo "  Tag: $(git tag -l 'v{new_version}')"
echo "  VERSION: $(cat VERSION)"
echo ""
echo "npm:"
npm view @pennyfarthing/core@{new_version} version 2>/dev/null && echo "  @pennyfarthing/core@{new_version} ✓" || echo "  @pennyfarthing/core@{new_version} ✗"
npm view @pennyfarthing/cyclist@{new_version} version 2>/dev/null && echo "  @pennyfarthing/cyclist@{new_version} ✓" || echo "  @pennyfarthing/cyclist@{new_version} ✗"
echo ""
echo "PyPI:"
pip index versions pennyfarthing-scripts 2>/dev/null | grep -q "{new_version}" && echo "  pennyfarthing-scripts@{new_version} ✓" || echo "  pennyfarthing-scripts@{new_version} ✗"
echo ""
echo "GitHub:"
gh release view "v{new_version}" --json url --jq '.url' 2>/dev/null || echo "  No GitHub release"
```

### 11.3 Summary

**For stable release:**

```
╔════════════════════════════════════════════╗
║       Release {new_version} Complete             ║
╠════════════════════════════════════════════╣
║                                            ║
║  Tag:     v{new_version}                         ║
║  npm:     @pennyfarthing/core              ║
║           @pennyfarthing/cyclist           ║
║  PyPI:    pennyfarthing-scripts            ║
║  GitHub:  (release URL)                    ║
║                                            ║
║  Branches pushed: develop, main            ║
║  Current branch:  develop                  ║
║                                            ║
║  Install:                                  ║
║    pip install pennyfarthing-scripts       ║
║    npm install @pennyfarthing/core         ║
║                                            ║
╚════════════════════════════════════════════╝
```

**For prerelease:**

```
╔════════════════════════════════════════════════╗
║  Prerelease {new_version} Complete                  ║
╠════════════════════════════════════════════════╣
║                                                ║
║  Tag:       v{new_version}                          ║
║  npm tag:   {prerelease_channel}                    ║
║  npm:       @pennyfarthing/core                ║
║             @pennyfarthing/cyclist             ║
║  PyPI:      pennyfarthing-scripts              ║
║  GitHub:    (prerelease URL)                   ║
║                                                ║
║  Branch pushed: develop (main unchanged)       ║
║  Current branch: develop                       ║
║                                                ║
║  Install:                                      ║
║    pip install --pre pennyfarthing-scripts     ║
║    npm i @pennyfarthing/core@{channel}         ║
║                                                ║
╚════════════════════════════════════════════════╝
```

---

Release workflow complete. All systems updated.

<!-- CYCLIST:CONTINUE -->
