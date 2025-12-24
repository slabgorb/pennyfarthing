# SM Story Setup Subagent

**Purpose:** Execute mechanical setup steps after SM (Opus) prepares story context
**Model:** haiku
**Called by:** SM agent during /new-work flow (Phase 3)

## Task Tool Configuration

```yaml
subagent_type: "general-purpose"
model: "haiku"
description: "story setup"
```

## Prompt Template

Replace placeholders with actual values:
- `{STORY_ID}` - e.g., "36-2"
- `{JIRA_KEY}` - e.g., "MSSCI-11066"
- `{SESSION_FILE_CONTENT}` - Full markdown content prepared by SM
- `{REPO}` - "api", "ui", or both
- `{SLUG}` - kebab-case story description
- `{TODAY}` - YYYY-MM-DD format
- `{WORKTREE_NAME}` - (optional) e.g., "wt-36-2" if parallel work
- `{WORKTREE_PATH}` - (optional) e.g., "/path/to/worktrees/wt-36-2"
- `{API_PORT}` - (optional) e.g., "8082" for worktree
- `{UI_PORT}` - (optional) e.g., "5175" for worktree

---

You are a story setup assistant. Execute these mechanical steps for story {STORY_ID}.

## Project Root
$CLAUDE_PROJECT_DIR (set by SessionStart hook)

## Step 1: Claim in Jira
```bash
./scripts/run.sh jira-claim-story.sh {JIRA_KEY} --claim
```
- Exit 0: Claimed successfully - proceed
- Exit 1: STOP and report "Story assigned to someone else"
- Exit 2: Continue (not synced to Jira)

## Step 2: Write Session File

**Session file path:** `.session/{STORY_ID}-session.md`
- Example: `.session/36-2-session.md`
- Story ID comes from sprint YAML

Write this content to the session file:

```markdown
{SESSION_FILE_CONTENT}
```

**If worktree mode**, add this section after Story Info:

```markdown
## Worktree Context
worktree: {WORKTREE_NAME}
path: {WORKTREE_PATH}
api_port: {API_PORT}
ui_port: {UI_PORT}
```

## Step 3: Create Feature Branch

**Main checkout:**
```bash
cd $CLAUDE_PROJECT_DIR/${REPO} && git checkout -b feat/{STORY_ID}-{SLUG}
```

**Worktree mode:**
```bash
cd {WORKTREE_PATH}/${REPO} && git checkout -b feat/{STORY_ID}-{SLUG}
```

If both repos: Repeat for API and UI

## Step 4: Update Sprint Status
In sprint/current-sprint.yaml, find the story entry and change:
- status: backlog → status: in-progress
- Add: started: {TODAY}

## Step 5: Output Summary

```markdown
## Story {STORY_ID} Ready

**{TITLE}** | {POINTS} pts | {PRIORITY}

### Setup Complete
- [x] Jira claimed: {JIRA_KEY}
- [x] Context file: .session/story-{STORY_ID}-context.md
- [x] Session file: {SESSION_FILE_PATH}
- [x] Branch: feat/{STORY_ID}-{SLUG}
- [x] Sprint status: in-progress
{WORKTREE_INFO}

### Acceptance Criteria
{AC_LIST_NUMBERED}

### Handoff to {NEXT_AGENT}
{HANDOFF_MESSAGE}
```

**If worktree mode**, include in `{WORKTREE_INFO}`:
```
- [x] Worktree: {WORKTREE_NAME}
- [x] Path: {WORKTREE_PATH}
- [x] Ports: API={API_PORT}, UI={UI_PORT}
```

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
| Jira claim failed | Story assigned to someone else | Report to SM - choose different story |
| Branch exists | Someone already started this | Check if it's old work, ask SM to decide |
| Sprint YAML not found | File moved/missing | Check for file at expected path |
| Git checkout failed | Uncommitted changes | Report - SM must handle existing work first |

### Escalation Format

If unable to complete setup:
```
SETUP BLOCKED

Step failed: [which step]
Error: [error message]
Diagnosis: [what went wrong]

Recommended fix: [what SM should do]
```

**Never silently fail.** Always report what happened.
