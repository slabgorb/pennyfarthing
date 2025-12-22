# Story 1-5: Add Epic Context Guardrail - Technical Context

**Story:** 1-5
**Title:** Add guardrail to ensure epic tech context exists before /new-work
**Points:** 2
**Priority:** P1
**Repos:** pennyfarthing

---

## Story Overview

Create a guardrail that validates epic technical context has been generated (via `/start-epic`) before allowing `/new-work` to proceed. This prevents starting work without proper technical analysis.

---

## Current State

### workflow-status-check.md (255 lines)
- Checks session files, git status, determines workflow state
- Returns: `FINISH_STATE`, `NEW_WORK_STATE`, or `IN_PROGRESS_STATE`
- Does NOT check for epic context files

### new-work.md (96 lines)
- Documents the `/new-work` flow
- Shows workflow diagram with states
- Does NOT show `MISSING_EPIC_CONTEXT` state

### Epic Context Pattern
- `/start-epic` creates `.session/epic-{N}-context.md`
- Example: `.session/epic-1-context.md` (created today)

---

## Technical Approach

### 1. Add Epic Context Check to workflow-status-check.md

Insert new step between Step 1 (Session Files) and Step 2 (Git Status):

```markdown
## Step 1.5: Check Epic Context

```bash
# Check if any epic context exists for stories in current sprint
EPIC_IDS=$(grep -oP 'epic-\d+' $PROJECT_ROOT/sprint/current-sprint.yaml | sort -u)
MISSING_CONTEXT=""

for epic in $EPIC_IDS; do
    if [ ! -f "$PROJECT_ROOT/.session/${epic}-context.md" ]; then
        MISSING_CONTEXT="$MISSING_CONTEXT $epic"
    fi
done

if [ -n "$MISSING_CONTEXT" ]; then
    echo "MISSING_EPIC_CONTEXT:$MISSING_CONTEXT"
fi
```
```

### 2. Add New State to Step 3

Update the state determination rules:

```markdown
## Step 3: Determine Workflow State

Apply these rules (in order):
- **MISSING_EPIC_CONTEXT**: Epic(s) in sprint lack context files
- **FINISH_STATE**: Phase=`approved` OR (Phase=`review` AND Status=`approved`)
- **NEW_WORK_STATE**: No current_work.md OR Phase=`complete` OR file contains "No active work"
- **IN_PROGRESS_STATE**: Active work exists but not ready to finish
```

### 3. Update Output Format

Add to the output template:

```markdown
### Epic Context Status
| Epic | Context File | Status |
|------|--------------|--------|
| epic-1 | .session/epic-1-context.md | {exists | MISSING} |

**Action Required:** {None | Run `/start-epic epic-N` before proceeding}
```

### 4. Update new-work.md Diagram

Add `MISSING_EPIC_CONTEXT` branch:

```
┌─────────────────────────────┐
│ 1. Status Check Subagent    │
└─────────────┬───────────────┘
              │
    ┌─────────┼─────────┬─────────────────┐
    │         │         │                 │
    ▼         ▼         ▼                 ▼
FINISH    NEW_WORK   IN_PROGRESS   MISSING_EPIC_CONTEXT
  │         │           │                 │
  ▼         ▼           ▼                 ▼
(finish)  (research)  (report)     Prompt: Run /start-epic
```

---

## Files to Modify

| File | Change |
|------|--------|
| `core/subagents/workflow-status-check.md` | Add Step 1.5, update Step 3 rules, update output format |
| `core/commands/new-work.md` | Update diagram to show MISSING_EPIC_CONTEXT branch |

---

## Acceptance Criteria

- [ ] AC1: workflow-status-check returns `MISSING_EPIC_CONTEXT` when epic context file is missing
- [ ] AC2: Output includes epic context status table
- [ ] AC3: Clear message directs user to run `/start-epic`
- [ ] AC4: new-work.md diagram shows the new state branch

---

## Testing Strategy

### Manual Tests
1. Delete `.session/epic-1-context.md`, run workflow-status-check, verify `MISSING_EPIC_CONTEXT` returned
2. Restore epic context, verify `NEW_WORK_STATE` returned
3. Verify output includes epic context table

### Shell Script Test (optional)
```bash
# Test: Missing context detection
rm -f .session/epic-1-context.md
OUTPUT=$(run_status_check)
echo "$OUTPUT" | grep -q "MISSING_EPIC_CONTEXT" && echo "PASS" || echo "FAIL"

# Restore
touch .session/epic-1-context.md
```

---

## Dependencies & Risks

**Dependencies:** None - standalone change

**Risks:**
- May block legitimate workflows if check is too strict
- Mitigation: Only check epics that have stories in backlog

---

## Scale Assessment

**2 points** - Trivial/small story
- Clear scope: 2 files to modify
- Straightforward logic: file existence check
- Low risk: additive change, doesn't break existing flows

**Workflow:** SM → Dev (skip TEA - simple infrastructure change)

---

*Context created by SM (Captain Carrot)*
