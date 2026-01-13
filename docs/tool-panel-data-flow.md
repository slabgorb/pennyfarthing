# Tool Panel Data Flow Analysis

Investigation into why tool events are not appearing in the tool panel.

## Root Cause Found

**Claude Code telemetry is opt-in!** The following environment variables were missing:

```bash
CLAUDE_CODE_ENABLE_TELEMETRY=1   # Required to enable telemetry
OTEL_LOGS_EXPORTER=otlp          # Required for tool events
OTEL_METRICS_EXPORTER=otlp       # Required for token metrics
```

The fix was applied in `packages/cyclist/src/server.ts` - `getOtelConfig()` now returns all required env vars.

See: [Claude Code Monitoring Docs](https://code.claude.com/docs/en/monitoring-usage)

## Sequence Diagram - Fixed Flow

```mermaid
sequenceDiagram
    participant Claude as Claude CLI
    participant OTEL as OTEL HTTP Endpoint<br/>/v1/logs
    participant Receiver as otlp-receiver.ts
    participant Main as main.ts
    participant IPC as IPC Channel
    participant Renderer as ToolLogViewer.js

    Note over Claude,Renderer: Fixed Implementation Flow

    rect rgb(200, 255, 200)
        Note over Claude: CLAUDE_CODE_ENABLE_TELEMETRY=1<br/>OTEL_LOGS_EXPORTER=otlp
    end

    Claude->>OTEL: POST /v1/logs<br/>(tool events)
    OTEL->>Receiver: parseOTLPLogs(body)
    Receiver->>Receiver: processLogEvents()
    Receiver->>Receiver: recordToolEvent(event)
    Receiver->>Main: toolEventCallback(event)
    Main->>IPC: broadcastToRenderer('auditLog:entry', event)
    IPC->>Renderer: onEntry callback
    Renderer->>Renderer: handleToolEvent(entry)
```

## Architecture Diagram - Fixed

```mermaid
flowchart TD
    subgraph "ClaudeService Spawn"
        A0[getOtelConfig] -->|env vars| A1[spawn claude]
        A1 -->|CLAUDE_CODE_ENABLE_TELEMETRY=1| A2[Claude CLI]
    end

    subgraph "OTEL Route (server.ts)"
        A[POST /v1/logs] --> B[otlp.ts router]
        B --> C[processLogEvents]
    end

    subgraph "otlp-receiver.ts"
        C --> D[recordToolEvent]
        D --> E{toolEventCallback<br/>set?}
        E -->|Yes| F[callback invoked]
    end

    subgraph "main.ts - Electron"
        H[startProjectWatchers] --> I[setToolEventCallback]
        I -.-> E
        F --> J[broadcastToRenderer]
    end

    subgraph "Renderer"
        J --> K[auditLog:entry IPC]
        K --> L[ToolLogViewer]
    end

    A2 -->|tool events| A

    style A0 fill:#90EE90
    style F fill:#90EE90
```

## Key Files

| File | Role |
|------|------|
| `packages/cyclist/src/server.ts` | Express server, mounts OTEL route, **getOtelConfig()** |
| `packages/cyclist/src/api/otlp.ts` | POST /v1/logs handler |
| `packages/cyclist/src/otlp-receiver.ts` | Parses OTEL, stores events, has callback |
| `packages/cyclist/src/main.ts` | Electron main, sets callback in startProjectWatchers() |
| `packages/cyclist/src/preload.ts` | IPC bridge, exposes auditLog.onEntry |
| `packages/cyclist/src/public/js/components/ToolLogViewer.js` | Renders tool events |

## Fix Applied

In `server.ts`, `getOtelConfig()` now returns:

```typescript
{
  CLAUDE_CODE_ENABLE_TELEMETRY: '1',
  OTEL_LOGS_EXPORTER: 'otlp',
  OTEL_METRICS_EXPORTER: 'otlp',
  OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
  OTEL_EXPORTER_OTLP_ENDPOINT: `http://localhost:${port}`,
}
```

These are passed to `ClaudeService` constructor and merged into the spawn environment.
