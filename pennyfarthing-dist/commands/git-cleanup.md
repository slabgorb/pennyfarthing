---
description: Clean up git repos by organizing changes into proper commits/branches by initiative
workflow: git-cleanup
---

# Git Cleanup Command

Organize uncommitted changes into proper commits and branches.

## Quick Start

Run `/git-cleanup` to start the stepped workflow.

## Workflow Steps

| Step | Name | Purpose |
|------|------|---------|
| 1 | Analyze | Check stash, gather git status |
| 2 | Categorize | Group changes by initiative |
| 3 | Execute | Create branches, commit, merge |
| 4 | Verify | Confirm clean state, push |
| 5 | Complete | Verify stash empty, summary |

## Critical Rules

- **NEVER** commit directly to develop (use branches)
- **NEVER** force push
- **ALWAYS** check stash before starting (`git stash list`)
- **ALWAYS** clear stash after completing (with user permission)
- **ALWAYS** check stash before assuming work is lost

## Stash Safety

Work is rarely lost - it's usually in stash:

```bash
git stash list              # Check for saved work
git stash show -p stash@{0} # See contents
git stash pop               # Restore it
```

## Commit Types

| Prefix | Use For |
|--------|---------|
| `feat:` | New features |
| `fix:` | Bug fixes |
| `chore:` | Maintenance |
| `docs:` | Documentation |
| `refactor:` | Code improvement |
| `test:` | Test changes |
