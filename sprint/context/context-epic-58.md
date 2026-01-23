# Epic 58: Sprint & Story Awareness - Technical Context

## Epic Overview

**Jira:** MSSCI-12236
**Goal:** Users can see their current story, sprint status, and branch health without leaving VS Code - full workflow awareness via the sidebar tree view.

## Architecture Decision: WheelHub as Single Source of Truth

**Problem:** The VS Code extension currently has two parallel data sources for story/sprint information:
1. WheelHub WebSocket channels (real-time broadcasts from Cyclist server)
2. Local file watchers (direct file system watching in the extension)

This dual approach:
- Creates synchronization bugs when sources disagree
- Duplicates file watching logic between Cyclist and VS Code extension
- Makes debugging harder (which source caused the update?)
- Doesn't scale to multi-client scenarios (multiple VS Code windows)

**Decision:** Consolidate all story/sprint data flow through WheelHub. The extension becomes a pure consumer of WheelHub broadcasts.

## Current Data Flow

```
[Session Files] ----+
    .session/       |
    *-session.md    +--> [VS Code Sidebar]  <-- REDUNDANT
                    |       (file watchers)
                    |
[Sprint Files] -----+
    sprint/         |
    *.yaml          |
                    |
       +------------+
       |
       v
[Cyclist/WheelHub] ----> [/ws/story] ----> [VS Code Sidebar]
    (file watchers)                         (WheelHub listener)
```

## Target Data Flow (After Epic 58)

```
[Session Files]     [Sprint Files]
    .session/           sprint/
    *-session.md        *.yaml
         |                 |
         +--------+--------+
                  |
                  v
           [Cyclist/WheelHub]
            (file watchers)
                  |
                  v
             [/ws/story]
                  |
                  v
          [VS Code Sidebar]
           (WheelHub only)
```

## Key Files

### Cyclist (WheelHub Server)

| File | Purpose |
|------|---------|
| `packages/cyclist/src/websocket.ts:279-300` | Sprint YAML file watcher, broadcasts to `/ws/story` |
| `packages/cyclist/src/story-parser.ts` | Parses session/sprint files into `StoryInfo` |
| `packages/cyclist/src/story-parser.ts:414-486` | `getStoryInfo()` - reads `.session/*-session.md` |

### VS Code Extension

| File | Purpose |
|------|---------|
| `packages/vscode-extension/src/providers/sidebar.ts:783-786` | `updateStory()` method |
| `packages/vscode-extension/src/providers/sidebar.ts:806-823` | `connectToWheelHub()` with stats listener |
| `packages/vscode-extension/src/providers/sidebar.ts:895-1044` | **TO REMOVE:** File watchers |
| `packages/vscode-extension/src/server/websocket-manager.ts:194-196` | `addStoryListener()` for same-process updates |

## Stories in This Epic

| Story | Title | Points | Key Change |
|-------|-------|--------|------------|
| 58-1 | Story Status Tree View | 2 | Add `.session/` watching to Cyclist, remove from extension |
| 58-2 | Sprint Metrics Display | 2 | Sprint data already flows through WheelHub, verify display |
| 58-3 | Branch Status Indicator | 2 | Git status via WheelHub `/ws/git` channel |
| 58-4 | File Watcher Integration | 2 | Final cleanup - ensure all watchers in Cyclist |

## Dependencies

- **Story 57-3** (Real-time Agent Updates) established the WheelHub WebSocket pattern for the extension
- **MSSCI-11943** (Story/Git WebSocket channels) added `/ws/story` and `/ws/git` channels

## Testing Strategy

1. **Unit tests:** Mock WheelHub broadcasts, verify sidebar updates
2. **Integration tests:** File change triggers broadcast triggers UI update
3. **Manual verification:**
   - Start a story via `/sm`, verify sidebar shows story info
   - Edit session file manually, verify sidebar updates within 500ms
   - Disconnect from WheelHub, verify graceful degradation
