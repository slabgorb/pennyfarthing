# Epic 56: Glanceable Status Awareness - Technical Context

## Epic Overview

| Field | Value |
|-------|-------|
| Epic ID | epic-56 |
| Jira | MSSCI-12189 |
| Title | Glanceable Status Awareness |
| Total Points | 13 |
| Stories | 4 |
| Priority | P0 |
| Repos | pennyfarthing |

**Goal:** Users can monitor their Pennyfarthing session at a glance without clicking anything - context level, permission mode, and active model are always visible in the VS Code status bar.

## Architecture Overview

### Current State

The VS Code extension (`packages/vscode-extension/`) already has a sophisticated WheelHub infrastructure:

1. **WheelHub Server** (`src/server/wheelhub-adapter.ts`)
   - Embedded HTTP/WebSocket server in extension host
   - Port discovery: 18980-18989 with retry logic
   - Writes `.cyclist-port` for CLI discovery

2. **WebSocket Manager** (`src/server/websocket-manager.ts`)
   - Pre-registered channels: `/ws/stats`, `/ws/story`, `/ws/claude`, `/ws/git`, `/ws/messages`
   - Dual broadcasting: same-process listeners AND WebSocket clients
   - `broadcastStats()` already sends context, persona, sprint, story data

3. **Existing Data Flow**
   ```
   WheelHub broadcastStats() → WebSocketManager.onStats()
       ├─→ AgentStatusTreeDataProvider (sidebar)
       └─→ CyclistWebviewProvider (webview panel)
   ```

### What's Missing

**No Status Bar Items** - The extension uses TreeView (sidebar) and Webview (Cyclist panel) but has no status bar presence. VS Code status bar items require:

1. `vscode.window.createStatusBarItem()` registration
2. Subscription to WheelHub stats for real-time updates
3. Color/icon theming based on state

**Gearshift Mode Not Broadcast** - The `/ws/claude` channel handles `setMode` messages but the current mode isn't included in stats broadcasts. Need to:

1. Add `mode` field to stats broadcasts
2. Or create new `/ws/gearshift` channel

**Model Info Available But Not Displayed** - Stats API has model info but it's not surfaced to status bar.

## Technical Approach

### Story 56-1: WheelHub Connection Infrastructure (5 pts)

**Scope:** Create a robust WebSocket client that connects to WheelHub from the extension and manages channel subscriptions.

**Key Insight:** The extension already HAS WheelHub - it's the server! The status bar items just need to subscribe to the same `WebSocketManager.onStats()` that sidebar/webview use.

**Files to Create/Modify:**
- `packages/vscode-extension/src/statusbar/status-bar-manager.ts` - New manager class
- `packages/vscode-extension/src/extension.ts` - Register status bar on activation

**Implementation:**
```typescript
// status-bar-manager.ts
export class StatusBarManager implements vscode.Disposable {
  private contextItem: vscode.StatusBarItem;
  private gearshiftItem: vscode.StatusBarItem;
  private modelItem: vscode.StatusBarItem;

  constructor(private wsManager: WebSocketManager) {
    // Create items with specific priorities for ordering
    this.contextItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left, 100
    );
    // Subscribe to stats
    wsManager.onStats((data) => this.handleStats(data));
  }
}
```

**Connection State Handling:**
- "Connecting..." when WheelHub starting
- Normal display when connected
- "Disconnected" with retry indicator if WheelHub stops

### Story 56-2: Context Meter Status Bar Item (3 pts)

**Format:** `CONTEXT: 54k (31%)`

**Color Thresholds:**
| Percent | Color | Theme Token |
|---------|-------|-------------|
| < 60% | Green | `statusBarItem.foreground` or explicit green |
| 60-80% | Yellow | `statusBarItem.warningForeground` |
| > 80% | Red | `statusBarItem.errorForeground` |

**Data Source:** `stats.context.usablePercent` from WheelHub broadcasts

**Update Frequency:** Real-time via WebSocket (< 1 second latency)

### Story 56-3: Gearshift Mode Status Bar Item (2 pts)

**Values:** `PLAN`, `MANUAL`, `ACCEPT`, `TURBO`

**Current Mode Source:** Need to extend stats broadcast to include current mode, OR:
- Read from `.pennyfarthing/config.local.yaml` → `handoff_mode`
- Listen for mode changes via `/ws/claude` channel's `setMode` messages

**Implementation Option A (Preferred):** Add `mode` to stats broadcast
```typescript
// In stats.ts
broadcastStats({
  ...existingData,
  mode: getCurrentMode() // 'plan' | 'manual' | 'accept' | 'turbo'
});
```

**Implementation Option B:** Separate file watcher for config.local.yaml

### Story 56-4: Model Indicator Status Bar Item (3 pts)

**Format:** `OPUS 4-5` or `SONNET 3.5`

**Data Source:** Stats API already has model info - just need to surface it

**Update Trigger:** New session start or explicit model change

## File Inventory

### Files to Create

| Path | Purpose |
|------|---------|
| `packages/vscode-extension/src/statusbar/status-bar-manager.ts` | Status bar orchestration |
| `packages/vscode-extension/src/statusbar/context-status-item.ts` | Context meter logic |
| `packages/vscode-extension/src/statusbar/gearshift-status-item.ts` | Mode display logic |
| `packages/vscode-extension/src/statusbar/model-status-item.ts` | Model display logic |
| `packages/vscode-extension/src/statusbar/index.ts` | Barrel export |

### Files to Modify

| Path | Change |
|------|--------|
| `packages/vscode-extension/src/extension.ts` | Import and activate StatusBarManager |
| `packages/vscode-extension/src/server/websocket-manager.ts` | Add mode to stats type |
| `packages/vscode-extension/package.json` | Add status bar contribution points (if needed) |

### Reference Files (Read Only)

| Path | Reason |
|------|--------|
| `packages/vscode-extension/src/server/wheelhub-adapter.ts` | Understand server lifecycle |
| `packages/vscode-extension/src/providers/sidebar.ts` | Pattern for stats subscription |
| `packages/vscode-extension/src/providers/cyclist-webview.ts` | Pattern for stats subscription |
| `packages/cyclist/src/api/context.ts` | Context calculation logic |

## API Contracts

### Stats Data Structure (Extended)

```typescript
interface StatsData {
  agent?: string;
  phase?: string;
  persona?: {
    character: string;
    theme: string;
    role: string;
  };
  context?: {
    usablePercent: number;  // 0-100
    tokens?: number;        // Absolute token count
  };
  mode?: 'plan' | 'manual' | 'accept' | 'turbo';  // NEW
  model?: string;           // e.g., "claude-opus-4-5-20251101"
  sprint?: {
    totalPoints: number;
    completedPoints: number;
    inProgressCount: number;
  };
  story?: {
    id: string;
    title: string;
    phase: string;
    branch: string;
    points: number;
  };
}
```

### Status Bar Item Positioning

```
[CONTEXT: 54k (31%)] [MANUAL] [OPUS 4-5] ... [other items]
        ^                ^         ^
    priority: 100    pri: 99    pri: 98
```

Higher priority = further left.

## Testing Strategy

### Unit Tests

1. **StatusBarManager** - Lifecycle, disposal, stat handling
2. **ContextStatusItem** - Color threshold logic, format strings
3. **GearshiftStatusItem** - Mode display, updates
4. **ModelStatusItem** - Model name parsing, display

### Integration Tests

1. Stats broadcast updates all three status items
2. Disconnection shows appropriate fallback state
3. Reconnection restores live updates

### Manual Testing

1. Open VS Code with Pennyfarthing project
2. Verify status bar items appear
3. Start a story, verify context updates
4. Change modes, verify gearshift updates
5. Start new session, verify model updates

## Dependencies & Risks

### Dependencies

- WheelHub must be running (starts on extension activation)
- Stats broadcasts must include mode (may need extension)
- Model info must be available in stats

### Risks

| Risk | Mitigation |
|------|------------|
| WheelHub not started | Show "Connecting..." state |
| Stats broadcast missing mode | Fall back to config file reading |
| Too many status bar updates | Debounce (100ms) like story updates |

## Story Sequence

**Recommended Order:**

1. **56-1** (5 pts) - Foundation: Connection infrastructure and StatusBarManager
2. **56-2** (3 pts) - Context meter (depends on 56-1)
3. **56-3** (2 pts) - Gearshift mode (depends on 56-1, may need stats extension)
4. **56-4** (3 pts) - Model indicator (depends on 56-1)

Stories 56-2, 56-3, and 56-4 can potentially be parallelized after 56-1 completes, but sequential TDD is recommended for clean integration.

## Acceptance Criteria Gaps

**Note:** Sprint YAML shows `acceptance_criteria: []` for all stories. Before starting work, TEA should define testable ACs based on:

- 56-1: Connection lifecycle, retry behavior, channel subscriptions
- 56-2: Format string, color thresholds, update latency
- 56-3: Mode values, update latency
- 56-4: Model display format, update triggers

---

*Generated by SM (Grand Admiral Thrawn) - Epic 56 Technical Context*
*Last Updated: 2026-01-21*
