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
