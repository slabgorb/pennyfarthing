---
description: Check Pennyfarthing installation health and apply updates
---

```bash
./scripts/run.sh agent-session.sh start "devops"
```

<agent-activation>
1. Load DevOps agent for infrastructure work
2. Detect installation type (npm or submodule)
3. Run appropriate health check
</agent-activation>

<purpose>
Examine current Pennyfarthing installation, detect drift from expected state, and guide user through fixes/updates.
</purpose>

<when-to-use>
- After updating Pennyfarthing (`pennyfarthing update` or `git submodule update`)
- When something seems broken
- Periodic health verification
- Before starting new sprint
</when-to-use>

<installation-detection>

## Detect Installation Type

```bash
# Check for npm installation (manifest.json exists)
if [ -f "$CLAUDE_PROJECT_DIR/.claude/manifest.json" ]; then
    INSTALL_TYPE="npm"
    INSTALLED_VERSION=$(jq -r '.version' "$CLAUDE_PROJECT_DIR/.claude/manifest.json")
    echo "Installation: npm package v$INSTALLED_VERSION"

    # Check for updates using CLI
    if command -v pennyfarthing &>/dev/null; then
        if pennyfarthing update --check 2>/dev/null; then
            echo "Update available!"
        fi
    elif command -v npx &>/dev/null; then
        npx pennyfarthing update --check
    fi

# Check for submodule installation (legacy)
elif [ -d "$CLAUDE_PROJECT_DIR/.claude/pennyfarthing" ]; then
    INSTALL_TYPE="submodule"
    if [ -f "$CLAUDE_PROJECT_DIR/.claude/pennyfarthing/VERSION" ]; then
        INSTALLED_VERSION=$(cat "$CLAUDE_PROJECT_DIR/.claude/pennyfarthing/VERSION")
    fi
    echo "Installation: git submodule v$INSTALLED_VERSION"
    echo ""
    echo "NOTE: Consider migrating to npm package for easier updates:"
    echo "  npx pennyfarthing init --migrate"

else
    INSTALL_TYPE="none"
    echo "Pennyfarthing not installed!"
    echo "Run: npx pennyfarthing init"
fi
```

</installation-detection>

<health-checks-npm>

## npm Installation Checks

If `INSTALL_TYPE="npm"`, use the pennyfarthing CLI:

```bash
# Full health check with CLI
pennyfarthing doctor

# Or via npx
npx pennyfarthing doctor

# Auto-fix issues
pennyfarthing doctor --fix
```

The CLI checks:
- manifest.json exists and is valid
- All managed files present in .claude/core/
- No stale submodule directory
- User directories exist (.claude/project/)
- Settings paths are correct
- Hook scripts are executable

</health-checks-npm>

<health-checks-submodule>

## Submodule Installation Checks (Legacy)

If `INSTALL_TYPE="submodule"`, run manual checks:

### 1. Submodule Status

```bash
cd $CLAUDE_PROJECT_DIR/.claude/pennyfarthing
git fetch origin
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
    echo "OUTDATED: Submodule behind origin/main"
fi
```

### 2. Symlinks

Verify these symlinks exist and point to valid targets:
- `.claude/agents` → `pennyfarthing/core/agents`
- `.claude/subagents` → `pennyfarthing/core/subagents`
- `.claude/commands` → `pennyfarthing/core/commands`
- `.claude/guides` → `pennyfarthing/core/guides`
- `.claude/personas` → `pennyfarthing/personas`

### 3. Settings Format

Check `.claude/settings.local.json`:
- `statusLine` (not `statusline`) with object format
- Hooks use `$CLAUDE_PROJECT_DIR` not relative paths
- Required permissions present

### 4. Statusline

Compare `.claude/statusline.sh` (if exists) against `pennyfarthing/core/statusline.sh`:
```bash
diff -q "$CLAUDE_PROJECT_DIR/.claude/statusline.sh" "$CLAUDE_PROJECT_DIR/.claude/pennyfarthing/core/statusline.sh"
```

### 5. Required Directories

- `sprint/` exists
- `.session/` exists
- `.claude/project/agents/*-sidecar/` for each agent

### 6. Hook Scripts

- `scripts/hooks/session-start.sh` exists and is executable
- `scripts/hooks/pre-edit-check.sh` exists and is executable

</health-checks-submodule>

<output-format>

```markdown
# Pennyfarthing Health Check

## Installation: [npm v2.0.0 | submodule v1.8.2]
## Status: [HEALTHY | NEEDS_UPDATE | NEEDS_FIX]

### Checks
| Check | Status | Detail |
|-------|--------|--------|
| Installation | OK | npm v2.0.0 |
| Core Files | OK | All present |
| User Files | OK | 10 sidecars |
| Directories | OK | sprint/, .session/ |
| Hooks | WARN | Not executable |

### Recommended Actions
1. [Action with command to run]
2. [Action with command to run]
```

</output-format>

<auto-fixes>

### npm Installation

```bash
pennyfarthing doctor --fix
```

### Submodule Installation

The agent can offer to auto-fix these issues:

| Issue | Auto-fix |
|-------|----------|
| Outdated statusline | Copy from core/statusline.sh |
| Broken symlinks | Re-create symlinks |
| Old settings format | Update settings.local.json |
| Missing directories | Create with proper structure |

**Always ask before applying fixes.**

</auto-fixes>

<migration>

## Migrate to npm Package

If using submodule installation, consider migrating for easier updates:

```bash
# Option 1: Interactive migration
npx pennyfarthing init --migrate

# Option 2: Force migration (non-interactive)
npx pennyfarthing init --migrate --force

# After migration, remove the submodule manually:
rm -rf .claude/pennyfarthing
git rm .claude/pennyfarthing
git commit -m "chore: migrate pennyfarthing from submodule to npm"
```

</migration>

<reference>
- **npm CLI:** `pennyfarthing doctor`, `pennyfarthing update`
- **Manifest:** `.claude/manifest.json` (tracks version and file hashes)
- **Version:** `VERSION` file or `manifest.json`
</reference>
