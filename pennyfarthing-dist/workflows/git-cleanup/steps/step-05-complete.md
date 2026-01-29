# Step 5: Complete

Cleanup workflow finished. Final summary and next steps.

## Summary

```
## Git Cleanup Complete ✅

### Session Summary
- Groups committed: {n}
- Files organized: {count}
- Pushed to remote: {yes/no}

### Commits
{list of commit hashes and messages}

### Time Saved
Organizing {n} scattered changes into {m} proper commits
with conventional commit messages and branch workflow.
```

## Post-Cleanup Tasks

### If Changes Remain

Intentionally skipped files can be:
- Committed in next cleanup session
- Added to .gitignore if generated
- Discarded with `git checkout -- {file}`

### Branch Maintenance

Run periodically to clean up merged branches:

```bash
# Delete branches merged into develop
git branch --merged develop | grep -v "develop\|main" | xargs -r git branch -d
```

### Stash Verification (MANDATORY)

**Before completing, verify stash is empty:**

```bash
git stash list
```

**If stash has entries:**
- If CLEANUP-WIP entries: These are leftover from this session - pop or clear them
- If other entries: Ask user before clearing

**Clear stash completely when done:**
```bash
# After confirming with user
git stash clear
```

**Why this matters:** Leftover stash entries cause confusion in future cleanups and can lead to lost work if forgotten.

## Quick Re-run

To run git-cleanup again:

```
/git-cleanup
```

Or for a quick status check:

```bash
.pennyfarthing/scripts/git/git-status-all.sh
```

---

**Cleanup complete.** Working directory is organized.

<!-- CYCLIST:CONTINUE -->
