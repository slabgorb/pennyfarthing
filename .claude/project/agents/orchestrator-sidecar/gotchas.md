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

*Add orchestration gotchas discovered during process work below*
