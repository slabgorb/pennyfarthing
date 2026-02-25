# Bell Mode

<info>
Message queue injection system. Users queue messages while Claude works; messages inject into Claude's context via the PostToolUse hook.
</info>

<critical>
Bell Mode uses **file-based queue** (`bell-queue.json`), not IPC. The hook reads the file, injects the first message as `additionalContext`, then dequeues. Queue is FIFO.
</critical>

## Flow

```
User queues message in Editor
  → [Message Queue] (localStorage + bell-queue.json)
  → PostToolUse hook reads queue
  → Injects first message as additionalContext
  → Hook calls /api/bell-consumed
  → Server broadcasts via /ws/bell
  → React dequeues and displays with bell indicator
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/cyclist/src/bell-mode.ts` | State management: `isBellModeEnabled()`, `setBellMode()`, `toggleBellMode()` |
| `packages/cyclist/src/api/bell.ts` | WebSocket broadcast of bell-consumed events |
| `pf hooks bell-mode` | PostToolUse hook — reads queue, returns `additionalContext` |
| `packages/cyclist/src/public/hooks/useMessageQueue.ts` | React hook: `queueMessage()`, `dequeueMessage()`, `injectMessage()`, `handleTurnComplete()` |
| `packages/cyclist/src/public/contexts/MessageQueueContext.tsx` | Shared React context (single queue instance across components) |
| `packages/cyclist/src/public/components/ControlBar.tsx` | Bell mode toggle button |
| `packages/cyclist/src/public/components/panels/MessagePanel.tsx` | Displays bell-injected messages with indicator, "Send Now" button |

## Configuration

```yaml
# .pennyfarthing/config.local.yaml
workflow:
  bell_mode: true
```

```json
// .pennyfarthing/bell-queue.json
[{"text": "Use the existing UserService instead", "images": []}]
```

## API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/bell-queue` | POST | Write queue to file (only if bell mode enabled) |
| `/api/bell-consumed` | POST | Called by hook; broadcasts to `/ws/bell` |
| `/ws/bell` | WS | Real-time bell-consumed events to browser |

## Behavior Notes

- Max 10 queued messages
- Queue syncs to file even when bell mode is off
- On turn complete, remaining queued messages are sent normally
- `MessageQueueContext` prevents dual-instance queue bug (multiple React trees competing to dequeue the same message)

<info>
**ADR:** `docs/adr/0016-bell-mode-message-injection.md`
</info>
