# Step 4: Verify and Push

Verify the cleanup was successful and push to remote.

## Objective

1. Confirm all changes are properly committed across all repos
2. Verify no uncommitted changes remain (or only intentionally skipped)
3. Show commit history for review
4. Push to remote

## Verification

### 4.1 Final Git Status (All Repos)

```bash
.pennyfarthing/scripts/git/git-status-all.sh
```

Expected: Clean working directory in all repos, or only intentionally skipped files.

### 4.2 Review Commits (Each Repo)

```bash
# For each repo that had changes
git -C {repo_path} log --oneline -5
```

### 4.3 Branch Cleanup Check

```bash
# For each repo
git -C {repo_path} branch | grep -v "develop\|main"
```

All cleanup branches should be deleted after merge.

## Summary Report

```
## Git Cleanup Summary

### Commits Created

**pennyfarthing:**
| Commit | Message |
|--------|---------|
| abc1234 | feat(cyclist): replace todos REST polling with WebSocket |

**pennyfarthing-orchestrator:**
| Commit | Message |
|--------|---------|
| (none) | |

### Final State
- pennyfarthing: {clean / X files remaining}
- orchestrator: {clean / X files remaining}

### Remaining Work
{list any skipped files or deferred changes}
```

## Push

Push develop to remote for each repo with new commits:

```bash
git -C {repo_path} push origin develop
```

---

**[P]** Push all repos to remote
**[L]** Keep local (don't push yet)
**[R]** Review commits again

<!-- CYCLIST:CHOICES:P,L,R -->
