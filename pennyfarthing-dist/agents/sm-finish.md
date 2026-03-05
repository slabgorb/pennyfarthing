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
## 1. Create PR (if needed)

Before running preflight, check if a PR exists for the branch. If not, create one
using the project's `pr_mode` config:

```bash
# Read pr_mode: draft | ready | none
PR_MODE=$(source .venv/bin/activate && python -m pf.common.pr_config)
```

Format the PR title using the project's `pr_title_format` from `.pennyfarthing/repos.yaml`:
```bash
PR_TITLE=$(source .venv/bin/activate && python -c "
from pf.git.repos import format_pr_title
print(format_pr_title(jira_key='${JIRA_KEY:-$STORY_ID}', title='${title}', scope='${scope}'))
")
```
- If `PR_MODE=draft`: `gh pr create --draft --title "$PR_TITLE" --body "..." --base develop`
- If `PR_MODE=ready`: `gh pr create --title "$PR_TITLE" --body "..." --base develop`
- If `PR_MODE=none`: Skip PR creation entirely.

Check for existing PR first: `gh pr list --head {BRANCH} --json number --jq '.[0].number'`
If a PR already exists, skip creation.

## 2. Compile Impact Summary

Compile Delivery Findings from the session file into an Impact Summary section.
Uses `pf.findings.summary.write_impact_summary_to_session()` which reads the
session, parses R1-format findings via `pf.findings.capture.parse_delivery_findings()`,
and writes the `## Impact Summary` section between Delivery Findings and agent assessments.

```bash
source .venv/bin/activate && python -c "
from pathlib import Path
from pf.findings.summary import write_impact_summary_to_session
import json
result = write_impact_summary_to_session(Path('.session/{STORY_ID}-session.md'))
print(json.dumps(result))
"
```

- If `success: true`: Impact Summary compiled. Log `finding_count` and `blocking_count`.
- If `success: false`: Log the error but continue with preflight — Impact Summary is non-blocking.

## 3. Run Preflight Script

The preflight script runs all checks in parallel using asyncio:

```bash
source .venv/bin/activate && python -m pf.preflight finish {STORY_ID} --branch {BRANCH} --jira {JIRA_KEY}
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
