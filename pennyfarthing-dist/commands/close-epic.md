---
description: Close an epic - verify completion, update status, and archive context
---

# Close Epic Workflow

**This command closes an epic by verifying all stories are done, updating status, and optionally archiving context.**

## What This Does

1. **Verifies** all stories in the epic are status: done
2. **Updates** epic status to `done` and completed_points
3. **Updates** sprint summary totals
4. **Optionally** transitions Jira epic to Done
5. **Optionally** archives the epic context file

## Prerequisites

- Epic must exist in current sprint
- All stories should be done (will warn if not)

## Usage

Provide the epic ID when invoking this command:
- `/close-epic 9` - Close epic 9
- `/close-epic epic-9` - Also accepts epic-N format

## Workflow Steps

### Step 1: Identify Epic

If no epic ID provided, ask:
> "Which epic would you like to close? (e.g., 9 or epic-9)"

Parse the epic ID (strip "epic-" prefix if present).

### Step 2: Verify Epic Exists

Read `sprint/current-sprint.yaml` and find the epic block:
- `id: epic-{N}`

If not found, error: "Epic not found in current sprint"

### Step 3: Check Story Completion

For each story in the epic:
1. Check `status` field
2. Count done vs not-done

**If all done:** Proceed to close
**If some not done:** Warn user with list of incomplete stories, ask to confirm

### Step 4: Update Epic Status

Update the epic in `sprint/current-sprint.yaml`:
```yaml
status: done
completed_points: {total of all story points}
```

### Step 5: Update Sprint Summary

Recalculate and update the summary section:
- `completed_points`: Sum of all done story points across all epics
- `remaining_points`: total_points - completed_points
- Update notes to reflect epic completion

### Step 6: Jira Transition (Optional)

If epic has `jira_key`, use `/jira move` skill:
```bash
# Check if Jira CLI available
if command -v jira &> /dev/null; then
    echo "Transition Jira epic to Done? (y/n)"
    # If yes, use /jira move skill:
    # jira issue move $JIRA_KEY "Done" --project MSSCI
fi
```

**Note:** Always use `/jira` skill commands - see `.claude/skills/jira/skill.md` for syntax.

### Step 7: Archive Context (Optional)

If `.session/context-epic-{N}.md` exists:
```bash
# Ask user
echo "Archive epic context file? (y/n)"
# If yes: mv .session/context-epic-{N}.md sprint/archive/
```

### Step 8: Confirm Closure

```
Epic {N} closed successfully

Summary:
- Stories: {count} done
- Points: {points} completed
- Jira: {transitioned/skipped/no-key}
- Context: {archived/kept/not-found}

Sprint progress: {completed}/{total} points ({percentage}%)
```

## Example

```bash
# User invokes: /close-epic 9

# Output:
# Checking epic-9...
# Found: Skill Discovery & Documentation Hub
# Stories: 5/5 done (13 points)
#
# Updating epic status to done...
# Updating sprint summary (31/45 points)...
#
# Jira key found: MSSCI-11512
# Transition to Done? (y/n): y
# Transitioning MSSCI-11512 to Done...
#
# Context file found: .session/context-epic-9.md
# Archive to sprint/archive/? (y/n): n
# Keeping context file in place.
#
# Epic 9 closed successfully!
# Sprint progress: 31/45 points (69%)
```

## Notes

- This is the counterpart to `/start-epic`
- Safe to run multiple times (idempotent)
- Does NOT delete any data, only updates status
- Context archival is optional and reversible

---

**Flow:** TDD cycle complete all stories `/close-epic` update sprint
