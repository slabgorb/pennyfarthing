# ADR-0016: Bell Mode (Message Queue Injection)

**Status:** Accepted
**Date:** 2026-01-28
**Author:** Architect (Naomi Nagata)

## Context

When Claude is working on a task, users often want to provide additional context, corrections, or follow-up instructions without waiting for Claude to finish. The standard interaction model requires waiting for completion before sending the next message.

**User pain points:**
- Watching Claude go down the wrong path, unable to intervene
- Remembering context to add later, then forgetting
- Breaking flow to wait for completion
- No way to queue thoughts while Claude works

Claude Code 2.1.0 introduced "real-time steering" which injects messages mid-stream. Cyclist took a different approach: **queue-based injection via hooks**.

## Decision

Implement **Bell Mode** - a message queue system that injects user messages into Claude's context via the PostToolUse hook mechanism.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cyclist UI                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              TipTap Editor (message input)               │    │
│  │                         │                                │    │
│  │          User types message while Claude works           │    │
│  │                         │                                │    │
│  │                    [Queue Message]                       │    │
│  └─────────────────────────┬───────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │           message-queue.js (in-memory queue)             │    │
│  │                         │                                │    │
│  │              bell-mode.ts syncs to file                  │    │
│  └─────────────────────────┬───────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │         .pennyfarthing/bell-queue.json                   │    │
│  │              [{"text": "...", "images": []}]             │    │
│  └─────────────────────────┬───────────────────────────────┘    │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               │ (file system)
                               │
┌──────────────────────────────┼──────────────────────────────────┐
│                       Claude Code                                │
│                              │                                   │
│                     PostToolUse Hook                             │
│                              │                                   │
│  ┌───────────────────────────▼─────────────────────────────┐    │
│  │              bell-mode-hook.sh                           │    │
│  │                                                          │    │
│  │  1. Check bell_mode enabled in config.local.yaml         │    │
│  │  2. Read bell-queue.json                                 │    │
│  │  3. If queue has messages:                               │    │
│  │     - Return additionalContext JSON                      │    │
│  │     - Signal Cyclist to dequeue                          │    │
│  │  4. If empty: return nothing                             │    │
│  └──────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│              Claude receives injected context                    │
└──────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `bell-mode.ts` | `packages/cyclist/src/` | State management, queue sync |
| `message-queue.js` | `packages/cyclist/src/public/js/editor/` | In-memory queue |
| `bell-mode-hook.sh` | `pennyfarthing-dist/scripts/hooks/` | PostToolUse hook |
| `bell-queue.json` | `.pennyfarthing/` | Queue file (hook reads this) |
| `config.local.yaml` | `.pennyfarthing/` | Stores `workflow.bell_mode` |

### State Management

Bell mode state is persisted in `.pennyfarthing/config.local.yaml`:

```yaml
theme: the-expanse
workflow:
  bell_mode: true        # Bell mode enabled
  relay_mode: false      # Auto-handoff (separate concern)
  permission_mode: manual
```

**Why YAML, not just in-memory?**
- Survives Cyclist restart
- Hook script can read it (no IPC needed)
- Consistent with other workflow settings

### Queue File Format

```json
[
  {
    "text": "Actually, use the existing UserService instead of creating a new one",
    "images": []
  },
  {
    "text": "Also make sure to add tests",
    "images": []
  }
]
```

**FIFO order** - First queued message is injected first.

### Hook Script Behavior

```bash
# bell-mode-hook.sh (simplified)

# 1. Check if bell mode is enabled
bell_mode=$(yq '.workflow.bell_mode // false' .pennyfarthing/config.local.yaml)
if [ "$bell_mode" != "true" ]; then
  exit 0  # No injection
fi

# 2. Check if queue has messages
if [ ! -f .pennyfarthing/bell-queue.json ]; then
  exit 0
fi

queue=$(cat .pennyfarthing/bell-queue.json)
if [ "$queue" = "[]" ]; then
  exit 0
fi

# 3. Return additionalContext for first message
first_message=$(echo "$queue" | jq -r '.[0].text')
cat << EOF
{
  "additionalContext": "User added while you were working: $first_message"
}
EOF

# 4. Signal Cyclist to dequeue (via HTTP or file marker)
```

### UI Integration

**Controls:**
- Bell icon in toolbar toggles bell mode on/off
- Queue count badge shows pending messages
- Queue can be viewed/cleared in sidebar

**Visual feedback:**
- Bell icon pulses when queue has messages
- Toast notification when message is injected
- Queue empties as messages are consumed

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/bell/status` | GET | Check if bell mode enabled, queue count |
| `/api/bell/toggle` | POST | Toggle bell mode on/off |
| `/api/bell/queue` | GET | Get current queue |
| `/api/bell/queue` | POST | Add message to queue |
| `/api/bell/queue` | DELETE | Clear queue |
| `/api/bell/consumed` | POST | Called by hook after injection |

## Consequences

### Positive

- **Non-blocking input** - Users can type while Claude works
- **FIFO ordering** - Messages delivered in order queued
- **Persistent state** - Survives restarts
- **Hook-based** - No Claude Code modification needed
- **Orthogonal** - Works with any permission mode

### Negative

- **Timing uncertainty** - Message injected at next tool use, not immediately
- **File I/O overhead** - Queue synced to file for hook access
- **Single consumer** - Only one hook can consume (no parallel injection)

### Neutral

- **Different from steering** - Queue vs interrupt mental model
- **Requires bell mode enabled** - Explicit opt-in

## Alternatives Considered

### 1. Real-Time Steering (Claude Code Style)

Inject directly into active stream.

**Rejected:** Requires Claude Code internals modification. Queue approach works with standard hooks.

### 2. IPC Between Cyclist and Hook

Use Unix socket or named pipe.

**Rejected:** File-based is simpler, more debuggable, works across process boundaries.

### 3. WebSocket Push to Hook

Cyclist pushes to hook via WebSocket.

**Rejected:** Hooks are short-lived scripts, not persistent processes.

## References

- Implementation: `packages/cyclist/src/bell-mode.ts`
- Hook script: `pennyfarthing-dist/scripts/hooks/bell-mode-hook.sh`
- Tests: `packages/cyclist/tests/MSSCI-12275-bell-mode.test.ts`
- Story: MSSCI-12275 (Bell Mode implementation)
- ADR-0003: Cyclist Claude Code Alignment (documents queue vs steering decision)
