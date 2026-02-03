---
description: Clean up git repos by organizing changes into proper commits/branches by initiative
workflow: git-cleanup
---

# Git Cleanup Command

Organize uncommitted changes into proper commits and branches across **all configured repos**.

## Quick Start

Run `/git-cleanup` to start the stepped workflow.

## Multi-Repo Support

This workflow handles multiple repos defined in `.claude/project/pennyfarthing-settings.yaml`.

**CRITICAL:** Always use the multi-repo status script, not plain `git status`:

```bash
.pennyfarthing/scripts/git/git-status-all.sh
```

For operations in a specific repo, use `git -C {repo_path}`:

```bash
git -C pennyfarthing status --short
git -C pennyfarthing diff
```

## Workflow Steps

| Step | Name | Purpose |
|------|------|---------|
| 1 | Analyze | Gather status from ALL repos |
| 2 | Categorize | Group changes by initiative (may span repos) |
| 3 | Execute | Create branches, commit, merge in each repo |
| 4 | Verify | Confirm clean state across all repos |
| 5 | Complete | Push and summary |

## Critical Rules

- **NEVER** commit directly to develop (use branches)
- **NEVER** force push
- **ALWAYS** use `git -C {repo_path}` for subrepo operations
- **ALWAYS** check ALL repos, not just the orchestrator

## Commit Types

| Prefix | Use For |
|--------|---------|
| `feat:` | New features |
| `fix:` | Bug fixes |
| `chore:` | Maintenance |
| `docs:` | Documentation |
| `refactor:` | Code improvement |
| `test:` | Test changes |
