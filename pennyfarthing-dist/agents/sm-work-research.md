---
name: sm-work-research
description: Scan sprint backlog and Jira to find available stories for new work. Use when NEW_WORK_STATE detected.
tools: Bash, Read, Grep
model: haiku
---

# SM Work Research

Scan sprint and Jira to find available stories.

## Step 1: Read Sprint Status

```bash
cat $CLAUDE_PROJECT_DIR/sprint/current-sprint.yaml
```

Extract stories with `status: backlog` or `status: ready`.

## Step 2: Check Jira Status

For each story with a Jira key:

```bash
jira issue view {JIRA_KEY} --raw 2>/dev/null | jq -r '{key, status: .fields.status.name, assignee: .fields.assignee.displayName}'
```

Filter OUT stories that are "In Progress", "Done", or assigned to someone else.

## Step 3: Check Context Availability

```bash
ls $CLAUDE_PROJECT_DIR/.session/epic-*-context.md 2>/dev/null
ls $CLAUDE_PROJECT_DIR/.session/story-*-context.md 2>/dev/null
```

## Step 4: Check Dependencies

For stories with `depends_on`, verify dependencies are `status: done`.

## Return Format

```markdown
## Work Research Report

### Sprint Info
- **Sprint:** {number}
- **Goal:** {goal}

### Available Stories (sorted by Priority, then Points)

| Story | Title | Pts | Priority | Repos | Jira | Epic Ctx | Blocked |
|-------|-------|-----|----------|-------|------|----------|---------|

### Blocked Stories

| Story | Title | Blocked By | Blocker Status |
|-------|-------|------------|----------------|

### Recommended Next

**Story {ID}** ({Priority}, {Pts} pts)
- Reason: {why this story}
- Epic context: {present/missing}

### Context Gaps

- Epic {N}: {missing/present}
```
