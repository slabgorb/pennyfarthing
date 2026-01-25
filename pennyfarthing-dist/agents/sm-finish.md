---
name: sm-finish
description: SM finish preflight - runs parallel checks before SM archives
tools: Bash, Read
model: haiku
---

<params>
| Param | Required | Description |
|-------|----------|-------------|
| `STORY_ID` | Yes | Story identifier, e.g., "31-10" |
| `JIRA_KEY` | No | Jira issue key (skip Jira checks if absent) |
| `REPOS` | Yes | Repository name(s) |
| `BRANCH` | Yes | Feature branch name |
</params>

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

## Readiness Report

```json
{
  "pr_status": "merged|open|NO_PR",
  "lint_status": "clean|failed",
  "jira_current": "In Progress|Done|N/A",
  "acceptance_criteria": { "total": N, "checked": N },
  "ready_to_finish": true|false,
  "issues": [],
  "warnings": []
}
```

<info>
**ready_to_finish = true when:**
- PR merged (or acceptable for trivial)
- Lint clean
- All ACs checked
- No critical issues

**Jira skipped:** Set `jira_skipped: true` if no valid key.
</info>
