# Cyclist Debugging Guide

This guide covers real-time debugging capabilities for the Cyclist visual terminal.

## Quick Start

```bash
# Start with debugging enabled
npm run dev:debug

# Open Chrome and navigate to chrome://inspect
# Click "inspect" under Remote Target to attach DevTools
```

## Debug Modes

### 1. Web Server with Chrome DevTools

```bash
# Standard debug mode - attach Chrome DevTools
npm run dev:debug

# Break at start - pauses before first line executes
npm run dev:debug-brk
```

After starting, open `chrome://inspect` in Chrome and click "inspect" on the Cyclist process.

### 2. Electron Main Process Debugging

```bash
npm run dev:electron-debug
```

This starts Electron with `--inspect=9229`. Attach via:
- Chrome DevTools at `chrome://inspect`
- VS Code with an attach configuration

### 3. Electron Renderer DevTools

In the running Electron app:
- **View menu → Toggle DevTools** (or `Cmd+Option+I`)
- Full Chrome DevTools for the renderer process

## Debug Panel (Real-time OTEL Viewer)

The Debug panel provides real-time visibility into tool executions.

### Accessing the Debug Panel

- **Keyboard**: `Cmd+5`
- **Tab bar**: Click the "DEBUG" tab
- **Menu**: Tools → Debug Panel

### Features

| Feature | Description |
|---------|-------------|
| **Span Timeline** | Chronological view of all tool executions |
| **Duration Bars** | Visual representation of execution time |
| **Tool Filtering** | Filter by tool type (Bash, Read, Edit, etc.) |
| **Status Filtering** | Show only success or error spans |
| **Enrichment Details** | Click a span to see details (file path, exit code, etc.) |
| **Export** | Export spans as JSON for offline analysis |

### Span Enrichment Data

Each tool type includes specific enrichment:

| Tool | Enrichment Fields |
|------|-------------------|
| **Bash** | command, exitCode, workingDirectory |
| **Read/Write** | fileSize, lineCount, language, gitStatus |
| **Edit** | diff (added/removed lines), language |
| **Task** | subagentType, promptSummary, resultSummary |
| **Grep/Glob** | pattern, matchCount, fileCount |

### Real-time Updates

The Debug panel receives updates via:
- **Electron**: IPC channel `auditLog:entry`
- **Web mode**: WebSocket at `/ws/spans`

## OTEL Capture File

All OTEL spans are captured to `/tmp/otel-capture.jsonl` when `OTEL_DEBUG=true`.

```bash
# Enable OTEL debug capture
OTEL_DEBUG=true pnpm run dev:vite

# Watch the capture file
tail -f /tmp/otel-capture.jsonl | jq .

# Filter for specific tool
tail -f /tmp/otel-capture.jsonl | jq 'select(.toolName == "Bash")'
```

## Playwright E2E Testing

Playwright provides visual debugging for E2E tests.

### Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI mode (interactive)
npm run test:e2e:ui

# Run in debug mode
npm run test:e2e:debug

# Run specific browser only
npm run test:e2e:web  # Chromium
```

### Debug Mode

```bash
npm run test:e2e:debug
```

This opens Playwright Inspector where you can:
- Step through tests
- Inspect selectors
- View console logs
- Take screenshots

### Trace Viewer

When tests fail, traces are automatically captured.

```bash
# View the last trace
npm run test:e2e:trace e2e-results/trace.zip
```

The trace viewer shows:
- Timeline of actions
- DOM snapshots at each step
- Network requests
- Console logs

### Writing E2E Tests

Tests are located in `e2e/*.e2e.ts`. Example:

```typescript
import { test, expect } from '@playwright/test';

test('should toggle debug panel', async ({ page }) => {
  await page.goto('/');

  // Press Cmd+5 to toggle
  await page.keyboard.press('Meta+5');

  // Verify panel is open
  const debugPanel = page.locator('#debug-panel');
  await expect(debugPanel).not.toHaveClass(/collapsed/);
});
```

## WebSocket Endpoints

For real-time debugging, these WebSocket endpoints are available:

| Endpoint | Purpose |
|----------|---------|
| `/ws/spans` | Real-time span streaming |
| `/ws/stats` | Tool statistics |
| `/ws/token-stats` | Token usage updates |
| `/ws/background-tasks` | Background task status |

### Connecting to WebSocket

```javascript
const ws = new WebSocket('ws://localhost:1900/ws/spans');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'init') {
    console.log('Initial spans:', data.spans);
  } else if (data.type === 'span') {
    console.log('New span:', data.span);
  }
};
```

## REST API Endpoints

### Spans API

```bash
# Get all spans (paginated)
curl http://localhost:1900/api/spans

# Get spans with filter
curl "http://localhost:1900/api/spans?toolType=Bash&status=error"

# Get span summary
curl http://localhost:1900/api/spans/summary

# Export spans
curl http://localhost:1900/api/spans/export
```

## Troubleshooting

### Debug panel not showing spans

1. Check OTEL is enabled: `OTEL_DEBUG=true`
2. Verify WebSocket connection in browser DevTools (Network tab)
3. Check `/api/spans` returns data

### Chrome DevTools not attaching

1. Ensure correct port (9229 for `--inspect`)
2. Check `chrome://inspect` shows the process
3. Try restarting the debug session

### Playwright tests failing

1. Ensure Cyclist server is running
2. Check port 1900 is available
3. Run with `--debug` for interactive debugging
4. Check test output in `e2e-results/`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_DEBUG` | false | Enable OTEL capture to file |
| `CYCLIST_PORT` | 1900 | Server port |
| `CYCLIST_DEV_WEB` | - | Enable web-only mode |
| `CYCLIST_PROJECT_DIR` | pwd | Project directory for context |

## Files Reference

| File | Purpose |
|------|---------|
| `src/public/js/debug-panel.js` | Debug panel component |
| `src/public/js/components/SpanTimeline.js` | Timeline visualization |
| `src/websocket.ts` | WebSocket servers including `/ws/spans` |
| `src/otlp-receiver.ts` | OTEL parsing and tool event callbacks |
| `src/api/spans.ts` | REST API for spans |
| `e2e/*.e2e.ts` | Playwright E2E tests |
| `playwright.config.ts` | Playwright configuration |
