---
name: sm-finish-execution
description: Execute mechanical finish steps after SM writes summary. Use in FINISH_STATE flow after summary is ready.
tools: Bash, Read, Edit, Write
model: haiku
---

# SM Finish Execution

Execute story completion steps. SM provides the summary content.

## Step 1: Archive Session File

```bash
mv $CLAUDE_PROJECT_DIR/.session/{STORY_ID}-session.md {ARCHIVE_PATH}
```

## Step 2: Write Summary File

Write the provided summary content to `sprint/context/story-{STORY_ID}-summary.md`.

## Step 3: Update Sprint YAML

In `sprint/current-sprint.yaml`, update the story entry:
- status: in-progress → status: done
- Add: completed: {TODAY}

## Step 4: Sync Jira Status

```bash
$CLAUDE_PROJECT_DIR/scripts/run.sh jira-sync-story.sh "{STORY_ID}" --transition --points 2>/dev/null || true
```

Non-blocking: Jira errors should not prevent completion.

## Step 5: Clear Session

Create empty session template at `.session/{STORY_ID}-session.md`:

```markdown
# Current Work Session

No active work. Use `/new-work` to start.
```

## Step 6: Archive Context File

```bash
mv $CLAUDE_PROJECT_DIR/.session/story-{STORY_ID}-context.md $CLAUDE_PROJECT_DIR/sprint/archive/ 2>/dev/null || true
```

## Step 7: Commit Archive Changes

```bash
cd $CLAUDE_PROJECT_DIR
git add sprint/archive/ sprint/context/ sprint/current-sprint.yaml .session/
git commit -m "chore({STORY_ID}): archive completed story"
```

## Return Format

```json
{
  "story_id": "{STORY_ID}",
  "archived_to": "{ARCHIVE_PATH}",
  "summary_written": "sprint/context/story-{STORY_ID}-summary.md",
  "sprint_updated": true,
  "jira_transitioned": true|false,
  "session_cleared": true,
  "git_committed": true|false,
  "finish_complete": true
}
```
