# DevOps Agent Gotchas

> Pennyfarthing-specific infrastructure pitfalls

## Claude Code Integration

### Hook Path Resolution
**Problem:** Hook commands fail when Claude runs from subdirectories
**Solution:** Always use `$CLAUDE_PROJECT_DIR` not relative paths

### Nested Repo Detection
**Problem:** `git rev-parse --show-toplevel` returns wrong root in nested repos
**Solution:** Use $CLAUDE_PROJECT_DIR or the .claude climber pattern

## Git Index Lock Conflicts

### Problem: "Unable to create .git/index.lock: File exists"
**Symptom:** Frequent git commit failures with index.lock errors
**Root Cause:** statusline.sh was using `git status --porcelain` which locks the index, causing race conditions when multiple Claude sessions or tool calls trigger concurrent statusline updates during git operations.

**Solution:** Use non-locking git commands for dirty detection:
```bash
# Bad - locks index, causes conflicts
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then ...

# Good - read-only, no locking
if ! git diff-index --quiet HEAD -- 2>/dev/null || \
   [ -n "$(git ls-files --others --exclude-standard | head -1)" ]; then ...
```

**Fixed in:** statusline.sh (2026-01-08)

---

*Add infrastructure gotchas discovered during DevOps work below*
