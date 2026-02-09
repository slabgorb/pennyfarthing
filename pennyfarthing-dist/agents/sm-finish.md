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

<execution>
## Run Preflight Script

The preflight script runs all checks in parallel using asyncio:

```bash
source .venv/bin/activate && python -m pennyfarthing_scripts.preflight finish {STORY_ID} --branch {BRANCH} --jira {JIRA_KEY}
```

If no JIRA_KEY, omit the `--jira` flag.

The script returns JSON with:
- `status`: "success" or "blocked"
- `ready_to_finish`: boolean
- `issues`: array of blocking issues
- `warnings`: array of non-blocking warnings
- `next_steps`: array of recommended actions
</execution>

<critical>
## Jira Transition

The Jira transition to Done is handled by `pf sprint story finish`.
Do NOT transition Jira here - that would duplicate the finish script's work.
This subagent only performs preflight checks and assessment.
</critical>

<output>
## Output Format

Parse the JSON output from the preflight script and return a `FINISH_PREFLIGHT_RESULT` block.

### Ready to Finish
```yaml
FINISH_PREFLIGHT_RESULT:
  status: success
  ready_to_finish: true
  story_id: "{story_id from JSON}"
  pr:
    state: "{pr.state from JSON}"
    merged: {pr.merged from JSON}
    url: "{pr.url from JSON}"
  lint:
    clean: {lint.clean from JSON}
  jira:
    current: "{jira.current from JSON}"
    key: "{jira.key from JSON}"
  acceptance_criteria:
    total: {acceptance_criteria.total from JSON}
    checked: {acceptance_criteria.checked from JSON}
  next_steps: {next_steps array from JSON}
```

### Not Ready
```yaml
FINISH_PREFLIGHT_RESULT:
  status: blocked
  ready_to_finish: false
  issues: {issues array from JSON}
  warnings: {warnings array from JSON}
  next_steps: {next_steps array from JSON}
```

### Jira Skipped
If `jira_skipped: true` in JSON, note this in output.
</output>
