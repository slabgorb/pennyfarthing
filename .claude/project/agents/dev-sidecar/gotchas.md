# Dev Agent Gotchas

> Pennyfarthing-specific implementation pitfalls

## Path Issues

### Relative Path Failures
**Problem:** Using relative paths that assume current directory
**Solution:** Always use `$PROJECT_ROOT/$REPO_NAME` pattern

### Hook Paths in settings.local.json
**Problem:** Relative paths break when Claude runs from subdirectories
**Solution:** Use `$CLAUDE_PROJECT_DIR` for all hook commands

## Handoff Gotchas

### Not Writing Assessment
**Problem:** Offering handoff without writing assessment to session file
**Solution:** Always Edit session file BEFORE spawning handoff subagent

### Incomplete PR Description
**Problem:** PR description missing context for reviewer
**Solution:** Include summary, test plan, and acceptance criteria references

---

*Add implementation gotchas discovered during development below*
