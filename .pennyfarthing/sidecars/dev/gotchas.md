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

## Cyclist Approval Gate Architecture (Story 33-7)

### The Core Architecture

Cyclist uses Claude Code CLI via `--input-format stream-json` and `--output-format stream-json`. This is an **observer pattern**:

1. Cyclist spawns Claude Code CLI as a subprocess
2. Cyclist sends user messages via stdin
3. Claude Code executes tools INTERNALLY and streams results back
4. Cyclist OBSERVES the message stream (tool_use, tool_result, etc.)

**Cyclist does NOT control tool execution. Claude Code CLI does.**

### What This Means for Approval Gates

The approval gate system (story 22-3, 33-3, 33-7) provides:
- A custom UI modal for reviewing commands
- Grant management (once/session/always)
- Pattern matching for allowlists

But it works WITH Claude Code's built-in permission system, not INSTEAD of it:
- Claude Code has `--permission-mode` (default, plan, acceptEdits, dangerouslySkipPermissions)
- When Claude Code needs permission, IT pauses internally
- Cyclist's role is to show a nicer UI and manage grants

### Key Files

| File | Purpose |
|------|---------|
| `claude-service.ts:686-691` | Passes `--permission-mode` to CLI |
| `approval-gate.ts` | Interception logic, pending approvals Map |
| `settings-store.ts` | Grant storage, allowlist management |
| `ApprovalModal.js` | Renderer-side UI |
| `preload.ts:586-590` | IPC bridge for bash approval |

### IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `bash:approval-request` | main→renderer | Show modal |
| `bash:approval-response` | renderer→main | User decision |
| `permission-request` | main→renderer | Generic tool modal (33-3) |
| `permission-response` | renderer→main | Generic response |

### Common Confusion

**DON'T:** Try to "intercept" tool execution at line 1014 of main.ts. That code OBSERVES the message stream AFTER Claude Code has already decided to execute.

**DO:** Understand that `processToolUseWithApproval()` is meant to:
1. Check if Cyclist's gate is enabled
2. Check grants/allowlists
3. Show modal if needed
4. Track the pending approval
5. The actual execution control is via Claude Code's permission mode

### When the Gate Actually Works

The approval gate UI fires when:
1. `bashApprovalGateEnabled` is true in settings-store
2. Claude Code is in a permission mode that pauses (not `dangerouslySkipPermissions`)
3. A tool_use message arrives that isn't allowlisted/granted

The modal shows, user responds, and Cyclist sends the approval response. But Claude Code's own permission system is what actually gates execution.
