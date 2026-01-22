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
**Subagent output is NOT visible to Cyclist.** Tool results are not parsed for markers.
You MUST return explicit commands for the calling agent to execute.
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

## Detect Environment

Run check-context.sh to determine if running in Cyclist:

```bash
eval "$($CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/core/check-context.sh)"
echo "IS_CYCLIST=$IS_CYCLIST"
echo "USE_TIREPUMP=$USE_TIREPUMP"
echo "CONTEXT_PERCENT=$CONTEXT_PERCENT"
```

## Output Format

Your output MUST end with an `AGENT_COMMAND` block that tells the calling agent exactly what to do:

```
## Handoff Complete

Story {STORY_ID} ready for {NEXT_AGENT} phase.
- Session file updated
- Branch verified
- Jira claimed

---
AGENT_COMMAND:
  action: emit_marker
  marker_type: {MARKER_TYPE}
  marker_value: {NEXT_AGENT}
  fallback_message: "Run `/{NEXT_AGENT}` to continue"
---
```

### Marker Type Decision

| IS_CYCLIST | USE_TIREPUMP | marker_type | Calling Agent Action |
|------------|--------------|-------------|---------------------|
| false | * | none | Agent outputs: "Run `/{NEXT_AGENT}` to continue" |
| true | false | handoff | Agent outputs: `<!-- CYCLIST:HANDOFF:/{NEXT_AGENT} -->` |
| true | true | context_clear | Agent outputs: `<!-- CYCLIST:CONTEXT_CLEAR:/{NEXT_AGENT} -->` |

### Example Output (Cyclist, no TirePump)

```
## Handoff Complete

Story MSSCI-12274 ready for TEA phase.
- Session file updated with phase transition (setup → test)
- Branch verified: `feat/MSSCI-12274-image-queue-support`
- Acceptance criteria confirmed: 7 criteria defined

---
AGENT_COMMAND:
  action: emit_marker
  marker_type: handoff
  marker_value: tea
  fallback_message: "Run `/tea` to continue"
---
```

### Example Output (Not Cyclist)

```
## Handoff Complete

Story MSSCI-12274 ready for TEA phase.
- Session file updated with phase transition (setup → test)
- Branch verified: `feat/MSSCI-12274-image-queue-support`
- Acceptance criteria confirmed: 7 criteria defined

---
AGENT_COMMAND:
  action: emit_marker
  marker_type: none
  marker_value: tea
  fallback_message: "Run `/tea` to continue"
---
```

## Calling Agent Instructions

When you receive this subagent's output, parse the `AGENT_COMMAND` block and:

1. If `marker_type: none` → Output the `fallback_message` text
2. If `marker_type: handoff` → Output: `<!-- CYCLIST:HANDOFF:/{marker_value} -->`
3. If `marker_type: context_clear` → Output: `<!-- CYCLIST:CONTEXT_CLEAR:/{marker_value} -->`

**The marker MUST appear in the calling agent's direct text output, not in a tool result.**
