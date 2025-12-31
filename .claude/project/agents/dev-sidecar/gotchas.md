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

## Scripts Path Resolution

### run.sh Looking in Wrong Location
**Problem:** `run.sh` was hardcoded to look for scripts at `.claude/pennyfarthing/scripts/` but npm-installed projects have scripts at `.claude/scripts/` (symlinked to node_modules)
**Root cause:** Path divergence between dogfooding setup and npm installation:
- Pennyfarthing repo: `.claude/pennyfarthing/` → `../pennyfarthing-dist/`
- npm-installed: `.claude/scripts/` → `node_modules/pennyfarthing/pennyfarthing-dist/scripts/`
**Solution:** Changed `run.sh` line 40 from `.claude/pennyfarthing/scripts` to `.claude/scripts`
**Fixed:** 2024-12-31

---

*Add implementation gotchas discovered during development below*
