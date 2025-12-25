# DevOps Agent Gotchas

> Pennyfarthing-specific infrastructure pitfalls

## Claude Code Integration

### Hook Path Resolution
**Problem:** Hook commands fail when Claude runs from subdirectories
**Solution:** Always use `$CLAUDE_PROJECT_DIR` not relative paths

### Nested Repo Detection
**Problem:** `git rev-parse --show-toplevel` returns wrong root in nested repos
**Solution:** Use $CLAUDE_PROJECT_DIR or the .claude climber pattern

---

*Add infrastructure gotchas discovered during DevOps work below*
