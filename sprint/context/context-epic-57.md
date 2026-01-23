# Epic 57: Agent Identity & Emotional Connection - Technical Context

## Epic Overview
- **Epic ID:** 57
- **Jira:** MSSCI-12189
- **Points:** 8 (3 + 3 + 2)
- **Priority:** P0
- **Repos:** pennyfarthing (packages/vscode-extension)

## Goal
Users can see and connect with their current agent persona - portrait, name, and theme visible in the sidebar, creating the emotional connection that makes Pennyfarthing engaging.

## Current State Analysis

### Existing Infrastructure
The VS Code extension already has significant persona-related infrastructure:

1. **Agent Portrait Webview** (`src/providers/agent-portrait-webview.ts`, 731 lines)
   - WebviewViewProvider implementation (MSSCI-12148)
   - 180px portrait display from theme-specific PNGs
   - Theme/character name extraction from YAML
   - File watchers on `.pennyfarthing/config.local.yaml` and `.session/agents/*`
   - Fallback UI when portrait unavailable

2. **Portrait Resources** (`resources/portraits/`)
   - 104 themed portrait sets (1984, a-team, discworld, greek-mythology, etc.)
   - Pattern: `{theme}/{role}-{ocean_score}.png` or `{role}.png`
   - Already bundled with extension

3. **WheelHub WebSocket Manager** (`src/server/websocket-manager.ts`)
   - `/agent` channel for agent change notifications
   - `onAgent()` subscription pattern
   - `AgentData` interface: `{ character, theme, role }`

4. **Sidebar TreeDataProvider** (`src/providers/sidebar.ts`, 1100 lines)
   - Agent section with current persona info
   - Theme display
   - File watcher sync pattern

### What's Missing (Stories to Implement)

| Story | Gap |
|-------|-----|
| 57-1 | Persona card is basic - needs enhanced webview with prominent character name, theme badge |
| 57-2 | Portrait loading uses local files only - needs CDN with caching |
| 57-3 | Agent updates work but persona card doesn't fully react to `/agent` channel |

## Technical Approach

### Story 57-1: Persona Card Webview
**Enhance** the existing `agent-portrait-webview.ts`:
- Add prominent character name display (larger font, styled)
- Add theme badge/pill showing current theme name
- Improve layout: portrait above name, theme below
- Ensure populates within 2 seconds of activation

**Files to Modify:**
- `packages/vscode-extension/src/providers/agent-portrait-webview.ts`
- `packages/vscode-extension/src/webview/persona-card-styles.css` (new)

### Story 57-2: Portrait Loading with Caching
**Add CDN support** with local cache fallback:
- Primary: `https://cdn.pennyfarthing.dev/portraits/{theme}/{agent}.png`
- Cache: Download to VS Code global storage on first load
- Fallback: Use bundled `resources/portraits/` on CDN failure

**Files to Modify:**
- `packages/vscode-extension/src/providers/agent-portrait-webview.ts`
- `packages/vscode-extension/src/services/portrait-cache.ts` (new)

### Story 57-3: Real-time Agent Updates
**Wire up** persona card to WheelHub `/agent` channel:
- Listen for `AgentData` broadcasts from WebSocketManager
- Update portrait, name, and theme badge within 1 second
- Ensure file watcher fallback still works

**Files to Modify:**
- `packages/vscode-extension/src/providers/agent-portrait-webview.ts`
- `packages/vscode-extension/src/server/websocket-manager.ts` (verify `onAgent` works)

## Key Patterns to Follow

### 1. Webview HTML Pattern (from welcome-webview.ts)
```typescript
private _getHtmlContent(webview: vscode.Webview): string {
  const nonce = getNonce();
  return `<!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="Content-Security-Policy" content="...nonce-${nonce}...">
      <style nonce="${nonce}">/* CSS */</style>
    </head>
    <body>
      <!-- Content -->
      <script nonce="${nonce}">/* JS */</script>
    </body>
    </html>`;
}
```

### 2. File Watcher Pattern (from agent-portrait-webview.ts)
```typescript
this._themeWatcher = vscode.workspace.createFileSystemWatcher(
  new vscode.RelativePattern(workspaceFolder, '.pennyfarthing/config.local.yaml')
);
this._themeWatcher.onDidChange(() => this._updatePortrait());
```

### 3. WheelHub Listener Pattern (from status-bar-manager.ts)
```typescript
wsManager.onAgent((data: AgentData) => {
  this._updatePersonaCard(data.character, data.theme, data.role);
});
```

### 4. Portrait Resolution (existing in agent-portrait-webview.ts:319-330)
```typescript
const defaultPortraitMap: Record<string, string> = {
  sm: 'hermes', tea: 'themis', dev: 'hephaestus',
  reviewer: 'argus', architect: 'daedalus', pm: 'athena',
  'tech-writer': 'clio', 'ux-designer': 'arachne',
  devops: 'prometheus', orchestrator: 'zeus'
};
```

## Testing Strategy

### Unit Tests (Vitest)
- Portrait cache service: cache hit/miss, CDN failure fallback
- Persona card rendering: all required elements present
- Agent update handling: data flow from WebSocket to UI

### Integration Tests
- End-to-end: Claude sends `/agent` → persona card updates
- Cache behavior: first load downloads, second load uses cache
- Fallback: CDN unavailable → bundled portraits used

### Test File Naming
- `packages/vscode-extension/tests/MSSCI-12191-persona-card-webview.test.ts`
- `packages/vscode-extension/tests/MSSCI-12192-portrait-caching.test.ts`
- `packages/vscode-extension/tests/MSSCI-12193-realtime-agent-updates.test.ts`

## Dependencies & Risks

### Dependencies
- CDN (`cdn.pennyfarthing.dev`) must host all 104 theme portrait sets
- WheelHub must be running for real-time updates
- Theme YAML files must contain `shortName` for portrait mapping

### Risks
| Risk | Mitigation |
|------|------------|
| CDN unavailable | Fallback to bundled portraits |
| Large portrait files | Use optimized PNGs, lazy load |
| Theme not found | Graceful degradation to default |

## Acceptance Criteria Summary

### 57-1: Persona Card Webview (3 pts)
- [ ] Sidebar webview with agent portrait image
- [ ] Character name prominently displayed
- [ ] Theme name/badge visible
- [ ] Populates within 2 seconds of activation

### 57-2: Portrait Loading with Caching (3 pts)
- [ ] Load portraits from CDN URL pattern
- [ ] Cache locally after first load
- [ ] Fallback to bundled on CDN failure
- [ ] Support all 102+ themes

### 57-3: Real-time Agent Updates (2 pts)
- [ ] Persona card updates on `/agent` channel broadcast
- [ ] Portrait, name, and theme badge all update
- [ ] Updates complete within 1 second

## Story Order
1. **57-1** (Persona Card) - Establishes the UI foundation
2. **57-2** (Portrait Caching) - Enhances portrait loading
3. **57-3** (Real-time Updates) - Wires up WheelHub integration

---

*Generated by SM (Captain Carrot) on 2026-01-22*
