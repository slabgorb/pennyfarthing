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
**Solution v1 (4.0.1):** Changed to `.claude/scripts` only - BROKE dogfooding
**Solution v2 (4.0.2):** Try `.claude/scripts` first, fall back to `.claude/pennyfarthing/scripts`
**Lesson:** When fixing path issues, test BOTH dogfooding AND npm installation scenarios
**Fixed:** 2024-12-31

## Benchmark Data Issues

### Missing Baseline Comparisons on Benchmark Page
**Problem:** Benchmark page shows "N/A" for Control and Delta columns
**Root cause:** Data architecture mismatch between storage and loader:
- Baselines stored in `internal/results/baselines/{scenario}/{role}/summary.yaml`
- Themed results stored in `internal/results/benchmarks/{scenario}/{theme-role}/summary.yaml`
- `benchmark-loader.ts` reads from `internal/results/benchmarks/` and `internal/results/baselines/`
- Themed summaries lack embedded `baseline_comparison` section

**Example:**
- `internal/results/baselines/django-10097/dev/summary.yaml` → control mean: 65.50
- `internal/results/benchmarks/django-10097/breaking-bad-dev/summary.yaml` → mean: 64.38, NO baseline_comparison
- Expected delta: -1.12 (theme underperforms control)

**Solution:** Update `showcase/src/lib/benchmark-loader.ts` to:
1. Load baselines from `internal/results/baselines/` first
2. Match each themed summary to its baseline (same scenario + role)
3. Calculate `delta = theme.mean - baseline.mean` at load time

**Discovered:** 2026-01-03

---

## Cyclist-Specific Gotchas

### PTY→SDK Migration: Dual-Path Code Conflicts

**Situation:** Adding SDK-based functionality when PTY-based code still exists (during E7 migration).

**Problem:** Old PTY-based code keeps overwriting SDK changes. Example:
- `stats.js` updates mode button based on PTY output (old E5 approach)
- `controls.js` tries to use IPC to SDK (new E7 approach)
- Both fight over the same UI element

**Prevention:**
1. Search for ALL references before adding SDK handlers: `grep -r "data-control=\"plan-mode\""`
2. When adding SDK approach, DISABLE the PTY approach in same commit
3. Reference E7 stories - PTY removal is planned for E7-5

**Fix:** Find all PTY-based handlers for the feature and disable them. The SDK is now the source of truth.

---

### IPC Handler Not Registered

**Situation:** Adding new IPC channels in main.ts but getting "No handler registered" errors.

**Problem:** You defined `setupXxxIPCHandlers()` function but forgot to CALL it in the main initialization block.

**Prevention:** After creating a new `setupXxxIPCHandlers()` function, immediately add the call near other setup calls (search for `setupIPCHandlers`).

**Fix:** Find where `setupIPCHandlers(ipcMain)` is called and add your new handler setup there.

```typescript
// In main.ts initialization:
setupIPCHandlers(ipcMain);
setupDataIPCHandlers(ipcMain);
setupClaudeIPCHandlers(ipcMain);  // Don't forget this!
```

---

### Electron IPC Pattern Consistency

**Situation:** Adding new data APIs to Cyclist renderer.

**Problem:** Inconsistent IPC patterns cause confusion and bugs.

**Prevention:** Follow the established pattern:
```typescript
// main.ts - Channel definitions
export const IPC_XXX_CHANNELS = {
  XXX_GET: 'xxx:get',
  XXX_UPDATE: 'xxx:update',
};

// main.ts - Broadcast helper usage
broadcastToRenderer(IPC_XXX_CHANNELS.XXX_UPDATE, data);

// preload.ts - Safe IPC bridge
xxx: createDataAPI(ipcRenderer, 'xxx:get', 'xxx:update'),

// Renderer - Usage
const data = await window.electronAPI.xxx.get();
window.electronAPI.xxx.onUpdate((_event, data) => { ... });
```

---

*Add implementation gotchas discovered during development below*

### Claude SDK Message Structure for Tool Detection

**Situation:** Detecting when Claude uses Edit/Write tools to trigger UI updates (e.g., Changed Files panel).

**Problem:** Code checked `if (message.type === 'tool_use')` at the top level, but this never matches because the Claude SDK nests tool_use blocks inside assistant messages.

**Root Cause:** SDK message structure is:
```javascript
// WRONG - this doesn't exist at top level
message.type === 'tool_use'
message.tool_name === 'Edit'

// CORRECT - tool_use is nested inside assistant messages
message.type === 'assistant'
message.message.content[] // array of content blocks
  block.type === 'tool_use'
  block.name === 'Edit'    // tool name
  block.id === 'toolu_xxx' // tool id
  block.input === { ... }  // tool parameters
```

**Prevention:** Look at existing patterns in the codebase. `todos.ts` has `isTodoWriteMessage()` which correctly parses the SDK structure:
```typescript
if (msg.type !== 'assistant') return false;
const content = msg.message?.content;
return content.some(block => block.type === 'tool_use' && block.name === 'TodoWrite');
```

**Fix:** Update tool detection to iterate through assistant message content blocks instead of checking top-level message type.

**Discovered:** 2026-01-09 (Story 17-5)

---

### Background Task Agents Dying in Cyclist

**Situation:** Running background Task agents (e.g., job fairs, parallel work) via Cyclist GUI.

**Problem:** Background agents die with `[Request interrupted by user]` when you send any follow-up message. The agents appear to start but never complete.

**Root Cause:** `ClaudeService.sendMessage()` was killing the existing Claude process before spawning a new one for each message:
```typescript
// OLD (broken) - killed background agents
if (this.currentProcess) {
  this.currentProcess.kill();  // Kills all child processes including Task agents!
  this.currentProcess = null;
}
const proc = spawn('claude', args);
proc.stdin?.write(message);
proc.stdin?.end();  // Closes stdin, signals "done"
```

Background Task agents are **children of the Claude process**. When Cyclist killed the parent to send a new message, all background agents died with it.

**Solution:** Persistent process model - keep one Claude process alive for the session:
```typescript
// NEW (fixed) - reuses process, background agents survive
private ensureProcess(): ChildProcess {
  if (this.currentProcess && !this.processExited) {
    return this.currentProcess;  // Reuse existing!
  }
  // Only spawn if no process exists
  const proc = spawn('claude', args);
  // Set up handlers once
  return proc;
}

async *sendMessage(prompt: string) {
  const proc = this.ensureProcess();
  proc.stdin?.write(message);  // Write without closing
  // Yield until 'result' message marks end of turn
  while (!this.processExited) {
    const msg = await this.waitForMessage();
    yield msg;
    if (msg.type === 'result') break;  // Turn complete, process stays alive
  }
}
```

**Key insight:** The `result` message from Claude marks end of turn, NOT process exit. Process only dies on explicit `resetSession()` or `abort()`.

**Prevention:**
1. Never kill the Claude process between messages
2. Use `result` message type to detect turn boundaries
3. Only spawn new process after explicit session reset

**Testing:** Mock must emit messages on EACH stdin write (not just first), and must NOT auto-close the process.

**Discovered:** 2026-01-12 (Orchestrator debugging session)

---

### Tool Execution Log Shows 0 Entries in Cyclist

**Situation:** Cyclist's Tool Execution Log panel shows "0 total, 0 success" despite tool calls happening.

**Problem:** The OTEL telemetry pipeline was never wired up:
1. `writePortFile()` function existed in `server.ts` but was never called
2. Without `.cyclist-port` file, `session-start.sh` couldn't set `OTEL_EXPORTER_OTLP_ENDPOINT`
3. Claude Code didn't know where to send telemetry

**Root Cause:** Story 20-1 implemented the port file functions and the hook logic, but missed the critical integration step of actually calling `writePortFile()` when the server starts.

**The telemetry flow requires:**
```
Cyclist starts
  → writePortFile() writes .cyclist-port
  → Claude Code session starts
  → session-start.sh reads .cyclist-port
  → Sets OTEL_EXPORTER_OTLP_ENDPOINT in CLAUDE_ENV_FILE
  → Claude Code sends telemetry to /v1/logs
  → OTLP receiver records tool events
  → Tool Execution Log shows entries
```

**Fix:**
1. In `main.ts` `startServer()`, call `writePortFile(projectDir, actualPort)` after server.listen succeeds
2. In `main.ts` `stopServer()`, call `cleanupPortFile(projectDir)` before server.close
3. In `session-start.sh`, add OTEL auto-config that reads `.cyclist-port` and writes env vars to `CLAUDE_ENV_FILE`

**Prevention:**
- When implementing multi-component features, trace the full data flow end-to-end
- Functions that exist but aren't called are easy to miss in code review
- Test the feature manually, not just the unit tests

**Discovered:** 2026-01-13 (Bug fix session)

---
