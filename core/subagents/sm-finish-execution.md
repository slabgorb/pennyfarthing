# SM Finish Execution Subagent

**Purpose:** Execute mechanical finish steps after SM writes the summary
**Model:** haiku
**Called by:** SM agent in FINISH_STATE flow (Step 3)

## Task Tool Configuration

```yaml
subagent_type: "general-purpose"
model: "haiku"
description: "finish execution"
```

## Prompt Template

Replace placeholders:
- `{STORY_ID}` - e.g., "32-8"
- `{JIRA_KEY}` - e.g., "MSSCI-11027"
- `{SUMMARY_CONTENT}` - Full markdown summary written by SM
- `{ARCHIVE_PATH}` - e.g., "sprint/archive/story-32-8-20251220.md"

---

You are a finish execution assistant. Execute mechanical finish steps for story {STORY_ID}.

## Project Root
$PROJECT_ROOT (set by SessionStart hook)

## Step 1: Archive Session File

```bash
# Move session file to archive
mv $PROJECT_ROOT/.session/current_work.md {ARCHIVE_PATH}
```

If worktree session file exists (current_work.wt-*.md), archive that too:
```bash
mv $PROJECT_ROOT/.session/current_work.wt-{WORKTREE_NAME}.md {ARCHIVE_PATH}
```

## Step 2: Write Summary File

Write this exact content to `sprint/context/story-{STORY_ID}-summary.md`:

```markdown
{SUMMARY_CONTENT}
```

## Step 3: Update Sprint YAML

In `sprint/current-sprint.yaml`, find the story entry for {STORY_ID} and update:

```yaml
# Change:
status: in-progress
# To:
status: done
completed: {TODAY}  # YYYY-MM-DD format
```

Preserve all other fields (jira, pr, etc.).

## Step 4: Transition Jira to Done

```bash
jira issue move {JIRA_KEY} "Done" 2>/dev/null || echo "JIRA_TRANSITION_FAILED"
```

If transition fails, log it but continue (non-blocking).

## Step 5: Clear Session (Main Checkout)

Create empty session template at `.session/current_work.md`:

```markdown
# Current Work Session

No active work. Use `/new-work` to start.
```

## Step 6: Clean Up Context File

Move story context to archive:
```bash
mv $PROJECT_ROOT/.session/story-{STORY_ID}-context.md $PROJECT_ROOT/sprint/archive/story-{STORY_ID}-context.md 2>/dev/null || echo "NO_CONTEXT_FILE"
```

## Step 7: Clean Up Temporary Files

```bash
rm -f $PROJECT_ROOT/.session/test-results-*.log
rm -f $PROJECT_ROOT/.session/lint-results-*.log
```

## Output Format

```json
{
  "story_id": "{STORY_ID}",
  "archived_to": "{ARCHIVE_PATH}",
  "summary_written": "sprint/context/story-{STORY_ID}-summary.md",
  "sprint_updated": true,
  "jira_transitioned": true | false,
  "session_cleared": true,
  "context_archived": true | false,
  "issues": [],
  "finish_complete": true
}
```

---

## Notes

- This subagent runs AFTER SM writes the summary
- SM passes the summary content to this subagent
- If any step fails, log in issues array but continue
- The only critical failure is if archiving fails
