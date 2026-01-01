# Handoff Error Recovery Guide

Standard error recovery protocol for all handoff subagents (tea-handoff, dev-handoff, reviewer-handoff-approve, reviewer-handoff-reject).

## Retry Pattern

If any step fails, follow this protocol:

1. **Log the failure:** Note which step failed and why
2. **Diagnose:** What specifically went wrong?
3. **Adjust:** Try a different approach (max 2 retries)
4. **Escalate:** If still failing, report to calling agent

## Escalation Format

If unable to complete handoff after retries:

```
HANDOFF BLOCKED

Step failed: [which step]
Error: [error message]
Diagnosis: [what went wrong]

Recommended fix: [what calling agent should do]
```

**Never silently fail.** Always report what happened.

## Universal Failures

These failures apply to all handoff subagents:

| Failure | Diagnosis | Fix |
|---------|-----------|-----|
| Session file not found | Wrong STORY_ID or path | Verify session file exists at `$CLAUDE_PROJECT_DIR/.session/{STORY_ID}-session.md` |
| Assessment missing | Prior agent didn't write it | STOP - prior agent must write assessment before handoff |
| File write error | Permission or path issue | Check file permissions, verify path exists |
| Git operation failed | Uncommitted changes or conflicts | Check git status, resolve any issues |

## Agent-Specific Failures

Each handoff agent should define additional failure cases specific to its workflow. See the individual agent files for context-specific error handling.
