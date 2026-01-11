# Story 20-1: Auto-configure OTEL for web mode - Technical Context

## Story Overview
- **Epic**: 20 - Cyclist Web Mode Improvements
- **Points**: 3 (Standard TDD workflow)
- **Priority**: P1
- **Repos**: pennyfarthing

## Problem Statement
When using Cyclist in web mode, token stats don't appear unless the user manually launches Claude Code with OTEL environment variables. This requires a two-terminal workflow and knowledge of which port Cyclist is using.

Current workaround:
```bash
# Terminal 1: Start Cyclist
just cyclist-web

# Terminal 2: Start Claude with OTEL (must know port!)
just claude-with-cyclist 1898
```

## Technical Approach: Port File Discovery

After analyzing the options, the **Port File Discovery** approach is recommended:

1. **Cyclist writes port file** - When server starts, write actual port to `.cyclist-port`
2. **Hook reads port file** - Pennyfarthing startup hook reads file and sets OTEL env
3. **Fallback UX** - Clear UI messaging when OTEL not configured

### Why This Approach
- Simple and decoupled from Claude Code internals
- Works with any launch method (terminal, IDE, etc.)
- Reuses existing hook infrastructure
- Minimal code changes

## Implementation Plan

### Part 1: Port File Writer (Cyclist)
**File**: `packages/cyclist/src/server.ts`

Add port file writing after server starts:
```typescript
// After server.listen()
const portFilePath = path.join(projectDir, '.cyclist-port');
fs.writeFileSync(portFilePath, String(actualPort));

// On shutdown, clean up
process.on('SIGTERM', () => fs.unlinkSync(portFilePath));
```

### Part 2: Startup Hook (Pennyfarthing)
**File**: `pennyfarthing-dist/scripts/hooks/otel-auto-config.sh`

New hook that runs on Claude Code startup:
```bash
#!/bin/bash
# Auto-configure OTEL if Cyclist port file exists
PORT_FILE="$CLAUDE_PROJECT_DIR/.cyclist-port"
if [[ -f "$PORT_FILE" ]]; then
  PORT=$(cat "$PORT_FILE")
  export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
  export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:$PORT"
fi
```

### Part 3: UI Status Indicator
**File**: `packages/cyclist/src/renderer/components/TokenStats.tsx`

Show connection status:
- Green dot: OTEL receiving data
- Yellow dot: OTEL endpoint configured but no data
- Red dot with link: OTEL not configured, show setup instructions

## Files to Modify

| File | Change |
|------|--------|
| `packages/cyclist/src/server.ts` | Write `.cyclist-port` file on startup |
| `packages/cyclist/src/main.ts` | Clean up port file on exit |
| `pennyfarthing-dist/scripts/hooks/otel-auto-config.sh` | New hook to read port and set env |
| `.claude/settings.json` or hook registration | Register the new hook |
| UI component (TBD) | Status indicator for OTEL connection |

## Acceptance Criteria

- [ ] AC1: Token stats appear in web mode without manual OTEL config
  - Cyclist writes `.cyclist-port` file with actual port number
  - Hook reads file and sets `OTEL_EXPORTER_OTLP_ENDPOINT`
  - Token stats show in UI when Claude Code runs commands

- [ ] AC2: Clear error message if OTEL not configured
  - UI shows status indicator (connected/disconnected)
  - Disconnected state shows setup instructions or troubleshooting tips

- [ ] AC3: Documentation for manual setup as fallback
  - Update skill.md or add inline help
  - Document the `just claude-with-cyclist` recipe as fallback

## Testing Strategy

### Unit Tests
- Port file is written with correct content
- Port file is cleaned up on shutdown
- Hook correctly parses port file and sets env vars

### Integration Tests
- Start Cyclist web → Start Claude Code → Verify token stats appear
- Verify graceful handling when port file doesn't exist
- Verify cleanup when Cyclist stops

### Manual Verification
1. Start `just cyclist-web` in terminal 1
2. Start `claude` (no special args) in terminal 2
3. Run a command in Claude
4. Verify token stats update in Cyclist UI

## Dependencies & Risks

### Dependencies
- Cyclist server must start before Claude Code
- Port file must be in a location accessible to hooks
- Hook must run early enough to set env before Claude SDK init

### Risks
- **Stale port file**: If Cyclist crashes without cleanup, stale file could point to wrong port
  - Mitigation: Check if port is actually listening before using
- **Permission issues**: Port file in project root may have permission issues
  - Mitigation: Use `.cyclist-port` (dotfile) to keep it hidden
- **Race condition**: Claude starts before Cyclist writes port file
  - Mitigation: Hook should handle missing file gracefully

## Out of Scope
- Spawning Claude Code as subprocess (Story 20-3)
- Feature parity audit (Story 20-2)
- Changes to Electron mode (already works)
