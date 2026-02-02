# IPC to WebSocket Migration Plan

## Overview

Deprecate Electron IPC in favor of WebSockets for all renderer ↔ server communication. This unifies web mode and Electron mode into a single codepath.

## Current State

### Existing WebSocket Endpoints (websocket.ts)
Already have WebSocket support:
- `/ws/stats` - Stats strip data (model, status, pwd)
- `/ws/persona` - Agent persona
- `/ws/token-stats` - Token usage
- `/ws/context` - Context usage percentage (added 2026-02-02)
- `/ws/claude` - Claude streaming (web mode)
- `/ws/background-tasks` - Background task notifications
- `/ws/story` - Sprint/story updates
- `/ws/git` - Git status updates
- `/ws/bell` - Bell mode consumed events
- `/ws/spans` - OTEL span debugging
- `/ws/welcome` - Welcome messages
- `/ws/hooks` - Hook approval requests
- `/ws/settings` - Settings sync
- `/ws/diffs` - Edit/Write tool diffs (added 2026-02-02)
- `/ws/livereload` - Dev hot reload

### IPC Channels to Migrate (preload.ts)

| Category | IPC Channel | WebSocket Exists? | Priority |
|----------|-------------|-------------------|----------|
| **Data APIs** | | | |
| stats | stats:get, stats:update | YES `/ws/stats` | DONE |
| persona | persona:get, persona:update | YES `/ws/persona` | DONE |
| story | story:get, story:update | YES `/ws/story` | DONE |
| git | git:get, git:update | YES `/ws/git` | DONE |
| tokenStats | tokenStats:get, tokenStats:update | YES `/ws/token-stats` | DONE |
| todos | todos:get, todos:update | REST `/api/todos` | DONE (polling) |
| context | context:get, context:update | YES `/ws/context` | DONE |
| usageStats | usageStats:get, usageStats:update | NO | P2 - Not needed |
| projectInfo | projectInfo:get, projectInfo:update | NO | P3 - Not needed |
| toolStats | toolStats:get, toolStats:update | NO | P3 - Not needed |
| **Claude API** | | | |
| claude:send/abort/clear | YES `/ws/claude` | DONE |
| claude:setMode/getMode | YES `/ws/claude` | DONE |
| claude:message/complete/error | YES `/ws/claude` | DONE |
| **Settings API** | | | |
| settings:get/save/onChanged | YES `/ws/settings` | DONE |
| settings:getThemeMetadata | REST `/api/settings/themes` | DONE |
| settings:*Gate methods | NO | P3 - Consider approach |
| **Approval APIs** | | | |
| bash:approval-* | YES `/ws/hooks` | DONE |
| path:approval-* | YES `/ws/hooks` | DONE |
| permission:* | YES `/ws/hooks` | DONE |
| **Background Tasks** | | | |
| backgroundTask:* | YES `/ws/background-tasks` | DONE |
| **Layout** | | | |
| layout:get/save/onUpdate | REST `/api/settings/layout` | DONE |
| **Menu-triggered Events** | | | |
| agent:launch | NO | P2 - Keep IPC (Electron menu) |
| theme:showQuickSwitcher | NO | P3 - Keep IPC (Electron menu) |
| tools:toggleToolPanel | NO | P3 - Keep IPC (Electron menu) |
| **File Browser** | | | |
| file-browser:* | NO | P3 - REST `/api/file-browser` |
| **Command Execution** | | | |
| command:execute/result/error | NO | P2 - Keep IPC (Electron process) |
| **Audit Log** | | | |
| auditLog:* | YES `/ws/spans` | DONE |
| **Skill Tracking** | | | |
| skill:* | NO | P3 - Not needed in web mode |
| **Avatar** | | | |
| avatar:* | REST `/api/identity` | DONE |
| **Diff Viewer** | | | |
| diff:update | YES `/ws/diffs` | DONE |

## Migration Phases

### Phase 1: Remove Duplicate IPC (Low Risk)
Components that already have both IPC and WebSocket - just remove IPC branch.

**Files to update:**
- `ControlBar.tsx` - settings (DONE)
- `SettingsPanel.tsx` - settings (DONE)
- `useStatsStrip.ts` - use /ws/context + /ws/stats (DONE - 2026-02-02)
- `usePersona.ts` - use /ws/persona (DONE - 2026-02-02)
- `useStory.ts` - use /ws/story (DONE - 2026-02-02)
- `useGitStatus.ts` - use /ws/git (DONE - 2026-02-02)
- `useBackgroundTasks.ts` - use /ws/background-tasks (DONE - 2026-02-02)
- `ApprovalModal/index.tsx` - use /ws/hooks (DONE - 2026-02-02)

**Estimated effort:** 1-2 hours per file

### Phase 2: Add Missing WebSocket Endpoints
For IPC-only features, add WebSocket support.

**New endpoints needed:**
- `/ws/context` - Context usage percentage
- `/ws/layout` - Layout persistence
- `/ws/diffs` - Diff viewer updates
- `/ws/command` - Command execution streaming
- `/ws/menu` - Menu-triggered events (agent launch, etc.)

**Estimated effort:** 2-4 hours per endpoint

### Phase 3: Low-Priority Migrations
Features used less frequently or can remain REST-only.

- Audit log (REST + optional WS for live updates)
- File browser (REST for listing, WS for open events)
- Avatar (REST only - infrequent)
- Skill tracking (REST + WS)
- Tool stats (REST + WS)

### Phase 4: Cleanup
- Remove preload.ts IPC code (keep contextBridge for window.electronAPI detection)
- Remove main.ts IPC handlers
- Update tests
- Update documentation

## Architecture After Migration

```
┌─────────────────────────────────────────────────────────┐
│                    React Components                      │
│  (Always use WebSocket, check window.electronAPI only   │
│   to detect Electron for native features like menus)    │
└─────────────────────────┬───────────────────────────────┘
                          │
                          │ WebSocket
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   WheelHub Server                        │
│  (Express + WebSocket, runs in Electron main or Node)   │
│                                                          │
│  /ws/stats, /ws/persona, /ws/settings, /ws/claude, etc. │
└─────────────────────────────────────────────────────────┘
```

## Benefits

1. **Single codepath** - No more `if (api?.foo) { ... } else { ... }`
2. **Easier testing** - Just test WebSocket, not IPC + WebSocket
3. **Web mode parity** - Everything works in browser
4. **Simpler debugging** - Can use browser DevTools Network tab
5. **Less code** - Remove 1000+ lines of preload.ts

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Menu integration | Keep minimal IPC for menu → renderer events, or use `/ws/menu` |
| Native dialogs | These still need IPC - keep for dialogs only |
| Startup race | Ensure WS connects before UI renders (loading state) |
| Reconnection | Add reconnection logic to WebSocket hooks |

## Menu Events Approach

For Electron menu → renderer events (agent:launch, theme:showQuickSwitcher, etc.):

**Option A:** Keep minimal IPC for menu events only
- Pro: Simple, menu is Electron-specific anyway
- Con: Still have some IPC code

**Option B:** Menu triggers REST endpoint, WS broadcasts
- Menu click → main process → POST /api/menu/event → WS broadcast
- Pro: Fully unified
- Con: Slightly more complex

**Recommendation:** Option A for now, migrate to B if needed.

## Implementation Order

1. **Settings** - DONE (ControlBar, SettingsPanel)
2. **Persona/Story/Git** - DONE (2026-02-02, removed IPC branches)
3. **Background Tasks** - DONE (2026-02-02, removed IPC branch)
4. **Approvals** - DONE (2026-02-02, ApprovalModal migrated to /ws/hooks)
5. **Stats/Context** - DONE (2026-02-02, added /ws/context, migrated useStatsStrip)
6. **Layout** - DONE (2026-02-02, added REST /api/settings/layout, migrated useLayoutPersistence)
7. **Diffs** - DONE (2026-02-02, added /ws/diffs, migrated useDiffs)
8. **Claude API** - DONE (2026-02-02, created ClaudeContext, migrated MessagePanel, ControlBar, QuickActions)
9. **Remaining Hooks/Components** - DONE (2026-02-02, bulk migration)

### Claude API Migration Details (2026-02-02)

**New files created:**
- `src/public/hooks/useClaude.ts` - Standalone hook for WebSocket Claude communication
- `src/public/contexts/ClaudeContext.tsx` - Shared context provider for Claude WebSocket

**Files updated:**
- `src/public/App.tsx` - Wrapped with ClaudeProvider
- `src/public/components/panels/MessagePanel.tsx` - Uses ClaudeContext instead of IPC
- `src/public/components/ControlBar.tsx` - Uses ClaudeContext for abort/clear, REST for settings
- `src/public/components/QuickActions.tsx` - Uses ClaudeContext for send, REST for relay mode
- `src/public/hooks/index.ts` - Exports useClaude hook

### Bulk Migration Details (2026-02-02)

**Hooks migrated to REST/WebSocket:**
- `useTodos.ts` - Removed IPC branch, uses REST with polling
- `useMessageQueue.ts` - Uses REST + /ws/settings for bell mode
- `useSubagentHelper.ts` - Uses /ws/persona for helper lookup
- `useUserAvatar.ts` - Uses /api/identity endpoint

**Components migrated:**
- `ContextIndicator/index.tsx` - Uses /ws/context
- `SettingsPanel.tsx` - Removed IPC branches, uses REST + /ws/settings
- `ChangedPanel.tsx` - Uses /ws/diffs
- `DebugPanel.tsx` - Uses /ws/context, /ws/token-stats, /ws/spans

**JS modules migrated:**
- `color-presets.ts` - Uses REST /api/settings for persistence
- `font-presets.ts` - Uses REST /api/settings for persistence
- `avatar-service.ts` - Uses /api/identity endpoint
- `subagent-display.ts` - Uses /api/theme-agents/full endpoint

**Deprecated:**
- `useMessageStream.ts` - Replaced by ClaudeContext (export removed from index)

## Success Criteria

- [x] Phase 1 hooks migrated: usePersona, useStory, useGitStatus, useBackgroundTasks (2026-02-02)
- [x] ApprovalModal migrated to /ws/hooks (2026-02-02)
- [x] useStatsStrip migrated with /ws/context endpoint (2026-02-02)
- [x] All React components use WebSocket only (no IPC branches) - DONE 2026-02-02
- [x] Web mode fully functional (feature parity with Electron) - DONE 2026-02-02
- [ ] preload.ts reduced to <100 lines (menu events + native dialogs only) - Phase 4 cleanup
- [ ] All tests pass - Need to verify
- [x] No polling in any component (except todos, which needs /ws/todos endpoint)
