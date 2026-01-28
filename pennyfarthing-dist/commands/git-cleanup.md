---
description: Clean up git repos by organizing changes into proper commits/branches by initiative
workflow: git-cleanup
---

# Git Cleanup Command

Analyze and organize uncommitted changes across all repos into proper commits and branches based on initiative/feature groupings.

## BikeLane Workflow

This command uses the **git-cleanup** stepped workflow:

| Step | Name | Purpose |
|------|------|---------|
| 1 | Analyze | Gather git status across all repos |
| 2 | Categorize | Group changes by initiative type |
| 3 | Execute | Create branches, commit, merge |
| 4 | Verify | Confirm clean state, optionally push |
| 5 | Complete | Summary and next steps |

## Quick Start

Run `/git-cleanup` to start the workflow.

## Git Workflow Rules

**CRITICAL: Never commit directly to develop.** Branch protection hooks will reject direct commits.

All changes follow this pattern:
1. Create branch from develop
2. Commit changes to branch
3. Merge to develop locally
4. Push develop (branches stay local)

## Categorization Reference

| Prefix | Type | Branch Pattern |
|--------|------|----------------|
| `docs:` | Documentation | `docs/description` |
| `chore:` | Maintenance | `chore/description` |
| `chore(sprint):` | Sprint tracking | `chore/sprint-update` |
| `feat:` | New feature | `feat/story-id-desc` |
| `fix:` | Bug fix | `fix/issue-desc` |
| `refactor:` | Code improvement | `refactor/description` |
| `test:` | Test changes | `test/description` |

## Manual Quick Reference

For quick cleanup without the full workflow:

```bash
# View what needs cleanup
./scripts/run.sh git/git-status-all.sh

# Standard cleanup sequence
git stash push -m "cleanup-wip"
git checkout develop && git pull
git checkout -b chore/cleanup-$(date +%Y%m%d)
git stash pop
git add <files>
git commit -m "chore: description"
git checkout develop
git merge chore/cleanup-$(date +%Y%m%d)
git branch -d chore/cleanup-$(date +%Y%m%d)
git push origin develop
```

## Stash Management (CRITICAL)

**Before starting ANY cleanup:**

```bash
# 1. CHECK STASH FIRST
git stash list

# If stash is NOT empty, STOP and ask user before proceeding
```

**If stash has entries:**
- Show user: `git stash list`
- Ask: "Stash contains saved work. Clear it completely before proceeding?"
- If user agrees: `git stash clear`
- If user declines: STOP - do not proceed with cleanup

**When using stash during cleanup:**
- Mark ALL stash saves clearly: `git stash push -m "CLEANUP-WIP: {description}"`
- After EVERY stash pop, verify it worked: `git stash list`
- If commit fails (hook rejection, validation error): **CHECK STASH FIRST** before assuming work is lost

**Before panicking about lost work:**
```bash
# Work is probably in stash!
git stash list
git stash show -p stash@{0}  # See what's there
git stash pop                 # Restore it
```

**After cleanup is complete:**
```bash
# Verify stash is empty
git stash list
# If not empty, either pop remaining work or clear with user permission
```

## Safety Rules

- **NEVER** commit directly to develop
- **NEVER** force push
- **NEVER** commit secrets (.env, credentials)
- **ALWAYS** show diff before committing
- **ALWAYS** use branches
- **ALWAYS** check stash before assuming work is lost
- **ALWAYS** clear stash completely after cleanup is done
