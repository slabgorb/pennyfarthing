---
name: workflow-status-check
description: Determine workflow state using sprint scripts
tools: Bash, Read
model: haiku
---

<info>
Universal entry point telling agents: what work exists, what phase, and whether to activate.
Uses `/sprint` skill scripts for deterministic output.
</info>

---

## Execution

Run the sprint status script and parse output:

```bash
.pennyfarthing/scripts/core/run.sh sprint/sprint-status.sh
```

Then check for active sessions:

```bash
if ls .session/*-session.md 1>/dev/null 2>&1; then
  for f in .session/*-session.md; do head -30 "$f"; done
else
  echo "No active sessions"
fi
```

---

## State Determination

| State | Condition |
|-------|-----------|
| `FINISH_STATE` | Session exists with Phase=approved OR Status=approved |
| `IN_PROGRESS_STATE` | Session exists with active phase (tea/dev/review) |
| `NEW_WORK_STATE` | No sessions AND sprint has backlog/ready stories |
| `EMPTY_BACKLOG_STATE` | No sessions AND sprint has NO backlog/ready stories |

**Important:** Sprints are fixed two-week periods (kanban-style). Never suggest closing a sprint early or starting sprint planning when backlog is empty. The correct response to `EMPTY_BACKLOG_STATE` is to suggest promoting stories from `future.yaml`.

---

<output>
## Output Format

Return a `STATUS_CHECK_RESULT` block:

### Success
```
STATUS_CHECK_RESULT:
  status: success
  state: {FINISH_STATE|IN_PROGRESS_STATE|NEW_WORK_STATE|EMPTY_BACKLOG_STATE}
  story_id: {ID or null}
  phase: {current phase or null}
  phase_owner: {agent name or null}
  sprint_number: {N}
  backlog_count: {N}

  next_steps:
    - FINISH_STATE: "Proceed to Finish Flow - spawn sm-finish with PHASE=preflight"
    - IN_PROGRESS_STATE: "Report phase owner '{phase_owner}' should continue. Run handoff-marker.sh {phase_owner}"
    - NEW_WORK_STATE: "Present available stories to user. Await selection, then spawn sm-setup MODE=setup"
    - EMPTY_BACKLOG_STATE: "Report backlog empty. Suggest promoting from future.yaml"
```

### Active Session Details (if IN_PROGRESS_STATE)
```
  session:
    story_id: {ID}
    title: "{title}"
    workflow: {workflow}
    phase: {phase}
    branch: {branch}
```
</output>
