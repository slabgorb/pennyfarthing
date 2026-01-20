# Critical Implementation Rules

These rules MUST be followed when making changes to the Pennyfarthing codebase.

## Rule 1: Single Source of Truth

**All agent, command, skill, and persona definitions live in `pennyfarthing-dist/`.**

| What | Location |
|------|----------|
| Agent definitions | `pennyfarthing-dist/agents/*.md` |
| Slash commands | `pennyfarthing-dist/commands/*.md` |
| Skills | `pennyfarthing-dist/skills/*/skill.md` |
| Personas | `pennyfarthing-dist/personas/themes/` |
| Workflows | `pennyfarthing-dist/workflows/*.yaml` |

**NEVER** modify files in `.claude/commands/`, `.claude/skills/`, `.pennyfarthing/agents/`, etc. - these are **symlinks** to `pennyfarthing-dist/`.

## Rule 2: ESM Module Requirements

**All relative imports must end with `.js` extension.**

```typescript
// CORRECT
import { parseStatus } from './utils.js';
import type { Config } from './types.js';

// WRONG - will fail at runtime
import { parseStatus } from './utils';
import type { Config } from './types';
```

## Rule 3: Error Handling Pattern

**Return result objects instead of throwing exceptions.**

```typescript
// CORRECT
interface OperationResult {
  success: boolean;
  data?: SomeType;
  error?: string;
}

export function doOperation(): OperationResult {
  try {
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// WRONG - throws exceptions
export function doOperation(): SomeType {
  if (failed) throw new Error('Operation failed');
  return result;
}
```

## Rule 4: Session File Protocol

**Agents must write their assessment BEFORE spawning handoff subagent.**

```markdown
## TEA Assessment    ← Write this FIRST
**Test Files:** [list]
**Status:** Tests failing (RED)

Then spawn: generic-handoff subagent
```

Failure to follow this causes `agent-session.sh stop` to fail.

## Rule 5: Build Output is Tracked

**`dist/` directories are committed to git (not gitignored).**

Reason: Distributed directly from GitHub without requiring build step.

After making TypeScript changes:
1. Run `npm run build`
2. Commit both `src/` and `dist/` changes

## Rule 6: Subagent Model Selection

**Subagents use Haiku, not Opus.**

```yaml
# CORRECT
Task tool:
  subagent_type: "general-purpose"
  model: "haiku"
  prompt: ...

# WRONG - wastes tokens on mechanical tasks
Task tool:
  subagent_type: "general-purpose"
  model: "opus"
  prompt: ...
```

## Rule 7: Workflow State Detection

**Agents detect state from session files, not explicit commands.**

The `workflow-status-check` subagent reads:
1. `.session/{story-id}-session.md` existence
2. `Phase:` field in session file
3. Git branch state
4. Sprint YAML status

**NEVER** hardcode state or bypass detection.

## Rule 8: Sprint YAML is Source of Truth

**`sprint/current-sprint.yaml` is the canonical sprint state.**

- SM reads sprint to select stories
- SM updates sprint when stories complete
- Jira sync uses sprint YAML as reference
- Archive happens at sprint boundaries

**Do not** manually edit sprint YAML during active sessions.

## Rule 9: Symlink Architecture

**Claude Code discovery relies on symlink structure.**

```
.claude/commands/ → pennyfarthing-dist/commands/
.claude/skills/   → pennyfarthing-dist/skills/
```

If symlinks break, run:
```bash
pennyfarthing doctor --fix
```

## Rule 10: Context Budget Awareness

**Strategic agents: ~500-660 lines budget**
**Tactical agents: ~450-600 lines budget**

Avoid loading unnecessary context:
- Use lazy loading
- Load only relevant repo context
- Check context usage: `scripts/check-context.sh --human`

## Rule 11: Test Conventions

| Package | Framework | File Pattern |
|---------|-----------|--------------|
| core | Node.js native | `**/*.test.ts` |
| shared | Node.js native | `**/*.test.ts` |
| cyclist | Vitest | `tests/B-*.test.ts` |

Cyclist tests use `B-` prefix by convention.

## Rule 12: Handoff Markers

**Include CYCLIST markers in handoff messages.**

```markdown
<!-- CYCLIST:HANDOFF:/dev -->       <!-- Normal handoff -->
<!-- CYCLIST:CONTEXT_CLEAR:/dev --> <!-- High context, reload agent -->
```

These trigger Cyclist UI quick-action buttons.

## Rule 13: Agent Status Tags

**All agents must declare their status.**

```xml
<status>production</status>   <!-- Battle-tested, stable -->
<status>stable</status>       <!-- Well-tested -->
<status>experimental</status> <!-- Under development -->
```

## Rule 14: TypeScript Strict Mode

**Strict mode is enabled. No `any` without justification.**

```typescript
// If you must use any, document why:
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const legacyData: any = externalApi.response;
```

## Rule 15: Jira Integration

**Jira operations go through jira CLI, not direct API.**

```bash
# CORRECT
jira issue create --project PROJ --type Story ...

# WRONG - bypasses CLI tooling
curl -X POST https://jira.atlassian.net/rest/api/...
```

## Violation Consequences

| Rule Violated | Impact |
|---------------|--------|
| Single Source of Truth | Changes lost on next sync/update |
| ESM Extensions | Runtime import failures |
| Session Protocol | agent-session.sh failures |
| Build Output | Distribution breaks |
| Subagent Model | Token waste, slow execution |
| State Detection | Workflow desync |
| Sprint YAML | Data corruption |
| Symlinks | Claude Code discovery fails |
| Context Budget | Session crashes |

## Quick Reference

```
✓ Modify pennyfarthing-dist/, not symlinked dirs
✓ Use .js extensions in imports
✓ Return result objects, don't throw
✓ Write assessment before handoff
✓ Commit dist/ with src/
✓ Use Haiku for subagents
✓ Detect state from session files
✓ Include CYCLIST markers
✓ Declare agent status
✓ Respect context budgets
```
