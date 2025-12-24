---
name: dev-handoff
description: Update session file after Dev completes implementation and creates PR. Use after tests pass and PR is created.
tools: Bash, Read, Edit, Grep
model: haiku
---

# Dev Handoff

Complete the handoff from Dev to Reviewer for the specified story.

## Pre-Flight Verification

Run these checks and return `status: blocked` if any fail:

1. **Dev Assessment exists:**
   ```bash
   grep -q "## Dev Assessment" $CLAUDE_PROJECT_DIR/.session/{STORY_ID}-session.md
   ```

2. **Tests are GREEN:** Spawn `testing-runner` subagent to verify

3. **Git working tree is clean:**
   ```bash
   git status --porcelain
   ```

4. **Changes pushed to remote:**
   ```bash
   git log origin/{BRANCH}..HEAD --oneline
   ```

5. **PR exists and open:**
   ```bash
   gh pr view {PR_NUMBER} --json state
   ```

## If All Checks Pass

1. Read current session file
2. Update status from `in-progress` to `review`
3. Mark Dev workflow checkbox as complete
4. Update Phase to `dev` and Next Agent to `Reviewer`
5. Add "Reviewer Handoff" section with repo, branch, PR link, key files

## Return Format

```yaml
# Success
status: success
result: "Ready for Reviewer. PR #{PR_NUMBER} is up."

# Failure
status: blocked
blocked_step: "verify_tests_green | verify_pushed | verify_pr | assessment_missing"
error: "{error message}"
diagnosis: "{what went wrong}"
```
