# Orchestrator Process Patterns

## Pattern: Automatic vs Instructional Behavior

**Problem:** When agent behavior depends on following multi-step instructions in markdown, it often fails - especially during handoffs when agents are focused on their primary task or context is high.

**Solution:** Make critical behaviors automatic via scripts rather than instructional via markdown.

### Example: Persona Loading Fix (2024-12)

**Before (broken):**
```markdown
<persona-loading agent="sm">
1. Read `.claude/persona-config.yaml`
2. Get theme value
3. Read `personas/themes/{theme}.yaml`
4. Extract agent persona
5. Apply throughout session
</persona-loading>
```
Agent often ignored these steps, especially during agent-to-agent handoffs.

**After (automatic):**
```bash
$PROJECT_ROOT/scripts/agent-session.sh start "sm"
```
Script outputs persona directly:
```
<persona agent="sm" theme="discworld">
Character: Captain Carrot Ironfoundersson
Style: Supportive, honest...
</persona>
```
Agent sees the persona without needing to follow instructions.

### When to Apply This Pattern

Use automatic (script-based) approach when:
- Behavior is critical and must not be skipped
- Multiple steps are involved
- Behavior should work during handoffs
- Different agents need the same behavior

Use instructional (markdown-based) approach when:
- Behavior is optional or context-dependent
- Agent judgment is required
- Steps vary based on situation

### Implementation Checklist

1. Identify the instructional behavior that's failing
2. Create a script that performs the behavior automatically
3. Have the command file's bash block call the script
4. Script outputs results in a format the agent can use
5. Remove the instructional markdown
6. Keep a fallback in the agent file for edge cases

## Pattern: Script Output as Agent Context

When scripts need to provide context to agents, output in XML-like tags:

```bash
echo "<persona agent=\"${agent_name}\" theme=\"${theme}\">"
echo "Character: $(yq ...)"
echo "</persona>"
```

This format:
- Is clearly delimited
- Can include metadata (agent, theme)
- Is easy for agents to parse and use
- Doesn't interfere with other output

---

## Pattern: Merge Critical Config, Skip User Config

**Problem (2024-12):** When `pennyfarthing init` detected existing `settings.local.json`, it skipped the file entirely. This meant critical hooks (SessionStart) were never installed, causing `$PROJECT_ROOT` to be undefined and agent commands to fail with:
```
/scripts/agent-session.sh: no such file or directory
```

**Root Cause:** The init logic assumed "file exists = user configured it correctly". But users often had partial settings (just permissions) without the critical hooks.

**Solution:** Merge required configuration into existing files instead of skip-or-overwrite.

```typescript
// Bad: Skip if exists
if (pathExists(settingsPath)) {
  logger.skipped('settings.local.json', 'already exists');
  return;
}

// Good: Merge required hooks
const existing = JSON.parse(readFileSync(settingsPath));
if (!existing.hooks?.SessionStart) {
  existing.hooks = { ...existing.hooks, SessionStart: requiredHooks };
  writeFileSync(settingsPath, JSON.stringify(existing, null, 2));
}
```

### When to Apply This Pattern

**Merge approach** for config files where:
- Some fields are REQUIRED for system to function (hooks, paths)
- Some fields are USER-CUSTOMIZED (permissions, preferences)
- File may exist with partial configuration

**Skip approach** only for purely user-owned files:
- Project-specific docs (shared-context.md)
- User preferences (persona-config.yaml)
- No system-critical fields

### Implementation Checklist

1. Identify which fields are system-critical vs user-owned
2. On init/update, read existing file if present
3. Merge only missing critical fields
4. Preserve all user customizations
5. Add doctor check to validate critical fields exist
6. Provide `--fix` to auto-repair missing fields

---

## Pattern: Skills Must Instruct Tool Use, Not Document Commands

**Problem (2024-12):** Agent skill command files included bash code blocks as "documentation" of what should run:

```markdown
\`\`\`bash
./scripts/run.sh agent-session.sh start "dev"
\`\`\`

<agent-activation>
1. Load and follow `.claude/agents/dev.md`
...
</agent-activation>
```

The bash block was *documentation* - Claude Code's Skill tool doesn't execute embedded code blocks. The persona loading script was never run, so agents activated without their character/personality.

**Root Cause:** Confusion between documenting a command vs instructing Claude to invoke a tool. Fenced code blocks in skill files are just text - they don't trigger tool invocations.

**Solution:** Replace documentation with explicit tool-invocation instructions:

```markdown
<agent-activation>
**FIRST:** Use Bash tool to run: `"$CLAUDE_PROJECT_DIR"/scripts/run.sh agent-session.sh start "dev"`
This loads your persona from the theme config. Adopt the character shown in the output.

Then:
1. Load and follow `.claude/agents/dev.md`
2. Load sidecar: `.claude/project/agents/dev-sidecar/*.md`
</agent-activation>
```

### Key Insight

In Claude Code skills/commands:
- **Code blocks** = Documentation (not executed)
- **Explicit instructions** = Claude follows them and invokes tools

### When to Apply This Pattern

Use explicit tool-invocation instructions when:
- A script MUST run for the skill to work correctly
- Output from the script is needed as context
- The behavior isn't optional

Use documentation-style code blocks when:
- Showing examples the user might run manually
- Reference documentation
- Optional commands

### Files Fixed (2024-12)

All 10 agent command files in `.claude/commands/`:
- dev.md, sm.md, tea.md, reviewer.md, pm.md
- orchestrator.md, architect.md, devops.md
- tech-writer.md, ux-designer.md

---

## Pattern: Portable Path Resolution (The .claude Climber)

**Problem (2024-12):** Skill instructions used `$CLAUDE_PROJECT_DIR` in Bash commands, but this variable is ONLY set by Claude Code for hooks and statusLine - it's NOT available in Bash tool invocations.

```markdown
# WRONG - $CLAUDE_PROJECT_DIR is not set in Bash tool context
Use Bash tool to run: `"$CLAUDE_PROJECT_DIR"/scripts/run.sh agent-session.sh start "dev"`
```

**Root Cause:** Confusion about which variables are available in which contexts.

**Solution:** Use inline directory climbing to find the project root:

```bash
d="$PWD"; while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done; "$d/scripts/run.sh" SCRIPT ARGS
```

This:
1. Starts from current directory
2. Climbs until `.claude/` directory found
3. Runs script from that root
4. Works from ANY subdirectory
5. No environment variable dependencies

### Context Reference Table

| Context | `$CLAUDE_PROJECT_DIR` | Use Instead |
|---------|----------------------|-------------|
| Hooks (settings.local.json) | ✅ Available | Use it |
| statusLine | ✅ Available | Use it |
| Bash tool invocations | ❌ **NOT SET** | Use climber |
| Scripts (internal) | ❌ Not set | Self-derive from `${BASH_SOURCE[0]}` |

### The Canonical One-Liner

```bash
d="$PWD"; while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done; "$d/scripts/run.sh" SCRIPT ARGS
```

### Files Using This Pattern

All agent activation commands in `.claude/commands/`:
- dev.md, sm.md, tea.md, reviewer.md, pm.md
- orchestrator.md, architect.md, devops.md, tech-writer.md, ux-designer.md
