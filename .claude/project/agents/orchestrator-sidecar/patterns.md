# Orchestrator Process Patterns

> Critical patterns learned from Pennyfarthing development

## Pattern: Automatic vs Instructional Behavior

**Problem:** Agent behavior depends on following multi-step markdown instructions, which often fails during handoffs.

**Solution:** Make critical behaviors automatic via scripts rather than instructional via markdown.

### When to Apply
**Use automatic (script-based)** when:
- Behavior is critical and must not be skipped
- Multiple steps are involved
- Behavior should work during handoffs

**Use instructional (markdown-based)** when:
- Behavior is optional or context-dependent
- Agent judgment is required

---

## Pattern: Script Output as Agent Context

Output results in XML-like tags for agents to parse:
```bash
echo "<persona agent=\"${agent_name}\" theme=\"${theme}\">"
echo "Character: $(yq ...)"
echo "</persona>"
```

---

## Pattern: The .claude Climber (Portable Path Resolution)

**Problem:** `$CLAUDE_PROJECT_DIR` is NOT available in Bash tool invocations.

**Solution:** Use inline directory climbing:
```bash
d="$PWD"; while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done; "$d/scripts/run.sh" SCRIPT ARGS
```

### Context Reference Table
| Context | `$CLAUDE_PROJECT_DIR` | Use Instead |
|---------|----------------------|-------------|
| Hooks (settings.local.json) | ✅ Available | Use it |
| statusLine | ✅ Available | Use it |
| Bash tool invocations | ❌ NOT SET | Use climber |

---

## Pattern: Skills Must Instruct Tool Use

**Problem:** Code blocks in skill files are documentation, not executed.

**Solution:** Use explicit tool-invocation instructions:
```markdown
**FIRST:** Use Bash tool to run: `command here`
```

---

## Pattern: Merge Critical Config, Skip User Config

**Problem:** `pennyfarthing init` skipped files if they existed, missing critical hooks.

**Solution:** Merge required configuration into existing files:
- Merge REQUIRED fields (hooks, paths)
- Preserve USER-CUSTOMIZED fields (permissions)

---

*Add process patterns discovered during orchestration below*
