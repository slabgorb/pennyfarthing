# Orchestrator Gotchas

> Critical pitfalls in Pennyfarthing development

## $CLAUDE_PROJECT_DIR Not Available in Bash

**Context:** Only set for hooks and statusLine, NOT Bash tool invocations.
**Solution:** Use .claude climber pattern.

## git rev-parse Fails in Nested Repos

**Solution:** Use .claude climber or $CLAUDE_PROJECT_DIR (in hooks).

## Code Blocks in Skills Not Executed

**Solution:** Write explicit "Use Bash tool to run:" instructions.

## Hook Timing

- **Stop hook:** May not run reliably on all exit paths
- **Solution:** Move cleanup to SessionStart hook

## Config Merge Logic

**Problem:** Init skips files that exist, missing critical hooks.
**Solution:** Merge required fields, preserve user customizations.

---

*Add orchestration gotchas discovered during process work below*
