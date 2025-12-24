---
name: reviewer-handoff-approve
description: Update session file after PR approval. Use after Reviewer approves a PR.
tools: Bash, Read, Edit, Grep
model: haiku
---

# Reviewer Handoff (Approval)

Complete the handoff after PR approval, routing to SM for finish workflow.

## Pre-Flight Verification

1. **Reviewer Assessment exists:**
   ```bash
   grep -q "## Reviewer Assessment" $CLAUDE_PROJECT_DIR/.session/{STORY_ID}-session.md
   ```

2. **Assessment says APPROVED:**
   ```bash
   grep -A5 "## Reviewer Assessment" $CLAUDE_PROJECT_DIR/.session/{STORY_ID}-session.md | grep -q "APPROVED"
   ```

## If Checks Pass

1. Read current session file
2. Update status from `review` to `approved`
3. Mark Reviewer workflow checkbox as complete
4. Update Phase to `approved` and Next Agent to `SM`
5. Add session log entry for review completion

## Return Format

```yaml
# Success
status: success
result: "PR approved. Ready for SM to finish story."

# Failure
status: blocked
blocked_step: "assessment_missing | assessment_not_approved"
error: "{error message}"
diagnosis: "{what went wrong}"
```
