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
.pennyfarthing/scripts/run.sh sprint/sprint-status.sh
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

## Output Format

```markdown
## Workflow Status Report

### Detected State
**{STATE}**

### Sprint Summary
[Output from sprint-status.sh]

### Active Session
| Story | Phase | Status | Branch |
|-------|-------|--------|--------|

### Recommended Action
- FINISH_STATE → Proceed to finish flow
- IN_PROGRESS_STATE → Report which agent should continue
- NEW_WORK_STATE → Show available stories
- EMPTY_BACKLOG_STATE → Suggest promoting stories from future.yaml
```
