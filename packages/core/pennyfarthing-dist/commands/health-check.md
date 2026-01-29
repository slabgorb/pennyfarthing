---
description: Check Pennyfarthing installation health and apply updates
---

```bash
./scripts/run.sh core/agent-session.sh start "devops"
```

<agent-activation>
1. Load DevOps agent for infrastructure work
2. Run health check via CLI
</agent-activation>

<purpose>
Examine current Pennyfarthing installation, detect drift from expected state, and guide user through fixes/updates.
</purpose>

<when-to-use>
- After updating Pennyfarthing (`pennyfarthing update`)
- When something seems broken
- Periodic health verification
- Before starting new sprint
</when-to-use>

<health-checks>

## Health Check

Use the pennyfarthing CLI:

```bash
# Full health check
pennyfarthing doctor

# Or via npx
npx pennyfarthing doctor

# Auto-fix issues
pennyfarthing doctor --fix
```

The CLI checks:
- manifest.json exists and is valid
- All managed files present in .claude/pennyfarthing/
- Symlinks point to correct targets
- User directories exist (.claude/project/)
- Settings paths are correct
- Hook scripts are executable

## Check for Updates

```bash
# Check if update available
pennyfarthing update --check

# Apply update
pennyfarthing update
```

</health-checks>

<output-format>

```markdown
# Pennyfarthing Health Check

## Installation: npm v2.2.x
## Status: [HEALTHY | NEEDS_UPDATE | NEEDS_FIX]

### Checks
| Check | Status | Detail |
|-------|--------|--------|
| Installation | OK | npm v2.2.0 |
| Core Files | OK | All present |
| Symlinks | OK | All valid |
| User Files | OK | 10 sidecars |
| Directories | OK | sprint/, .session/ |
| Hooks | WARN | Not executable |

### Recommended Actions
1. [Action with command to run]
2. [Action with command to run]
```

</output-format>

<auto-fixes>

```bash
pennyfarthing doctor --fix
```

The CLI can auto-fix:
- Broken symlinks
- Missing directories
- Outdated settings format
- Non-executable hooks

**Always ask before applying fixes.**

</auto-fixes>

<drift-detection>

## Agent Behavior Drift Detection

Check if agents are following expected behavioral patterns:

```bash
# Run drift detection
.pennyfarthing/scripts/core/run.sh health/drift-detection.sh

# Verbose mode (see individual files)
.pennyfarthing/scripts/core/run.sh health/drift-detection.sh --verbose
```

The script analyzes archived session files for:

| Agent | Checks For |
|-------|------------|
| **Reviewer** | Substantive comments (not just approvals) |
| **Dev** | Test evidence when declaring GREEN |
| **SM** | Structured handoff sections with target agent |
| **TEA** | Test file references before Dev handoff |

**Healthy rates:** Under 10% drift is considered normal.

**When drift is high:**
- Review agent behavior files for clarity
- Add explicit gates/checklists
- Consider making critical behaviors automatic via scripts

</drift-detection>

<reference>
- **CLI:** `pennyfarthing doctor`, `pennyfarthing update`
- **Manifest:** `.claude/manifest.json` (tracks version and file hashes)
- **Source:** `.claude/pennyfarthing/` (managed files)
- **Symlinks:** `.pennyfarthing/agents/`, `.claude/commands/`, etc.
- **Drift Detection:** `.pennyfarthing/scripts/health/drift-detection.sh`
</reference>
