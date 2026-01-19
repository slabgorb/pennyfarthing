---
name: workflow-status-check
description: Scan .session files and git status to determine workflow state
tools: Bash, Read, Glob, Grep
model: haiku
---

<info>
Universal entry point telling agents: what work exists, what phase, and whether to activate.
</info>

<gate>
## Steps

1. Scan session files for active work
2. Check epic context exists
3. Check git status via `repo-scan.sh`
4. Detect drift (merged but not closed)
5. Check Jira ownership for in-progress stories
6. Check background tasks
7. Determine workflow state
8. Output status report
</gate>

---

## Step 1: Scan Session Files

```bash
ls -la .session/*-session.md 2>/dev/null && \
for f in .session/*-session.md; do [ -f "$f" ] && head -50 "$f"; done
```

Extract: Story ID, Title, Phase, Status, Repos, Branch, Jira, Workflow, Phase Started

## Step 2: Check Epic Context

```bash
EPIC_CONTEXTS=$(ls .session/context-epic-*.md 2>/dev/null)
if [ -z "$EPIC_CONTEXTS" ]; then
    echo "EPIC_CONTEXT_STATUS: MISSING"
else
    echo "EPIC_CONTEXT_STATUS: PRESENT"
fi
```

<critical>
**If no epic context AND no sessions → blocks /new-work. User must run `/start-epic`.**
</critical>

## Step 3: Git Status

```bash
source $CLAUDE_PROJECT_DIR/scripts/utils/repo-scan.sh
scan_all_repos_status
```

## Step 4: Detect Drift

```bash
source $CLAUDE_PROJECT_DIR/pennyfarthing-dist/scripts/utils/sprint-common.sh
drifted=$(detect_drift)
```

## Step 5: Check Jira Ownership

<critical>
**Multi-developer coordination:** For `status: in_progress` stories, check WHO owns in Jira.
- Assigned to YOU → offer to continue
- Assigned to COLLEAGUE → DO NOT offer
- Unassigned → orphaned, offer to claim
</critical>

## Step 6: Background Tasks

```bash
source $CLAUDE_PROJECT_DIR/scripts/utils/background-tasks.sh
for session_file in .session/*-session.md; do
    bg_task_check "$session_file" && bg_task_list "$session_file"
done
```

---

## State Determination

| State | Condition |
|-------|-----------|
| `MISSING_EPIC_CONTEXT` | No epic context AND no sessions |
| `FINISH_STATE` | Phase=approved OR Status=approved |
| `NEW_WORK_STATE` | No sessions AND no in_progress stories owned by you |
| `IN_PROGRESS_STATE` | Session with active phase OR YAML in_progress owned by you |
| `COLLEAGUE_IN_PROGRESS` | YAML in_progress but Jira assigned to someone else |

---

## Output Format

```markdown
## Workflow Status Report

### Detected State
**{STATE}**

### Epic Context
| Status | Epic ID | Title |
|--------|---------|-------|

### Active Work (Your Work)
| Story | Workflow | Phase | Status | Repos |
|-------|----------|-------|--------|-------|

### Colleague Work (DO NOT OFFER)
| Story | Jira | Assignee |
|-------|------|----------|

### Git State
| Repo | Branch | Uncommitted | Ahead |
|------|--------|-------------|-------|

### Agent Guidance
| Phase | Active Agent | Next |
|-------|--------------|------|
| sm | TEA | → Dev |
| tea | Dev | → Reviewer |
| dev | Reviewer | → SM |
| approved | SM | Finish |
```

## Error Recovery

On failure: Log → Retry (max 2) → Escalate

**Never silently fail.**
