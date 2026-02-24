---
description: Check Pennyfarthing installation health and apply updates
---

```bash
pf agent start "devops"
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

## Health Check Modes

### Quick Mode (CLI — for automation/CI)

```bash
# Full health check
pennyfarthing doctor

# Check a specific category
pennyfarthing doctor --category hooks

# List available categories
pennyfarthing doctor --list-categories

# Auto-fix issues
pennyfarthing doctor --fix

# Auto-fix a specific category
pennyfarthing doctor --fix --category legacy

# JSON output for scripting
pennyfarthing doctor --json --category installation
```

Categories: `installation`, `commands`, `hooks`, `scripts`, `layout`, `legacy`, `tools`

### Interactive Mode (Workflow — for onboarding/troubleshooting)

```
/pf-workflow start installation-check
```

Walks through 8 steps with AI-guided explanation and remediation:
1. **Foundation** — manifest, core files, symlinks
2. **Commands & Skills** — slash commands, skills, user files
3. **Hook Configuration** — all 9 settings.local.json hooks (gated)
4. **Hook Scripts** — script files exist and are executable
5. **Directory Layout** — files at correct locations
6. **Legacy Cleanup** — old artifacts from previous versions (gated)
7. **Optional Tools** — Cyclist, pf CLI
8. **Summary** — health score and prioritized recommendations

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
.pennyfarthing/scripts/health/drift-detection.sh

# Verbose mode (see individual files)
.pennyfarthing/scripts/health/drift-detection.sh --verbose
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
