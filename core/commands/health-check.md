---
description: Check Pennyfarthing installation health and apply updates
---

```bash
$PROJECT_ROOT/scripts/agent-session.sh start "devops"
```

<agent-activation>
1. Load DevOps agent for infrastructure work
2. Run health check analysis
</agent-activation>

<purpose>
Examine current Pennyfarthing installation, detect drift from expected state, and guide user through fixes/updates.
</purpose>

<when-to-use>
- After updating pennyfarthing submodule (`git submodule update`)
- When something seems broken
- Periodic health verification
- Before starting new sprint
</when-to-use>

<health-checks>

## 1. Submodule Status

```bash
cd $PROJECT_ROOT/.claude/pennyfarthing
git fetch origin
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
    echo "OUTDATED: Submodule behind origin/main"
fi
```

## 2. Symlinks

Verify these symlinks exist and point to valid targets:
- `.claude/agents` → `pennyfarthing/core/agents`
- `.claude/subagents` → `pennyfarthing/core/subagents`
- `.claude/commands` → `pennyfarthing/core/commands`
- `.claude/guides` → `pennyfarthing/core/guides`
- `.claude/personas` → `pennyfarthing/personas`

## 3. Settings Format

Check `.claude/settings.local.json`:
- `statusLine` (not `statusline`) with object format
- Hooks use `$CLAUDE_PROJECT_DIR` not relative paths
- Required permissions present

## 4. Statusline

Compare `.claude/statusline.sh` (if exists) against `pennyfarthing/core/statusline.sh`:
```bash
diff -q "$PROJECT_ROOT/.claude/statusline.sh" "$PROJECT_ROOT/.claude/pennyfarthing/core/statusline.sh"
```

## 5. Required Directories

- `sprint/` exists
- `.session/` exists
- `.claude/project/agents/*-sidecar/` for each agent

## 6. Hook Scripts

- `scripts/hooks/session-start.sh` exists and is executable
- `scripts/hooks/pre-edit-check.sh` exists and is executable

</health-checks>

<output-format>

```markdown
# Pennyfarthing Health Check

## Status: [HEALTHY | NEEDS_UPDATE | BROKEN]

### Checks
| Check | Status | Issue |
|-------|--------|-------|
| Submodule | OK/OUTDATED | Behind by N commits |
| Symlinks | OK/BROKEN | .claude/agents missing |
| Settings | OK/OUTDATED | Uses old statusline format |
| Statusline | OK/OUTDATED | Local differs from source |
| Directories | OK/MISSING | .session/ not found |
| Hooks | OK/MISSING | session-start.sh not found |

### Recommended Actions
1. [Action with command to run]
2. [Action with command to run]
```

</output-format>

<auto-fixes>

The agent can offer to auto-fix these issues:

| Issue | Auto-fix |
|-------|----------|
| Outdated statusline | Copy from core/statusline.sh |
| Broken symlinks | Re-create symlinks |
| Old settings format | Update settings.local.json |
| Missing directories | Create with proper structure |

**Always ask before applying fixes.**

</auto-fixes>

<reference>
- **Init script:** `scripts/init-project.sh`
- **Settings format:** See init-project.sh lines 375-428
- **Version:** Check `VERSION` file in pennyfarthing root
</reference>
