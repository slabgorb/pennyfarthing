# Orchestrator Gotchas

> Critical pitfalls discovered in Pennyfarthing development

## Environment Variable Gotchas

### $CLAUDE_PROJECT_DIR Not Available
**Problem:** Using `$CLAUDE_PROJECT_DIR` in Bash tool invocations
**Context:** This variable is ONLY set for hooks and statusLine
**Solution:** Use the .claude climber pattern for Bash tool calls

### git rev-parse Fails in Nested Repos
**Problem:** `git rev-parse --show-toplevel` returns wrong root
**Solution:** Use .claude climber or $CLAUDE_PROJECT_DIR (in hooks)

## Skill File Gotchas

### Code Blocks as Documentation
**Problem:** Fenced code blocks in skills are NOT executed
**Solution:** Write explicit "Use Bash tool to run:" instructions

## Config File Gotchas

### Skip-or-Overwrite Logic
**Problem:** Init skips files that exist, missing critical hooks
**Solution:** Merge required fields, preserve user customizations

## Hook Timing Gotchas

### Agent Cleanup in Wrong Hook
**Problem:** Agent marker cleanup in `Stop` hook fails silently when session ends
**Context:** Stop hook may not run reliably on all exit paths
**Solution:** Move cleanup to `SessionStart` hook (runs at next session start)

### Legacy Path Pollution
**Problem:** Upgrades leave files in old locations (e.g., `.claude/statusline.sh`)
**Context:** CLI update doesn't clean old install locations
**Solution:** Add explicit cleanup of known legacy paths in update command

---

## Installation Gotchas

### statusline.sh Path Mismatch
**Problem:** `init.ts` looked for `statusline.sh` in wrong location
**Context:** File was at `scripts/statusline.sh`, code expected `statusline.sh`
**Solution:** Always verify source paths match actual file locations in pennyfarthing-dist

---

## Version Churn Gotcha

**Problem:** Sprint 2+3 had 14 releases in 8 days (1.75/day)
**Impact:** User update fatigue, changelog noise, npm publish limits
**Root Cause:** Single-fix patches released immediately after discovery
**Solution:**
- Bundle related fixes into single releases
- Use RC process for larger changes
- Target <3 releases per sprint

---

## Shared Mutable State Gotcha

**Problem:** BUG-1 - statusline pollution across sessions
**Root Cause:** `.session/current-agent` file written by all sessions, read by all statuslines
**Fix:** Removed shared state entirely, each session uses own file
**Lesson:** Any shared mutable state between concurrent processes is a bug waiting to happen

---

## Missing settings.local.json on Copy-Mode Installs

**Problem:** Installations from v4.0.0-v4.0.3 (copy mode) may be missing `settings.local.json`
**Impact:** Hooks not registered with Claude Code - agents, statusline, context warnings don't work
**Root Cause:** `mergeSettingsLocalJson()` in init.ts silently failed to create the file
**Detection:** `pennyfarthing doctor` shows `✗ settings.local.json - Missing`
**Fix:** Run `pennyfarthing doctor --fix` to auto-create the file
**Code Fix:** Added `createSettingsLocalJson()` to doctor.ts (PR pending)

---

*Add orchestration gotchas discovered during process work below*
