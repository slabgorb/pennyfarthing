# Step 5: Update CLAUDE.md

<purpose>
Review and update CLAUDE.md to keep it accurate for the next development cycle. CLAUDE.md is the primary context file that Claude Code reads on every session — stale information here causes confusion and wasted effort.
</purpose>

<instructions>
1. Verify the version number was updated in step 2
2. Check build commands are still accurate
3. Verify project structure matches reality
4. Check for new packages, agents, or workflows that should be documented
5. Remove references to deleted or deprecated features
6. Show diff for review
</instructions>

<output>
Updated CLAUDE.md reflecting the current release state, with diff shown for review.
</output>

## Execution

### 5.1 Verify Version

```bash
grep "^\*\*Version:\*\*" CLAUDE.md
# Should show: **Version:** {new_version}
```

If not updated yet:
```bash
sed -i '' 's/\*\*Version:\*\* [0-9]\+\.[0-9]\+\.[0-9]\+/\*\*Version:\*\* {new_version}/' CLAUDE.md
```

### 5.2 Verify Build Commands

```bash
echo "=== package.json scripts ==="
node -e "const p = require('./package.json'); Object.entries(p.scripts).forEach(([k,v]) => console.log(k + ': ' + v))"
```

Compare with what CLAUDE.md documents. Are there new scripts? Removed scripts?

### 5.3 Verify Project Structure

```bash
echo "=== Top-Level Structure ==="
ls -d */ 2>/dev/null

echo ""
echo "=== Packages ==="
ls packages/

echo ""
echo "=== pennyfarthing-dist Contents ==="
ls pennyfarthing-dist/
```

Does the directory tree in CLAUDE.md match? Look for:
- New packages added
- Directories renamed or removed
- New top-level directories

### 5.4 Check for New Content

Things that commonly need updating after a release:
- New agents added to `pennyfarthing-dist/agents/`
- New workflows added to `pennyfarthing-dist/workflows/`
- New skills added to `pennyfarthing-dist/skills/`
- Node version requirements changed
- New dependencies added
- Architecture changes documented in ADRs

```bash
echo "=== New ADRs Since Last Release ==="
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
    git diff --name-only "$LAST_TAG"..HEAD -- docs/adr/
fi
```

### 5.5 Remove Stale References

Scan for references to features that no longer exist:
- Deprecated APIs or commands
- Removed configuration options
- Old file paths

### 5.6 Show Diff

```bash
git diff CLAUDE.md
```

If no changes were needed beyond the version, that's fine — confirm and continue.

---

**[C]** Continue to retro (optional)
**[R]** Revise CLAUDE.md content
**[S]** Skip (no CLAUDE.md changes needed beyond version)

<switch tool="AskUserQuestion">
  <case value="continue-to-retro" next="step-06-retro">
    Continue to retro (optional)
  </case>
  <case value="revise-claudemd-content" next="LOOP">
    Revise CLAUDE.md content
  </case>
  <case value="skip" next="step-06-retro">
    Skip (no CLAUDE.md changes needed beyond version)
  </case>
</switch>
