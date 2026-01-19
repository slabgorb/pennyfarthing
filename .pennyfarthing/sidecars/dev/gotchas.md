# Dev Agent Gotchas

Lessons learned from debugging sessions. Check here before investigating issues.

## Pennyfarthing Installation

### Installing in Projects

**Always use GitHub install, not npm link or local path:**

```bash
# CORRECT - installs from GitHub with pennyfarthing-dist/ included
npm install github:1898andCo/pennyfarthing

# WRONG - npm link doesn't work (package not published to npm registry)
npm link pennyfarthing  # Error: 404 Not Found

# WRONG - local path install may not include dist directory
npm install ~/Projects/Pennyfarthing  # May get stale/incomplete version
```

### Why GitHub Install?

The `pennyfarthing-dist/` directory contains pre-built assets (agents, commands, guides, skills, etc.) that are committed to the repo but not generated during npm install. The GitHub install gets the full repo including this dist directory.

### Symlink Structure

After install, `.claude/` contains symlinks to `node_modules/pennyfarthing/pennyfarthing-dist/`:
- `agents/`, `commands/`, `guides/`, `personas/`, `scripts/`, `skills/`

If symlinks are broken (commands not showing), reinstall from GitHub.

### v6.5 pennyfarthing-dist Only Has READMEs (Bug 37-17)

The develop branch on GitHub has `pennyfarthing-dist/` but directories only contain README placeholders. The actual content (agents, commands, guides, skills, etc.) exists locally but hasn't been pushed.

**Workaround until fixed:**
```bash
# Copy ALL dist contents from local Pennyfarthing source
for dir in agents commands guides skills scripts personas workflows templates faces; do
  cp -r ~/Projects/Pennyfarthing/pennyfarthing-dist/$dir/* \
    node_modules/pennyfarthing/pennyfarthing-dist/$dir/ 2>/dev/null
done
```

This is tracked in story 37-17. The fix needs to commit the actual content (not just READMEs) to GitHub.

## Cyclist Font Settings (Story 35-6)

### The Problem
Font settings in `~/.cyclist/settings.yaml` are saved correctly but don't apply to the UI.

### What DOESN'T Work

1. **ES module timing** - `font-settings.js` loads as `type="module"` which defers execution. By the time it runs, `window.electronAPI` might not be ready. Added retry loop but still unreliable.

2. **Checking if file exists in src/public/js/** - The file exists, but Cyclist runs from compiled `dist/` in Electron. Static files are served from `src/public/` via `getPublicDir()` in `paths.ts`, so this isn't the issue.

3. **Checking preload.ts** - `settings.get` IS exposed correctly at line 577. The IPC channel works.

4. **Looking at server.ts static serving** - `express.static(publicDir)` serves files correctly. Not the issue.

### What DOES Work

The **push mechanism** in `main.ts` lines 1382-1386:
- `mainWindow.webContents.on('did-finish-load', ...)` calls `applyFontSettingsToMainWindow(settings)`
- This uses `webContents.executeJavaScript()` to directly set CSS variables on `:root`
- This is the reliable path - it bypasses all the module loading timing issues

### Architecture Understanding

Two mechanisms exist:
1. **Push (main→renderer):** `applyFontSettingsToMainWindow()` via `executeJavaScript()` - WORKS
2. **Pull (renderer fetches):** `font-settings.js` module calls `window.electronAPI.settings.get()` - UNRELIABLE

### Next Steps to Debug

If fonts still don't work after settings change:
1. Check DevTools console for `[FontSettings] Applied via executeJavaScript` message
2. If missing, the `did-finish-load` event isn't firing or settings aren't initialized
3. Check if `initializeSettings(projectDir)` is called before `createWindow()` (it is, line 1573)
4. The issue is likely in how/when `applyFontSettingsToMainWindow` is called on settings CHANGE (not just page load)

### Key Files

| File | Role |
|------|------|
| `main.ts:584-606` | `applyFontSettingsToMainWindow()` - the push mechanism |
| `main.ts:1382-1386` | Calls apply on `did-finish-load` |
| `main.ts:1129-1131` | Calls apply on settings save |
| `font-settings.js` | Pull mechanism (unreliable) |
| `settings.ts` | Settings schema and persistence |
| `preload.ts:577` | Exposes `settings.get` to renderer |

## Remove Unused Code

When code becomes unused (constants, functions, imports), **delete it immediately**. Don't ask, just remove it.

## Tool IDs Are Useless to Humans

**NEVER show raw `tool_id` / `toolu_*` values to users.** They are meaningless UUIDs.

When displaying tool results, always show the **tool name** (Read, Bash, Edit, etc.), not the ID. This is why Cyclist's message enrichment system exists - it caches `tool_use` messages and enriches `tool_result` messages with the actual tool name.

Before discarding any changes to message enrichment code, **ASK FIRST** - those changes are likely bug fixes to make tool results human-readable.

## Cyclist Approval Gate Architecture (Story 33-7)

### The Correct Architecture (PreToolUse Hooks)

Claude Code has a **hooks system** that fires BEFORE tool execution. Cyclist uses this to actually control tool execution:

```
Claude Code wants to run a tool
    ↓
PreToolUse hook fires → cyclist-pretooluse-hook.js
    ↓
Hook sends HTTP request to Cyclist (localhost:7432)
    ↓
Cyclist shows approval modal
    ↓
User clicks Allow/Deny
    ↓
Cyclist responds to HTTP request
    ↓
Hook returns JSON with permissionDecision: "allow" or "deny"
    ↓
Claude Code proceeds or blocks based on decision
```

**This actually controls execution.** Unlike the old observer pattern.

### Key Files

| File | Purpose |
|------|---------|
| `src/hooks/cyclist-pretooluse-hook.js` | Script Claude Code calls before each tool |
| `main.ts:startApprovalServer()` | HTTP server on port 7432 for hook communication |
| `main.ts:resolveHookApproval()` | Resolves pending hook approvals |
| `settings-store.ts` | Grant storage, allowlist management |
| `ApprovalModal.js` | Renderer-side UI |

### Installation

Add to `~/.claude/settings.json` or project `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "node /path/to/cyclist/src/hooks/cyclist-pretooluse-hook.js"
      }]
    }]
  }
}
```

### How It Works

1. **Hook receives tool info** via stdin (JSON with tool_name, tool_input, tool_use_id)
2. **Hook sends HTTP POST** to `http://127.0.0.1:7432/approval-request`
3. **Cyclist checks gate/grants** - if allowed, returns immediately
4. **If approval needed**, Cyclist shows modal and HTTP request blocks
5. **User decides**, Cyclist responds to HTTP with `{decision: "allow"|"deny"}`
6. **Hook outputs JSON** with `permissionDecision` field
7. **Claude Code** allows or blocks based on hook output

### What DOESN'T Work (The Old Pattern)

The old pattern of observing `tool_use` messages in the stream at `main.ts:1014` does NOT control execution. By the time you see the message, Claude Code has already decided to execute. That code path still exists for UI updates (showing what tools ran) but doesn't gate anything.

### Key Insight

Claude Code's PreToolUse hooks are the **only way** to actually control tool execution from an external process. The hook script runs synchronously - Claude Code waits for it to exit before proceeding.
