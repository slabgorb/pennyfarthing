# Story 34-3: Port conflict detection and messaging - Technical Context

## Story Overview
- **Epic:** 34 - Cyclist Developer Experience
- **Points:** 1 (trivial)
- **Priority:** P2
- **Repos:** pennyfarthing
- **Jira:** MSSCI-11621
- **Routing:** SM → Dev (skip TEA for 1pt story)

## Current State

### Electron Mode (main.ts) - COMPLETE
Lines 2103-2178 already implement all requirements:
- `findAvailablePort()` - scans ports 1898-1907 for availability
- Logs port conflict: `Port 1898 in use, using 1899 instead`
- Writes `.cyclist-port` file via `writePortFile(projectDir, actualPort)`
- Shows correct URL: `Cyclist server running at http://localhost:{actualPort}`

### Standalone Server Mode (server.ts) - GAP
Lines 92-99 lack port conflict handling:
```typescript
const PORT = process.env.PORT || 1898;
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createTerminalServer();
  server.listen(PORT, () => {
    console.log(`Cyclist running at http://localhost:${PORT}`);
  });
}
```

**Problems:**
1. Crashes with `EADDRINUSE` if port 1898 is busy
2. Never writes `.cyclist-port` file
3. Can't show actual port (always assumes PORT works)

## Technical Approach

### Option A: Extract and Share (Recommended)
1. Extract `findAvailablePort()` from main.ts to a shared utility
2. Import in server.ts standalone mode
3. Add port file writing to standalone startup

**Benefits:** DRY, consistent behavior between modes

### Option B: Inline in server.ts
1. Duplicate `findAvailablePort()` logic in server.ts
2. Simpler, self-contained

**Drawback:** Code duplication

### Recommendation: Option A
Extract to `packages/cyclist/src/port-utils.ts` or add to existing `server.ts` exports.

## Files to Modify

| File | Change |
|------|--------|
| `packages/cyclist/src/main.ts` | Extract `findAvailablePort()` to import |
| `packages/cyclist/src/server.ts` | Add port detection to standalone mode, call `writePortFile()` |
| `.gitignore` | Add `package-lock.json` (housekeeping) |

## Acceptance Criteria
- [ ] AC1: Startup logs show actual port used
- [ ] AC2: `.cyclist-port` file written to project dir
- [ ] AC3: Message shows correct localhost URL

## Testing Strategy

### Manual Testing
1. Start Cyclist normally - verify port 1898, file written
2. Start second instance - verify fallback port, different file content
3. Stop instances - verify cleanup

### Automated Testing (optional for 1pt)
- Could add unit test for `findAvailablePort()` if extracted

## Dependencies & Risks
- **Low risk:** Electron mode already proven
- **No breaking changes:** Same behavior when port 1898 available
- **Housekeeping:** `.gitignore` change is safe

## Bonus Task
Add `package-lock.json` to `.gitignore` - project uses pnpm, npm lockfile is accidental.
