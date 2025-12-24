# TEA Handoff Subagent

**Purpose:** Update session file after TEA writes failing tests (RED phase)
**Model:** haiku
**Called by:** TEA agent after tests are written and committed

## Task Tool Configuration

```yaml
subagent_type: "general-purpose"
model: "haiku"
description: "workflow handoff"
```

## Prompt Template

Replace placeholders with actual values.

---

You are a workflow handoff assistant. Complete the handoff for story {STORY_ID}.

## Skills Reference
Read the testing skill at .claude/skills/testing/SKILL.md for test commands.

## Handoff Details
- From: TEA (Igor)
- To: Dev (Ponder Stibbons)
- Repos: {REPOS}
- Session file: .session/{STORY_ID}-session.md
- Project root: $CLAUDE_PROJECT_DIR (set by SessionStart hook)

## Work Summary
- Tests written for story {STORY_ID}
- Test files: {TEST_FILE_LIST}
- Test count: {FAILING_COUNT} failing (RED), {PASSING_COUNT} passing
- Commit: {COMMIT_SHA} {COMMIT_MESSAGE}

## Execute Handoff Checklist

### Pre-Flight Verification

0. **TEA Assessment exists in session file:**
   ```bash
   grep -q "## TEA Assessment" $CLAUDE_PROJECT_DIR/.session/{STORY_ID}-session.md
   ```
   If NOT found: STOP and report "TEA Assessment not written. TEA must write assessment before handoff."

1. **Tests are committed:**
   ```bash
   cd $CLAUDE_PROJECT_DIR/${REPO}
   git log -1 --oneline
   ```
   Should show test commit.

2. **Tests are RED (failing as expected):**

   **DELEGATE TO TESTING-RUNNER SUBAGENT:**

   See `.claude/subagents/testing-runner.md` for the testing runner definition.

   Spawn a testing-runner subagent:
   ```yaml
   subagent_type: "general-purpose"
   model: "haiku"
   description: "run tests"
   prompt: |
     You are a testing runner for the Conductor project.
     Run tests and report structured results.

     ## Skills Reference
     Read the testing skill at .claude/skills/testing/SKILL.md for test commands.

     ## Project Info
     - Project root: $CLAUDE_PROJECT_DIR (set by SessionStart hook)
     - Repo(s) to test: {REPO}
     - Context: TEA handoff - verify tests are RED for Story {STORY_ID}
     - Run ID: {STORY_ID}-tea

     [Include test execution steps from testing-runner.md with RUN_ID]
   ```

   If you cannot spawn a subagent, run tests directly:
   ```bash
   RUN_ID="{STORY_ID}-tea"
   cd $CLAUDE_PROJECT_DIR/${REPO}
   # UI: npm run test -- --run 2>&1 | tee $CLAUDE_PROJECT_DIR/.session/test-results-ui-${RUN_ID}.log
   # API: just test 2>&1 | tee $CLAUDE_PROJECT_DIR/.session/test-results-api-${RUN_ID}.log
   ```

   New tests MUST be RED (failing). If all GREEN, verify tests are actually exercising new functionality.

### Update Session File

1. Read current session file
2. Add "TEA Assessment" section with:
   - Tests Required: Yes/No (with reason if No)
   - Test Files: list of created/modified test files
   - Tests Written: count breakdown (failing/passing)
   - Status: RED (ready for Dev)
3. Mark TEA workflow checkbox as complete
4. Add session log entry with:
   - Test commit SHA and message
   - Test results breakdown
   - Handoff note to Dev
5. Report: "Tests are RED. Ready for Dev to make them GREEN."

---

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
| Tests all GREEN | Tests don't exercise new code | Report - TEA must verify tests are correct |
| Tests not committed | git commit failed | Check staging, try commit again |
| Assessment missing | TEA didn't write it | STOP - TEA must write assessment first |
| Session file not found | Wrong path | Verify session file exists at expected path |

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
