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
You MUST return an `AGENT_COMMAND` block with a pre-rendered `marker` string.
The calling agent outputs the `marker` verbatim - no parsing or mapping required.
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

## Generate AGENT_COMMAND Block

Use the `handoff-marker.sh` script to generate the complete AGENT_COMMAND block:

```bash
$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/core/handoff-marker.sh {NEXT_AGENT}
```

The script handles IS_CYCLIST and USE_TIREPUMP detection automatically.
Output the script result verbatim.

## Output Format

Your output MUST end with an `AGENT_COMMAND` block with a pre-rendered `marker` string.
The calling agent outputs the `marker` verbatim - no parsing or mapping required.

```
## Handoff Complete

Story {STORY_ID} ready for {NEXT_AGENT} phase.
- Session file updated
- Branch verified
- Jira claimed

---
AGENT_COMMAND:
  marker: "{MARKER_STRING}"
  fallback: "Run `/{NEXT_AGENT}` to continue"
---
```

### Marker String Generation

The `handoff-marker.sh` script generates the complete AGENT_COMMAND block including the correct marker:

```bash
$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/core/handoff-marker.sh {NEXT_AGENT}
```

**Output the script result verbatim.** No manual marker lookup required.

### Example Output (Cyclist, no TirePump)

```
## Handoff Complete

Story MSSCI-12274 ready for TEA phase.
- Session file updated with phase transition (setup → test)
- Branch verified: `feat/MSSCI-12274-image-queue-support`
- Acceptance criteria confirmed: 7 criteria defined

---
AGENT_COMMAND:
  marker: "<!-- CYCLIST:HANDOFF:/tea -->"
  fallback: "Run `/tea` to continue"
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
  marker: ""
  fallback: "Run `/tea` to continue"
---
```

## Calling Agent Instructions

When you receive this subagent's output, parse the `AGENT_COMMAND` block and:

1. Output the `marker` string verbatim (if non-empty)
2. Output the `fallback` message

**Simple rule: Output `marker` then `fallback`. That's it.**

**The marker MUST appear in the calling agent's direct text output, not in a tool result.**
