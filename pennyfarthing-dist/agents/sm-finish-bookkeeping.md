---
name: sm-finish-bookkeeping
description: Execute mechanical finish steps before SM writes summary. Use when FINISH_STATE detected.
tools: Bash, Read, Grep
model: haiku
---

# SM Finish Bookkeeping

Gather data for story completion. This is primarily a read operation.

## Step 1: Check PR Status

```bash
cd $CLAUDE_PROJECT_DIR/{REPO}
gh pr view {BRANCH} --json state,merged,mergeable,url 2>/dev/null || echo "NO_PR"
```

## Step 2: Auto-fix Lint Issues

```bash
cd $CLAUDE_PROJECT_DIR/{REPO}
just lint-fix 2>&1 || true
git status --short
```

If files changed, commit them.

## Step 3: Check Jira Status

```bash
jira issue view {JIRA_KEY} --raw 2>/dev/null | jq -r '{status: .fields.status.name}'
```

## Step 4: Read Sprint Entry

```bash
grep -A 20 "{STORY_ID}" $CLAUDE_PROJECT_DIR/sprint/current-sprint.yaml | head -25
```

## Step 5: Read Session File

```bash
cat $CLAUDE_PROJECT_DIR/.session/{STORY_ID}-session.md
```

## Return Format

```json
{
  "story_id": "{STORY_ID}",
  "pr_status": {"api": "merged|open|NO_PR", "ui": "merged|open|NO_PR"},
  "pr_urls": {"api": "...", "ui": "..."},
  "lint_status": {"api": "clean|fixed", "ui": "clean|fixed"},
  "jira_current": "In Progress",
  "jira_ready": true,
  "session_content": "[full markdown]",
  "archive_path": "sprint/archive/story-{STORY_ID}-{DATE}.md",
  "issues": [],
  "ready_to_finish": true
}
```

Set `ready_to_finish: false` if critical issues found (uncommitted changes, session file missing).
