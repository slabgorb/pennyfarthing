# Reviewer Handoff Subagent (Rejection)

**Purpose:** Update session file and route back to Dev after PR rejection
**Model:** haiku
**Called by:** Reviewer agent after rejecting a PR

## Task Tool Configuration

```yaml
subagent_type: "general-purpose"
model: "haiku"
description: "workflow handoff"
```

## Prompt Template

Replace `{STORY_ID}`, `{REPOS}`, `{PR_NUMBER}`, `{CRITICAL_COUNT}`, `{MAJOR_COUNT}`, `{MINOR_COUNT}` with actual values.

---

You are a workflow handoff assistant. Complete the handoff for story {STORY_ID}.

## Handoff Details
- From: Reviewer (Granny Weatherwax)
- To: Dev (Ponder Stibbons)
- Repos: {REPOS}
- Session file: .session/current_work.md
- Project root: $PROJECT_ROOT (set by SessionStart hook)

## Work Summary
- PR #{PR_NUMBER} reviewed
- Verdict: REJECTED
- Issues: {CRITICAL_COUNT} critical, {MAJOR_COUNT} major, {MINOR_COUNT} minor
- Details documented in session file by Reviewer

## Execute Handoff Checklist

0. **Verify Reviewer Assessment exists in session file:**
   ```bash
   grep -q "## Reviewer Assessment" $PROJECT_ROOT/.session/current_work.md
   ```
   If NOT found: STOP and report "Reviewer Assessment not written. Reviewer must write assessment before handoff."

1. Read the current session file
2. Verify the Reviewer Assessment says "REJECTED"
3. Keep status as `review` (Dev will fix and re-submit)
4. Update the Workflow section to show routing back to Dev
5. Add session log entry for today's review with rejection reason
6. Report: "Routed back to Dev for fixes. {N} issues to address."

---

## Error Recovery

If any step fails, follow this protocol:

### Retry Pattern
1. **Log the failure:** Note which step failed and why
2. **Diagnose:** What specifically went wrong?
3. **Adjust:** Try a different approach (max 2 retries)
4. **Escalate:** If still failing, report to calling agent

### Common Failures and Fixes

| Failure | Diagnosis | Fix |
|---------|-----------|-----|
| Assessment missing | Reviewer didn't write it | STOP - Reviewer must write assessment first |
| Assessment says APPROVED | Wrong subagent called | Use reviewer-handoff-approve.md instead |
| No issues documented | Reviewer forgot to list issues | STOP - Reviewer must document issues before rejection |
| Session file not found | Wrong path | Verify session file exists at expected path |

### Escalation Format

If unable to complete handoff:
```
HANDOFF BLOCKED

Step failed: [which step]
Error: [error message]
Diagnosis: [what went wrong]

Recommended fix: [what calling agent should do]
```

**Never silently fail.** Always report what happened.
