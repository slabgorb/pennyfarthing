---
description: Check git status of all project repos
---

# Repository Status Check

Check the git status of all project repos at once.

## Configuration

Repos are configured in `.claude/project/repos.yaml`. The script automatically reads this configuration.

## Instructions

Run this command to show the status of all repos:

```bash
$CLAUDE_PROJECT_DIR/scripts/run.sh git/git-status-all.sh
```

For a brief one-line-per-repo summary:

```bash
$CLAUDE_PROJECT_DIR/scripts/run.sh git/git-status-all.sh --brief
```

## What It Shows

For each configured repo:
- Current branch
- Whether there are uncommitted changes
- Whether the repo is ahead/behind origin
- Unpushed commits (if any)

## Adding More Repos

To add repos, edit `.claude/project/repos.yaml`:

```yaml
repos:
  my-api:
    path: my-api        # relative to project root
    type: api
    language: go
  my-ui:
    path: my-ui
    type: ui
    language: typescript
```
