---
name: electron-ipc
description: Electron IPC communication patterns for Cyclist. Use when adding IPC handlers, creating main-renderer communication, implementing streaming responses, or debugging IPC issues.
---

# Electron IPC Skill

## When to Use This Skill

- Adding new IPC handlers to Cyclist
- Creating frontend-backend communication
- Implementing streaming responses (e.g., OTEL data, agent output)
- Debugging IPC channel issues
- Understanding Cyclist's process architecture

## Architecture Pattern

Cyclist uses Electron IPC for all main-renderer communication:

| Direction | Pattern | Example |
|-----------|---------|---------|
| Renderer → Main | `window.electron.invoke()` | Save settings, fetch data |
| Main → Renderer | `event.sender.send()` | Stream OTEL spans, push updates |
| Broadcast | `mainWindow.webContents.send()` | Settings changed, state updates |

## Handler Locations

```
packages/cyclist/src/
├── main.ts                    # Main process, IPC handler setup
├── preload.ts                 # Exposes channels to renderer
├── api/                       # REST API (server mode only)
└── public/js/
    └── settings-ui.js         # Renderer-side IPC calls
```

## Creating New Handlers

### 1. Main Process Handler (main.ts)

```typescript
import { ipcMain, IpcMainInvokeEvent } from 'electron';

// Request-response pattern
ipcMain.handle('myfeature:action', async (event: IpcMainInvokeEvent, data: InputType) => {
  try {
    // 1. Validate input
    if (!data || !data.requiredField) {
      return { success: false, error: 'Invalid input' };
    }

    // 2. Perform work
    const result = await doWork(data);

    // 3. Return result
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

// Streaming pattern (for real-time data)
ipcMain.handle('myfeature:stream', async (event: IpcMainInvokeEvent, data: InputType) => {
  const stream = createStream(data);

  stream.on('data', (chunk) => {
    event.sender.send('myfeature:stream:data', chunk);
  });

  stream.on('end', () => {
    event.sender.send('myfeature:stream:end');
  });

  stream.on('error', (error) => {
    event.sender.send('myfeature:stream:error', error.message);
  });

  return { success: true };
});
```

### 2. Preload Script (preload.ts)

Expose channels to renderer:

```typescript
contextBridge.exposeInMainWorld('electron', {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_, ...args) => callback(...args));
  },
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  }
});
```

### 3. Renderer Usage (public/js/*.js)

```javascript
// Simple request-response
const result = await window.electron.invoke('myfeature:action', {
  requiredField: 'value'
});

if (result.success) {
  console.log('Got:', result.data);
} else {
  console.error('Error:', result.error);
}

// Streaming
window.electron.on('myfeature:stream:data', (data) => {
  updateUI(data);
});

window.electron.on('myfeature:stream:end', () => {
  console.log('Stream complete');
});

// Start the stream
await window.electron.invoke('myfeature:stream', { prompt: 'Hello' });
```

## Cyclist IPC Channels

### Settings Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `settings:get` | Renderer → Main | Get current settings |
| `settings:save` | Renderer → Main | Save settings |
| `settings:changed` | Main → Renderer | Broadcast settings update |

### OTEL Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `otel:span` | Main → Renderer | Push span data |
| `otel:stats` | Main → Renderer | Push token stats |

### Window Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `window:open-settings` | Renderer → Main | Open settings window |
| `window:close` | Renderer → Main | Close current window |

## Broadcasting to All Windows

```typescript
import { BrowserWindow } from 'electron';

function broadcastToRenderer(channel: string, data: unknown) {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  });
}

// Usage
broadcastToRenderer('settings:changed', updatedSettings);
```

## Security Checklist

- [ ] Validate all incoming IPC data
- [ ] Use TypeScript for type safety
- [ ] Sanitize user input before file/shell operations
- [ ] Never expose sensitive paths to renderer
- [ ] Use `app.getPath('userData')` for persistent storage
- [ ] Define allowed channels in preload (whitelist pattern)

## Debugging IPC

### Main Process Logging

```typescript
ipcMain.handle('channel:name', async (event, data) => {
  console.log('[IPC] channel:name received:', data);
  // ...
});
```

### Renderer Logging

```javascript
const result = await window.electron.invoke('channel:name', data);
console.log('[Renderer] Response:', result);
```

### DevTools Network Tab

IPC calls don't appear in Network tab. Use console logging or Electron DevTools extensions.

## Common Patterns in Cyclist

### Settings Save with Broadcast

```typescript
// main.ts
ipcMain.handle('settings:save', async (event, settings) => {
  const result = await saveSettings(settings);
  if (result.success) {
    // Broadcast to all windows
    broadcastToRenderer('settings:changed', result.settings);
  }
  return result;
});
```

### Initialization Race Condition

**Problem:** Renderer requests settings before main process is ready.

**Solution:** Initialize settings before window creation:

```typescript
// main.ts - in app.whenReady()
initializeSettings(projectDir);  // BEFORE createWindow()
const mainWindow = createWindow();
```

## See Also

- `packages/cyclist/src/main.ts` - Main process IPC handlers
- `packages/cyclist/src/preload.ts` - Channel exposure
- `packages/cyclist/src/settings.ts` - Settings management
