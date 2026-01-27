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

## Cyclist Electron Entry Point

### Problem: Window not appearing when starting Cyclist Electron
**Symptom:** Cyclist starts (taskbar icon appears) but no window shows. Logs show "Benchmark API enabled" but not "Using Pennyfarthing project".

**Root Cause:** `package.json` has `"main": "dist/server.js"` for npm module use. When running `electron .`, it uses this entry point and runs the Express server instead of the Electron main process.

**Solution:** The dev scripts must explicitly specify `electron dist/main.js`:
```json
"dev": "... electron dist/main.js",
"dev:once": "npm run build && electron dist/main.js"
```

**Fixed in:** packages/cyclist/package.json (2026-01-17)

---

## Subagent Type Compatibility (RESOLVED)

### Problem: "The official subagent types aren't available in this context"
**Symptom:** Agents fail when spawning subagents like `workflow-status-check`

**Root Cause:** Claude Code's Task tool `subagent_type` only accepts built-in values (`Bash`, `general-purpose`, `Explore`, `Plan`). Pennyfarthing's custom subagent types aren't recognized.

**Solution:** Use `subagent_type: "general-purpose"` with a prompt that instructs the agent to read the subagent definition file:
```yaml
Task tool:
  subagent_type: "general-purpose"
  model: "haiku"
  prompt: |
    You are the workflow-status-check subagent.
    Read .pennyfarthing/agents/workflow-status-check.md for instructions.
    EXECUTE all steps. Do NOT summarize.
```

**Resolved:** January 2026

---

## Monorepo Build Order (Dogfooding)

### Problem: "Cannot find module '@pennyfarthing/core'"
**Symptom:** `just cyclist` fails with TypeScript error:
```
error TS2307: Cannot find module '@pennyfarthing/core' or its corresponding type declarations.
```

**Root Cause:** pnpm monorepo workspace dependencies (`@pennyfarthing/shared`, `@pennyfarthing/core`) aren't built. Cyclist's build only compiles cyclist, not its workspace deps.

**Solution:** The `just cyclist` command auto-detects missing deps and runs `pnpm run build` if needed. No manual intervention required.

**Fixed in:** justfile (2026-01-17)

---

*Add infrastructure gotchas discovered during DevOps work below*
