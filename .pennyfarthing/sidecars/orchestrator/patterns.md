# Orchestrator Process Patterns

> Critical patterns for Pennyfarthing development

## Automatic vs Instructional Behavior

**Problem:** Agent behavior depends on following multi-step markdown instructions, which often fails.

**Solution:** Make critical behaviors automatic via scripts, not instructional via markdown.

- **Automatic (scripts):** Critical behaviors, multi-step, must work during handoffs
- **Instructional (markdown):** Optional behaviors, requires agent judgment

---

## Script Output as Agent Context

Output results in XML-like tags for agents to parse:
```bash
echo "<persona agent=\"${agent_name}\" theme=\"${theme}\">"
```

---

## The .claude Climber

**Problem:** `$CLAUDE_PROJECT_DIR` is NOT available in Bash tool invocations.

**Solution:** Inline directory climbing:
```bash
d="$PWD"; while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done; "$d/scripts/run.sh" SCRIPT ARGS
```

| Context | `$CLAUDE_PROJECT_DIR` |
|---------|----------------------|
| Hooks, statusLine | ✅ Available |
| Bash tool | ❌ Use climber |

---

## Skills Must Instruct Tool Use

Code blocks in skill files are documentation, not executed. Use:
```markdown
**FIRST:** Use Bash tool to run: `command here`
```

---

## Agent Behavior Drift Detection

**Signals of drift:**
- Reviewer approving without substantive comments
- SM skipping handoff protocols
- Dev not running tests before declaring GREEN

**Fix:** Make behavior explicit in agent files, not assumed.

---

## Shared Mutable State

**Lesson:** Any shared mutable state between concurrent processes is a bug waiting to happen. Each session should use its own files.

---

## Automated Drift Detection

**Added:** 2026-01-23

Script to analyze archived sessions for behavioral drift:

```bash
.pennyfarthing/scripts/core/run.sh health/drift-detection.sh [--verbose]
```

**Drift signals:**
| Agent | Signal | Healthy Rate |
|-------|--------|--------------|
| Reviewer | Approval without substantive feedback | <5% |
| Dev | GREEN without test evidence | <5% |
| SM | Handoff without target agent | <15% |
| TEA | Handoff without test file references | <10% |

**Response to high drift:**
1. Make behavior explicit in agent files
2. Add gates/checklists
3. Consider scripting critical behaviors

---

*Add process patterns discovered during orchestration below*
