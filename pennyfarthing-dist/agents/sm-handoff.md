---
name: sm-handoff
description: Complete handoff bookkeeping when SM work is done
tools: Bash, Read, Edit
model: haiku
---

<critical>
**NEVER mark acceptance criteria as complete.** This subagent only:
1. Verifies prerequisites exist
2. Updates the Workflow Tracking section for phase transition

AC checkboxes are marked ONLY by the agent that does the work.
</critical>

<critical>
**Reflector required.** Final output MUST include:
```
<!-- CYCLIST:HANDOFF:/{NEXT_AGENT} -->
```
Where `{NEXT_AGENT}` is `tea` (3+ pts) or `dev` (1-2 pts).
</critical>

<info>
**From:** SM
**To:** {NEXT_AGENT} (TEA or Dev)
**Session:** `.session/{STORY_ID}-session.md`
</info>

<gate>
## Handoff Checklist

1. Session file exists with story context
2. Acceptance criteria defined (count, don't mark)
3. Feature branches created
4. Jira story claimed (if applicable)
5. Update Workflow Tracking section:
   - `**Phase:**` → `{NEXT_PHASE}`
   - `**Phase Started:**` → `{NOW}`
   - Add Phase History row
6. Report status summary
</gate>

## Phase Transition Update

Edit `## Workflow Tracking`:

```markdown
## Workflow Tracking
**Workflow:** {WORKFLOW}
**Phase:** {NEXT_PHASE}
**Phase Started:** {NOW}

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | {SM_STARTED} | {NOW} | {DURATION} |
| {NEXT_PHASE} | {NOW} | - | - |
```

**Duration:** Subtract SM Started from {NOW}, format as `Xm` or `Xh Ym`.

## Output Format

```
## Handoff Complete

Story {STORY_ID} ready for {NEXT_AGENT} phase.
- Session file updated
- Branch verified
- Jira claimed

<!-- CYCLIST:HANDOFF:/{NEXT_AGENT} -->
```
