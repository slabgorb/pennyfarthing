# Story 23-3: Command Abstraction Layer (IPC)

## Story Overview
- **ID:** 23-3
- **Epic:** 23 (Cyclist Claude Code Command Integration)
- **Points:** 3
- **Priority:** P1
- **Repo:** cyclist (packages/cyclist/)

## Goal
Create dedicated IPC handlers for Claude Code commands rather than PTY injection. This establishes the foundation for all command execution in Epic 23.

## Acceptance Criteria
- [ ] IPC channels defined as constants
- [ ] Handlers registered in `setupCommandIPCHandlers()`
- [ ] Preload exposes command API
- [ ] Commands execute in Claude PTY session
- [ ] Results broadcast back to renderer

## Architecture Decision
**Approach:** Dedicated IPC handlers (not PTY injection)

**Rationale:**
- Cleaner separation of concerns
- Better error handling
- Can parse command output
- Enables richer UI integration
- Consistent with existing Cyclist patterns

## Key Files to Modify

### 1. main.ts (packages/cyclist/src/main.ts)
**Purpose:** Register IPC handlers in Electron main process

**Add IPC Constants (~L167):**
```typescript
export const IPC_COMMAND_CHANNELS = {
  EXECUTE: 'command:execute',
  RESULT: 'command:result',
  ERROR: 'command:error',
} as const;
```

**Create Handler Function (~L1300):**
```typescript
export function setupCommandIPCHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_COMMAND_CHANNELS.EXECUTE, async (_event, command: string) => {
    const service = getClaudeService();
    try {
      // Execute command and stream results
      for await (const result of service.executeCommand(command)) {
        broadcastToRenderer(IPC_COMMAND_CHANNELS.RESULT, result);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      broadcastToRenderer(IPC_COMMAND_CHANNELS.ERROR, message);
      throw error;
    }
  });
  console.log('Command IPC handlers registered');
}
```

**Register Handler (~L1532):**
```typescript
setupCommandIPCHandlers(ipcMain);
```

### 2. preload.ts (packages/cyclist/src/preload.ts)
**Purpose:** Expose command API to renderer process

**Add Interface (~L200):**
```typescript
export interface ElectronCommandAPI {
  execute: (command: string) => Promise<void>;
  onResult: (callback: (result: unknown) => void) => void;
  onError: (callback: (error: string) => void) => void;
}
```

**Extend ElectronAPI (~L270):**
```typescript
command: ElectronCommandAPI;
```

**Implement in createElectronAPI() (~L420):**
```typescript
command: {
  execute: (cmd: string) => ipcRenderer.invoke('command:execute', cmd),
  onResult: (cb: (result: unknown) => void) => {
    ipcRenderer.on('command:result', (_e, result) => cb(result));
  },
  onError: (cb: (error: string) => void) => {
    ipcRenderer.on('command:error', (_e, err) => cb(err as string));
  },
}
```

## Existing Patterns to Follow

### IPC Channel Constants Pattern (main.ts L84-166)
```typescript
export const IPC_DATA_CHANNELS = {
  STATS_GET: 'data:stats:get',
  STATS_UPDATE: 'data:stats:update',
  // ...
} as const;
```

### Handler Registration Pattern (main.ts L1074-1195)
- Use `ipcMain.handle()` for request/response
- Use `broadcastToRenderer()` for streaming results
- Get service via `getClaudeService()` singleton

### Preload API Pattern (preload.ts L34-75)
- Define interface with invoke + callback methods
- Implement in createElectronAPI() factory
- Provide test stubs for non-Electron environments

## Testing Strategy

### Unit Tests (TEA will write)
1. IPC channel constants are exported correctly
2. `setupCommandIPCHandlers()` registers expected handlers
3. Handler executes command via ClaudeService
4. Results are broadcast via correct channel
5. Errors are broadcast via error channel

### Integration Tests
1. Renderer can invoke `window.electronAPI.command.execute()`
2. Results flow back to renderer callbacks
3. Error callbacks receive error messages

## Dependencies
- ClaudeService must have `executeCommand()` method (verify exists)
- No external dependencies

## Notes
- This is foundational for stories 23-4 (Compact), 23-6 (Palette), 23-7 (Doctor)
- Follow streaming pattern from ClaudeSDK handlers
- Commands will include: /compact, /doctor, /status, /rewind

---
*Context created: 2026-01-11 by SM (Leslie Knope)*
