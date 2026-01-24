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
**Marker generation happens in the CALLING agent, not here.**
This subagent verifies prerequisites and updates session file only.
Return `HANDOFF_RESULT` with the next agent name - SM runs `handoff-marker.sh` as their last action.
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

Return a `HANDOFF_RESULT` block. SM will use this to run `handoff-marker.sh`.

### Success Format

```
HANDOFF_RESULT:
  status: success
  next_agent: {NEXT_AGENT}
  next_phase: {NEXT_PHASE}
  story_id: {STORY_ID}
  summary: "Session updated, branch verified, Jira claimed"
```

### Example (SM → TEA)

```
HANDOFF_RESULT:
  status: success
  next_agent: tea
  next_phase: red
  story_id: MSSCI-12274
  summary: "Session updated (setup → red), branch feat/MSSCI-12274-image-queue verified, 7 AC defined"
```

### Example (SM → Dev, trivial workflow)

```
HANDOFF_RESULT:
  status: success
  next_agent: dev
  next_phase: implement
  story_id: 46-3
  summary: "Session updated (setup → implement), branch feat/46-3-fix-typo verified"
```

### Error Format

```
HANDOFF_RESULT:
  status: blocked
  error: "{error message}"
  fix: "{recommended action}"
```

---

## Calling Agent Exit Sequence

When SM receives `HANDOFF_RESULT`:

1. If `status: blocked` → Report the error, do NOT proceed
2. If `status: success` → Continue to exit sequence below

**CRITICAL: SM MUST run this as their ABSOLUTE LAST ACTION:**

```bash
$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/core/handoff-marker.sh {next_agent}
```

Then output the script's result verbatim and EXIT. Nothing else after.
