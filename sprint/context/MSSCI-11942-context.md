# MSSCI-11942: WheelHub Notification Consolidation

## Technical Context

**Epic:** 48 | **Jira:** MSSCI-11942 | **Points:** 22 | **Priority:** P2
**Repos:** cyclist
**ADR:** docs/adr/0004-wheelhub-background-agent-coordination.md

## Epic Overview

Consolidate WheelHub notification systems to reduce polling overhead and improve real-time responsiveness. Replace setInterval polling patterns with WebSocket channels triggered by file watchers. Remove redundant UI panels in favor of the enriched message stream.

### Stories

| ID | Title | Points | Priority | Status |
|----|-------|--------|----------|--------|
| MSSCI-11943 | Story/Git WebSocket channels with file watchers | 5 | P1 | in_progress |
| MSSCI-11944 | Event-driven badge updates | 0 | P3 | deprecated |
| MSSCI-11945 | Livereload pattern alignment | 1 | P3 | backlog |
| MSSCI-11946 | LocalStorage cross-tab synchronization | 5 | P2 | backlog |
| MSSCI-11947 | Hook response data channel for interactive tools | 5 | P1 | backlog |
| MSSCI-11948 | Remove redundant popup tool use notifications | 0 | P3 | deprecated |
| MSSCI-11949 | Remove tool/skill log panels and consolidate to messages | 5 | P1 | backlog |

### Architecture Layers

```
Layer 3: UI Consolidation (MSSCI-11949)
        ↑ Remove redundant tool/skill panels
Layer 2: Cross-tab Sync (MSSCI-11946, MSSCI-11947)
        ↑ BroadcastChannel API, hook data payloads
Layer 1: Real-time Channels (MSSCI-11943, MSSCI-11945)
        ↑ File watcher → WebSocket push
```

## Current Architecture

### WheelHub Server Structure

The WheelHub server (`packages/cyclist/src/server.ts`) is the central coordination point:

```
Express Server (port 1898)
├─ HTTP API Routes
│  ├─ /api/stats, /api/persona, /api/story, /api/git
│  ├─ /api/background-tasks, /api/spans, /api/settings
│  └─ /v1 (OTLP receiver endpoint)
│
└─ WebSocket Servers
   ├─ /ws/stats (real-time stats)
   ├─ /ws/persona (agent persona changes)
   ├─ /ws/token-stats (token usage)
   ├─ /ws/background-tasks (task events)
   ├─ /ws/claude (message streaming)
   └─ /ws/livereload (dev mode)
```

### Current Data Flow (Dual Mode)

**Electron Mode (IPC):**
```
Backend (main process)
  ↓ (fs.watch, setInterval)
  ↓ Detect changes
  ↓ Update internal state
  ↓ Call registered callback
  ↓
IPC Broadcast (broadcastToRenderer)
  ↓
Frontend (renderer process)
  ↓ (window.electronAPI listeners)
  ↓
UI Render
```

**Web Mode (WebSocket):**
```
Backend (Express server)
  ↓ (fs.watch, setInterval)
  ↓ Detect changes
  ↓ Call callback
  ↓
WebSocket Broadcast (via channel client sets)
  ↓
Frontend (browser)
  ↓ (ws.onmessage)
  ↓
UI Render
```

### Current Polling Patterns (To Be Replaced)

| Pattern | Location | Interval | Target |
|---------|----------|----------|--------|
| Story polling | `story.js` | 10s | IPC: story data |
| Git polling | `story.js` | 5s | IPC: git status |
| Context polling | `main.ts` | 2s | `check-context.sh` |
| Usage polling | `main.ts` | periodic | `get-usage-stats.sh` |

### Existing File Watching

Already implemented patterns using `fs.watch()`:

1. **Agent Changes** (`pennyfarthing.ts`):
   - Watches session files and agents directory
   - Triggers persona updates
   - 100ms debounce

2. **Tool Stats** (`main.ts`):
   - Watches `.session/` directory
   - 100ms debounce
   - Broadcasts tool stats updates

3. **Livereload** (`websocket.ts`):
   - Watches `public/` directory (dev mode only)
   - 100ms debounce
   - Broadcasts reload to `/ws/livereload` clients

### Existing WebSocket Channels

| Channel | Data Flow | Event Types |
|---------|-----------|-------------|
| `/ws/stats` | Initial stats → push on change | Complete stats object |
| `/ws/persona` | Initial persona → push on change | Persona object |
| `/ws/token-stats` | Initial tokens → push on update | Token stats |
| `/ws/background-tasks` | Initial tasks → push events | `task:started`, `task:completed` |
| `/ws/claude` | N/A (bidirectional) | Message streaming, abort, clear |
| `/ws/livereload` | N/A (dev only) | `reload` signal |

### IPC Channels (Electron)

**Data Update Channels:**
```
stats:update, persona:update, story:update, git:update,
toolStats:update, tokenStats:update, todos:update,
context:update, toolEvents:update, usageStats:update,
projectInfo:update
```

**Background Task Channels:**
```
backgroundTask:started, backgroundTask:completed
```

## Implementation Approach

### MSSCI-11943: Story/Git WebSocket Channels

**New WebSocket Channels:**
```typescript
// websocket.ts additions
/ws/story   // Broadcasts on sprint/*.yaml changes
/ws/git     // Broadcasts on .git/HEAD and .git/index changes
```

**File Watcher Integration:**
```typescript
// server.ts or new file-watchers.ts
import { watch } from 'fs';

// Sprint file watcher
watch('sprint/', { recursive: true }, (eventType, filename) => {
  if (filename?.endsWith('.yaml')) {
    debounce(() => {
      const storyData = readStoryData();
      broadcastStory(storyData);
    }, 100);
  }
});

// Git file watcher
watch('.git/HEAD', () => broadcastGit());
watch('.git/index', () => broadcastGit());
```

**Frontend Migration (story.js):**
```javascript
// Before: setInterval polling
const STORY_POLL_INTERVAL = 10000;
setInterval(() => pollStory(), STORY_POLL_INTERVAL);

// After: WebSocket subscription
const storyWs = new WebSocket(`ws://${host}/ws/story`);
storyWs.onmessage = (event) => updateStoryPanel(JSON.parse(event.data));
```

### MSSCI-11945: Livereload Pattern Alignment

Current livereload uses exponential backoff (500ms → 1000ms → 2000ms → ...).
Migrate to 2s fixed reconnection to match standard WheelHub pattern.

### MSSCI-11946: LocalStorage Cross-Tab Sync

**Current State:** 16+ files access localStorage directly
**Solution:** Centralize via `settings-sync.js` using BroadcastChannel API

```javascript
// settings-sync.js
const channel = new BroadcastChannel('cyclist-settings');

export function setSetting(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  channel.postMessage({ type: 'setting-changed', key, value });
}

channel.onmessage = (event) => {
  if (event.data.type === 'setting-changed') {
    // Update local state without re-storing
    notifySubscribers(event.data.key, event.data.value);
  }
};
```

### MSSCI-11947: Hook Response Data Channel

Extend `/approval-request` endpoint to support structured data payloads for AskUserQuestion and ExitPlanMode tools.

**Current:** `allow/deny` boolean response
**Required:** `{ approved: boolean, data?: object }` with form inputs

### MSSCI-11949: Remove Tool/Skill Panels

After MSSCI-11929 (enriched tool descriptions), the tool-panel.js and skill-panel.js are redundant. Remove:
- `tool-panel.js` and UI
- `skill-panel.js` and UI
- Popup tool notifications
- Badge polling for these panels
- Related localStorage keys

## Key File References

| File | Purpose | Lines of Interest |
|------|---------|-------------------|
| `server.ts` | Main HTTP/WS server | Port management, route mounting |
| `websocket.ts` | WebSocket channel setup | Existing channels, broadcast functions |
| `otlp-receiver.ts` | OTEL metrics, task tracking | `trackBackgroundTask()`, callbacks |
| `main.ts` | Electron orchestration | Context polling, IPC broadcasts |
| `pennyfarthing.ts` | File watching | `watchAgentChanges()` pattern |
| `story.js` | Frontend story/git | Polling patterns to replace |
| `ipc-channels.ts` | IPC constants | Channel definitions |

## Architecture After Implementation

```
┌──────────────────────────────────────────────────────────────┐
│                    WheelHub (Cyclist)                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  File Watchers                                               │
│  ├─ sprint/*.yaml → /ws/story                               │
│  ├─ .git/HEAD, .git/index → /ws/git                         │
│  ├─ .session/* → existing tool stats                        │
│  └─ agents/ → existing persona                               │
│                                                              │
│  WebSocket Channels (consolidated)                           │
│  ├─ /ws/story (NEW) - story data push                       │
│  ├─ /ws/git (NEW) - git status push                         │
│  ├─ /ws/stats, /ws/persona, /ws/token-stats                 │
│  ├─ /ws/background-tasks                                     │
│  └─ /ws/claude (streaming)                                   │
│                                                              │
│  Removed                                                     │
│  ├─ story.js setInterval polling                            │
│  ├─ tool-panel.js (redundant)                               │
│  └─ skill-panel.js (redundant)                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Testing Strategy

### Unit Tests
- File watcher debouncing behavior
- WebSocket channel setup and teardown
- BroadcastChannel message serialization
- Settings sync across simulated tabs

### Integration Tests
- File change → WebSocket broadcast → UI update
- Git branch switch detection
- Sprint YAML modification detection
- Cross-tab theme synchronization

### E2E Tests
- Story panel updates within 2s of file change
- Git indicator updates within 2s of branch switch
- Tab 1 theme change reflects in Tab 2

## Dependencies & Risks

### Dependencies
- Existing WebSocket infrastructure (`websocket.ts`)
- Existing file watching patterns (`pennyfarthing.ts`, `main.ts`)
- Background tasks system (ADR-0004)
- Enriched tool descriptions (MSSCI-11929)

### Risks
1. **File watcher reliability** - `fs.watch()` behavior varies by OS
2. **Debounce timing** - Too short causes duplicate broadcasts, too long feels laggy
3. **Git hook complexity** - `.git/index` changes frequently during operations
4. **Cross-tab sync edge cases** - Tab focus, stale state, race conditions

### Mitigations
- Use 100ms debounce (consistent with existing patterns)
- Git watcher ignores rapid-fire changes (coalesce within 500ms)
- BroadcastChannel messages include timestamps for staleness detection
- Fallback to polling if WebSocket disconnects (progressive enhancement)

## Related ADRs

- **ADR-0004:** WheelHub Background Agent Coordination - Establishes WebSocket channel patterns for task events
