# Git Scripts

Scripts for Git operations, branching, and release management.

## Scripts

| Script | Purpose |
|--------|---------|
| `create-feature-branches.sh` | Create feature branches in repos |
| `git-status-all.sh` | Show git status across all repos |
| `worktree-manager.sh` | Manage git worktrees for parallel work |
| `install-git-hooks.sh` | Install git hooks in project |
| `release.sh` | Release workflow (merge develop to main) |

## Usage

```bash
.pennyfarthing/scripts/core/run.sh git/create-feature-branches.sh feat/my-feature
.pennyfarthing/scripts/core/run.sh git/release.sh
```

## Ownership

- **Primary users:** SM agent, DevOps agent
- **Maintained by:** Core Pennyfarthing team
