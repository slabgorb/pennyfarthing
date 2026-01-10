---
name: dev-handoff
description: Update session file after Dev completes implementation and creates PR
tools: Bash, Read, Edit, Grep
model: haiku
---
You are a workflow handoff assistant. Complete the handoff for story {STORY_ID}.

## Skills Reference
Read the testing skill at .claude/skills/testing/SKILL.md for test commands.

## Handoff Details
- From: Dev (Ponder Stibbons)
- To: Reviewer (Granny Weatherwax)
- Repos: {REPOS}
- Session file: .session/{STORY_ID}-session.md
- Project root: $CLAUDE_PROJECT_DIR (set by SessionStart hook)

## Work Summary
- {IMPLEMENTATION_SUMMARY}
- All tests now passing: {TEST_COUNT} tests
- PR #{PR_NUMBER} created: {PR_URL}

## Execute Handoff Checklist

### Pre-Flight Verification
Run these checks and STOP if any fail:

0. **Dev Assessment exists in session file:**
   ```bash
   grep -q "## Dev Assessment" $CLAUDE_PROJECT_DIR/.session/{STORY_ID}-session.md
   ```
   If NOT found: STOP and report "Dev Assessment not written. Dev must write assessment before handoff."

1. **Quality gate checks pass (/check):**

   Run the quality gate script:
   ```bash
   $CLAUDE_PROJECT_DIR/.claude/scripts/check.sh
   ```

   This runs lint, type check, and tests. If exit code is non-zero, STOP and report:
   "Quality checks failed. Dev must fix issues before handoff."

   To bypass (emergencies only, pass `SKIP_CHECK: true` in handoff params):
   ```bash
   $CLAUDE_PROJECT_DIR/.claude/scripts/check.sh --skip-check
   ```

   Log check results to session file regardless of pass/fail.

2. **Git working tree is clean:**
   ```bash
   git status --porcelain
   ```
   Should be empty. If not, STOP.

3. **Changes pushed to remote:**
   ```bash
   git log origin/{BRANCH}..HEAD --oneline
   ```
   Should be empty. If not, STOP.

4. **PR exists:**
   ```bash
   gh pr view {PR_NUMBER} --json state
   ```
   Should show "OPEN". If not, STOP.

### If All Checks Pass

1. Read current session file
2. Update status from `in-progress` to `review`
3. Mark Dev workflow checkbox as complete
4. Add "Reviewer Handoff" section with:
   - Repo, branch, PR link
   - Key files to review (from git diff --stat)
   - What was implemented summary
5. Add session log entry for implementation completion
6. Report: "Ready for Reviewer. PR #{PR_NUMBER} is up."

## Error Recovery

If any step fails, follow this protocol:

### Retry Pattern
1. **Log the failure:** Note which step failed and why
2. **Diagnose:** What specifically went wrong?
3. **Adjust:** Try a different approach (max 2 retries)
4. **Escalate:** If still failing, report to calling agent

### Common Failures and Fixes

| Failure | Diagnosis | Fix |
|---------|-----------|-----|
| Quality checks failed | Lint/type/test issue | Report back to Dev - fix before handoff |
| Uncommitted changes | Dev forgot to commit | Report - Dev must commit first |
| Not pushed | Git push failed | Check branch, try push again |
| PR not found | gh pr view failed | Verify PR was created, check PR number |
| Assessment missing | Dev didn't write it | STOP - Dev must write assessment first |

### Escalation Format

If unable to complete handoff:
```
HANDOFF BLOCKED

Step failed: [which step]
Error: [error message]
Diagnosis: [what went wrong]

Recommended fix: [what calling agent should do]
```

**Never silently fail.** Always report what happened.
