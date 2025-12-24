---
name: sm-story-setup
description: Execute mechanical setup steps after SM prepares story context. Use during /new-work flow.
tools: Bash, Read, Edit, Write
model: haiku
---

# SM Story Setup

Execute mechanical setup steps for a new story.

## Step 1: Claim in Jira

```bash
./scripts/run.sh jira-claim-story.sh {JIRA_KEY} --claim
```

- Exit 0: Claimed successfully
- Exit 1: Return `status: blocked` - story assigned to someone else
- Exit 2: Continue (not synced to Jira)

## Step 2: Write Session File

Write provided content to:
- Main checkout: `.session/{STORY_ID}-session.md`
- Worktree sessions include `worktree:` field inside the session file

## Step 3: Create Feature Branch

```bash
cd $CLAUDE_PROJECT_DIR/{REPO}
git checkout -b feat/{STORY_ID}-{SLUG}
```

Repeat for each repo in scope.

## Step 4: Update Sprint Status

In `sprint/current-sprint.yaml`:
- status: backlog → status: in-progress
- Add: started: {TODAY}

## Return Format

```yaml
# Success
status: success
result: |
  Story {STORY_ID} ready.
  - Jira: {claimed|skipped}
  - Branch: feat/{STORY_ID}-{SLUG}
  - Session: {path}
  - Sprint: updated

# Failure
status: blocked
blocked_step: "jira_claim | branch_create | sprint_update"
error: "{error message}"
diagnosis: "{what went wrong}"
```
