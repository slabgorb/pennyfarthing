# Git Scripts

Scripts for Git operations, branching, and worktree management.

## CLI Commands (preferred)

All git operations are available via the `pf.sh git` CLI:

| Command | Purpose |
|---------|---------|
| `pf.sh git status [--brief]` | Show git status across all repos |
| `pf.sh git branches <name> [--repos all\|api\|ui]` | Create feature branches in repos |
| `pf.sh git worktree create <name> <branch>` | Create worktrees for parallel work |
| `pf.sh git worktree remove <name>` | Remove worktree and clean up |
| `pf.sh git worktree list` | List all active worktrees |
| `pf.sh git worktree status` | Show detailed worktree status |
| `pf.sh git install-hooks` | Install git hooks with .d/ dispatcher |
| `pf.sh git cleanup` | Organize changes into commits/branches |

## Legacy Scripts (deprecated shims)

These scripts now forward to `pf.sh git` commands:

| Script | Forwards to |
|--------|-------------|
| `git-status-all.sh` | `pf.sh git status` |
| `create-feature-branches.sh` | `pf.sh git branches` |
| `worktree-manager.sh` | `pf.sh git worktree` |
| `install-git-hooks.sh` | `pf.sh git install-hooks` |
| `release.sh` | Release workflow (use `/pf-workflow start release`) |

## Ownership

- **Primary users:** SM agent, DevOps agent
- **Maintained by:** Core Pennyfarthing team
