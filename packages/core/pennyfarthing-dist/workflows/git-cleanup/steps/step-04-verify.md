# Step 4: Verify and Push

Verify the cleanup was successful and optionally push to remote.

## Objective

1. Confirm all changes are properly committed
2. Verify no uncommitted changes remain (or only intentionally skipped)
3. Show commit history for review
4. Push to remote if requested

## Verification

### 4.1 Final Git Status

```bash
echo "=== Final State ==="
./scripts/run.sh git/git-status-all.sh
```

Expected: Clean working directory or only intentionally skipped files.

### 4.2 Review Commits

```bash
echo "=== New Commits ==="
git log --oneline develop@{1}..develop 2>/dev/null || git log --oneline -5
```

### 4.3 Branch Cleanup Check

```bash
echo "=== Remaining Branches ==="
git branch | grep -v "develop\|main"
```

All cleanup branches should be deleted after merge.

### 4.4 Stash Status

```bash
echo "=== Stash Status ==="
git stash list | head -5
```

If stash entries remain from cleanup, either:
- Pop and commit (if intentional skip)
- Drop (if no longer needed)

## Summary Report

```
## Git Cleanup Summary

### Commits Created
| Commit | Type | Message |
|--------|------|---------|
| abc1234 | chore | chore(sprint): update tracking |
| def5678 | docs | docs: update README |

### Final State
- Working directory: {clean / X files remaining}
- Unpushed commits: {n}
- Stash entries: {n}

### Remaining Work
{list any skipped files or deferred changes}
```

## Push Decision

**Push to remote?**

- **Yes**: Push develop to origin
- **No**: Keep commits local for now

```bash
# If pushing
git push origin develop
```

---

**[P]** Push to remote now
**[L]** Keep local (don't push)
**[R]** Review commits again before deciding

<!-- CYCLIST:CHOICES:P,L,R -->
