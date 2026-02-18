---
description: Repository operations - status, cleanup, branches, and release management
args: "[status|cleanup|branches|release] [args...]"
---

# Git Operations

<purpose>
Manage git operations across all configured repos. Consolidates repository status, git cleanup, branch creation, and release management into a single resource group.
</purpose>

## Commands

### `/pf-git status`

Check git status of all project repos.

```bash
pf.sh git status [--brief]
```

Shows branch, uncommitted changes, and ahead/behind status for each configured repo.

### `/pf-git cleanup`

Organize uncommitted changes into proper commits and branches.

**When this subcommand is invoked, immediately start the stepped workflow:**

```bash
pf.sh workflow start git-cleanup
```

Then follow each step's instructions. Use `pf.sh workflow complete-step git-cleanup` to advance between steps. The workflow handles multi-repo analysis, change categorization, branch creation, commits, and push.

### `/pf-git branches <story-id>`

Create feature branches in both repos from a story.

```bash
pf.sh git branches 86-3
```

### `/pf-git release`

Interactive release with verification gates.

```bash
pf.sh git release
```

Starts the release stepped workflow — an 11-step process with gates at each stage.

## Quick Reference

| Command | Description |
|---------|-------------|
| `/pf-git status` | Check all repo status |
| `/pf-git cleanup` | Organize changes into commits/branches |
| `/pf-git branches <id>` | Create feature branches from story |
| `/pf-git release` | Interactive release workflow |

## CLI Equivalent

All commands are also available via `pf.sh git`:

```bash
pf.sh git status
pf.sh git cleanup
pf.sh git branches 86-3
pf.sh git release
```

## Related

- `/pf-chore` — Quick commit for small changes
- `/pf-standalone` — Wrap changes into standalone story + PR
