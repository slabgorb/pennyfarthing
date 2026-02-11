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

<arguments>
| Argument | Required | Description |
|----------|----------|-------------|
| `STORY_ID` | Yes | Story identifier, e.g., "31-10" |
| `NEXT_AGENT` | Yes | Target agent: `tea`, `dev`, `ux-designer`, `orchestrator` |
| `NEXT_PHASE` | Yes | Target phase from workflow YAML: `red`, `design`, `implement` |
| `WORKFLOW` | Yes | Workflow type: "tdd", "tdd-tandem", "bdd", "bdd-tandem", "trivial", etc. |
</arguments>

<tandem-awareness>
## Tandem Partner Detection

After verifying prerequisites, check if the next phase has a tandem partner:

```bash
TANDEM_PARTNER=$(yq eval ".workflow.phases[] | select(.name == \"$NEXT_PHASE\") | .tandem.partner // \"\"" "$PROJECT_ROOT/.pennyfarthing/workflows/${WORKFLOW}.yaml" 2>/dev/null)
TANDEM_SCOPE=$(yq eval ".workflow.phases[] | select(.name == \"$NEXT_PHASE\") | .tandem.scope // \"\"" "$PROJECT_ROOT/.pennyfarthing/workflows/${WORKFLOW}.yaml" 2>/dev/null)
```

If `TANDEM_PARTNER` is non-empty, include it in the HANDOFF_RESULT and add a note to the session file:

```markdown
**Tandem:** {TANDEM_PARTNER} ({TANDEM_SCOPE})
```

This tells the receiving agent they can spawn their tandem partner for consultation.
</tandem-awareness>

<gate>
## Handoff Checklist

- [ ] Session file exists with story context
- [ ] Acceptance criteria defined (count, don't mark)
- [ ] Feature branches created
- [ ] Jira story claimed (if applicable)
- [ ] Update Workflow Tracking section:
  - `**Phase:**` → `{NEXT_PHASE}`
  - `**Phase Started:**` → `{NOW}`
  - Add Phase History row
- [ ] Report status summary
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

<output>
## Output Format

Return a `HANDOFF_RESULT` block:

### Success
```
HANDOFF_RESULT:
  status: success
  next_agent: {NEXT_AGENT}
  next_phase: {NEXT_PHASE}
  story_id: {STORY_ID}
  tandem_partner: {PARTNER or "none"}
  tandem_scope: {SCOPE or "none"}
  summary: "{what was done}"

  next_steps:
    - "Handoff complete. Run handoff-marker.sh as ABSOLUTE LAST ACTION."
    - "Command: .pennyfarthing/scripts/core/handoff-marker.sh {next_agent}"
    - "Output marker result verbatim, then EXIT. Nothing after."
```

### Example (SM → TEA)
```
HANDOFF_RESULT:
  status: success
  next_agent: tea
  next_phase: red
  story_id: MSSCI-12274
  tandem_partner: architect
  tandem_scope: file-watch
  summary: "Session updated (setup → red), branch verified, 7 AC defined. Tandem: architect available."

  next_steps:
    - "Handoff complete. Run handoff-marker.sh as ABSOLUTE LAST ACTION."
    - "Command: .pennyfarthing/scripts/core/handoff-marker.sh tea"
    - "Output marker result verbatim, then EXIT. Nothing after."
```

### Blocked
```
HANDOFF_RESULT:
  status: blocked
  error: "{description}"
  fix: "{recommended action}"
  failed_check: "{which gate check failed}"

  next_steps:
    - "Handoff blocked: {error}"
    - "Required action: {fix}"
    - "Do NOT run handoff-marker.sh. Resolve issue first."
```
</output>

---

## Calling Agent Exit Sequence

When SM receives `HANDOFF_RESULT`:

1. If `status: blocked` → Report the error, do NOT proceed
2. If `status: success` → Continue to exit sequence below

**CRITICAL: SM MUST run this as their ABSOLUTE LAST ACTION:**

```bash
.pennyfarthing/scripts/core/handoff-marker.sh {next_agent}
```

Then output the script's result verbatim and EXIT. Nothing else after.
