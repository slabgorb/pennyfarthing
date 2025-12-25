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

---

*Add orchestration gotchas discovered during process work below*
