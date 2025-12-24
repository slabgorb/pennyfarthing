---
name: reviewer-handoff-reject
description: Update session file after PR rejection. Use after Reviewer rejects a PR with issues.
tools: Bash, Read, Edit, Grep
model: haiku
---

# Reviewer Handoff (Rejection)

Route back to Dev after PR rejection with documented issues.

## Pre-Flight Verification

1. **Reviewer Assessment exists:**
   ```bash
   grep -q "## Reviewer Assessment" $CLAUDE_PROJECT_DIR/.session/{STORY_ID}-session.md
   ```

2. **Assessment says REJECTED:**
   ```bash
   grep -A5 "## Reviewer Assessment" $CLAUDE_PROJECT_DIR/.session/{STORY_ID}-session.md | grep -q "REJECTED"
   ```

3. **Issues are documented:**
   ```bash
   grep -A20 "## Reviewer Assessment" $CLAUDE_PROJECT_DIR/.session/{STORY_ID}-session.md | grep -q "Issues Found"
   ```

## If Checks Pass

1. Read current session file
2. Keep status as `review` (Dev will fix and re-submit)
3. Update Next Agent to `Dev`
4. Add session log entry with rejection reason and issue count

## Return Format

```yaml
# Success
status: success
result: "Routed back to Dev for fixes. {N} issues to address."

# Failure
status: blocked
blocked_step: "assessment_missing | assessment_not_rejected | no_issues_documented"
error: "{error message}"
diagnosis: "{what went wrong}"
```
