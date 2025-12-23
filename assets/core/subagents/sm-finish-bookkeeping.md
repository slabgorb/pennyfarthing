# SM Finish Bookkeeping Subagent

**Purpose:** Execute mechanical finish steps before SM writes summary
**Model:** haiku
**Called by:** SM agent when FINISH_STATE detected

## Task Tool Configuration

```yaml
subagent_type: "general-purpose"
model: "haiku"
description: "finish bookkeeping"
```

## Prompt Template

Replace placeholders:
- `{STORY_ID}` - e.g., "32-8"
- `{JIRA_KEY}` - e.g., "MSSCI-11027"
- `{REPOS}` - "api", "ui", or "both"
- `{BRANCH}` - e.g., "feat/32-8-hunt-summary"

---

You are a finish bookkeeping assistant. Execute mechanical finish steps for story {STORY_ID}.

## Project Root
$PROJECT_ROOT (set by SessionStart hook)

## Step 1: Check PR Status

```bash
# For each repo in {REPOS}
cd $PROJECT_ROOT/${REPO}
gh pr view {BRANCH} --json state,merged,mergeable,url 2>/dev/null || echo "NO_PR"
```

Report:
- `merged` - PR already merged, proceed
- `open` - PR exists but not merged
- `NO_PR` - No PR found (may need to create or merge locally)

## Step 2: Auto-fix Lint Issues

```bash
# For each repo in {REPOS}
cd $PROJECT_ROOT/${REPO}

# Check current branch
git branch --show-current

# Run lint
just lint 2>&1 || true

# If there are fixable issues, fix them
just lint-fix 2>&1 || true

# Check if any files changed
git status --short
```

If files changed:
```bash
git add -A
git commit -m "fix: lint issues for story {STORY_ID}"
git push origin {BRANCH}
```

Report: files fixed, commit hash, or "clean"

## Step 3: Check Jira Status

```bash
jira issue view {JIRA_KEY} --raw 2>/dev/null | jq -r '{
  status: .fields.status.name,
  assignee: .fields.assignee.displayName,
  key: .key
}'
```

Report: current status, ready for "Done" transition (yes/no)

## Step 4: Read Sprint Entry

```bash
# Find and extract story entry from sprint YAML
grep -A 20 "{STORY_ID}" $PROJECT_ROOT/sprint/current-sprint.yaml | head -25
```

Report:
- Current status field
- PR link present (yes/no)
- Completed date present (yes/no)

## Step 5: Read Session File

```bash
cat $PROJECT_ROOT/.session/current_work.md
```

Extract:
- Full session content (for archiving)
- Acceptance criteria status (checked/unchecked)
- Story title and description

## Step 6: Calculate Archive Path

```bash
# Today's date
date +%Y%m%d
```

Archive path: `sprint/archive/story-{STORY_ID}-{DATE}.md`

## Output Format

```json
{
  "story_id": "{STORY_ID}",
  "jira_key": "{JIRA_KEY}",
  "pr_status": {
    "api": "merged | open | NO_PR",
    "ui": "merged | open | NO_PR"
  },
  "pr_urls": {
    "api": "https://github.com/...",
    "ui": "https://github.com/..."
  },
  "lint_status": {
    "api": "clean | fixed (3 files)",
    "ui": "clean | fixed (1 file)"
  },
  "jira_current": "In Progress",
  "jira_ready": true,
  "sprint_entry": {
    "status": "in-progress",
    "pr_link": true,
    "completed": false
  },
  "session_content": "[full markdown content]",
  "acceptance_criteria": {
    "total": 4,
    "checked": 4
  },
  "archive_path": "sprint/archive/story-32-8-20251220.md",
  "issues": [],
  "ready_to_finish": true
}
```

## Error Handling

If any step fails:
1. Log the error in `issues` array
2. Set `ready_to_finish` to false if critical
3. Continue with other steps

Critical failures:
- Uncommitted changes that can't be committed
- Jira unreachable
- Session file missing

Non-critical (warn but proceed):
- PR not merged (SM can decide)
- Lint issues unfixable
- Sprint YAML parse issues

---

## Notes

- This subagent does the mechanical checks
- SM uses the output to decide whether to proceed
- SM writes the summary content (not this subagent)
- If `ready_to_finish` is false, SM should address issues first
