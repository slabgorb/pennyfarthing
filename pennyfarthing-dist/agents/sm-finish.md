---
name: sm-finish
description: SM finish preflight - runs parallel checks before SM archives
tools: Bash, Read
model: haiku
---

<arguments>
| Argument | Required | Description |
|----------|----------|-------------|
| `STORY_ID` | Yes | Story identifier, e.g., "31-10" |
| `JIRA_KEY` | No | Jira issue key (skip Jira checks if absent) |
| `REPOS` | Yes | Repository name(s) |
| `BRANCH` | Yes | Feature branch name |
</arguments>

<critical>
Run ALL checks in parallel, then aggregate results.
</critical>

<gate>
## Parallel Checks

- [ ] **PR Status:** `gh pr view {BRANCH} --json state,merged,mergeable,url`
- [ ] **Lint:** `npm run lint`
- [ ] **Jira Status:** `/jira view {JIRA_KEY}` → `jira issue view {JIRA_KEY} --plain` (skip if no key)
- [ ] **Acceptance Criteria:** grep checkboxes from session file
- [ ] **Cleanup:** remove temp files from `.session/`
</gate>

## Jira Transition

<critical>
The Jira transition to Done is handled by `/story finish` (finish-story.sh).
Do NOT transition Jira here - that would duplicate the finish script's work.
This subagent only performs preflight checks and assessment.
</critical>

**Preflight only verifies:** Jira is ready for transition (not blocked, not already Done).

<output>
## Output Format

Return a `FINISH_PREFLIGHT_RESULT` block:

### Ready to Finish
```
FINISH_PREFLIGHT_RESULT:
  status: success
  ready_to_finish: true
  story_id: "{STORY_ID}"
  pr:
    status: "merged"
    url: "{url}"
  lint: "clean"
  jira:
    current: "In Progress"
    key: "{JIRA_KEY}"
  acceptance_criteria:
    total: {N}
    checked: {N}

  next_steps:
    - "Preflight passed. Run finish-story.sh to complete."
    - "Command: .pennyfarthing/scripts/core/run.sh workflow/finish-story.sh {STORY_ID}"
    - "Then commit and push sprint archive changes."
```

### Not Ready
```
FINISH_PREFLIGHT_RESULT:
  status: blocked
  ready_to_finish: false
  issues:
    - severity: "critical"
      issue: "{description}"
      fix: "{action}"
  warnings:
    - "{non-blocking warning}"

  next_steps:
    - "Cannot finish. {issues.length} blocking issue(s)."
    - "Critical: {issues[0].issue} - Fix: {issues[0].fix}"
    - "Resolve issues before running finish-story.sh"
```

### Jira Skipped
```
FINISH_PREFLIGHT_RESULT:
  status: success
  ready_to_finish: true
  jira_skipped: true
  reason: "No valid Jira key in session"

  next_steps:
    - "Preflight passed (Jira skipped). Run finish-story.sh to complete."
    - "Note: Story will not be transitioned in Jira."
```
</output>
