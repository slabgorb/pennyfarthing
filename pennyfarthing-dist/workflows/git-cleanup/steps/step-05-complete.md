# Step 5: Complete

Cleanup workflow finished. Final summary and next steps.

## Summary

```
## Git Cleanup Complete ✅

### Session Summary
- Groups committed: {n}
- Files organized: {count}
- Repos updated: {list}
- Pushed to remote: {yes/no}

### Commits
{list of commit hashes and messages by repo}
```

## Post-Cleanup Tasks

### If Changes Remain

Intentionally skipped files can be:
- Committed in next cleanup session
- Added to .gitignore if generated
- Discarded with `git -C {repo} checkout -- {file}`

### Branch Maintenance

Run periodically to clean up merged branches:

```bash
# For each repo
git -C {repo_path} branch --merged develop | grep -v "develop\|main" | xargs -r git branch -d
```

## Quick Re-run

To run git-cleanup again:

```
/git-cleanup
```

Or for a quick status check across all repos:

```bash
.pennyfarthing/scripts/git/git-status-all.sh
```

---

**Cleanup complete.** All repos are organized.

<!-- CYCLIST:CONTINUE -->
