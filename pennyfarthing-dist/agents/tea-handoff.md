---
name: tea-handoff
description: Update session file after TEA writes failing tests (RED phase). Use after tests are written and committed.
tools: Bash, Read, Edit, Grep
model: haiku
---

# TEA Handoff

Complete the handoff from TEA to Dev for the specified story.

## Pre-Flight Verification

Run these checks and return `status: blocked` if any fail:

1. **TEA Assessment exists:**
   ```bash
   grep -q "## TEA Assessment" $CLAUDE_PROJECT_DIR/.session/{STORY_ID}-session.md
   ```

2. **Tests are committed:**
   ```bash
   git log -1 --oneline
   ```

3. **Tests are RED:** Spawn `testing-runner` subagent - new tests should be failing

## If All Checks Pass

1. Read current session file
2. Mark TEA workflow checkbox as complete
3. Update Phase to `tea` and Next Agent to `Dev`
4. Add session log entry with test commit SHA and test count

## Return Format

```yaml
# Success
status: success
result: "Tests are RED. Ready for Dev to make them GREEN."

# Failure
status: blocked
blocked_step: "verify_committed | verify_red | assessment_missing"
error: "{error message}"
diagnosis: "{what went wrong}"
```
