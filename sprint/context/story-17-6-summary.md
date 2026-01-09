# Story 17-6: BUG: Context meter not wired to Electron polling

## Summary

The context meter in Cyclist's stats strip now displays actual context usage percentages instead of "—%". The implementation wired the existing `getContextUsage()` function to the Electron IPC layer with proper polling and push-based updates.

## Technical Changes

1. **main.ts**: Added `context:get` IPC handler, context state management, and `startContextPolling()` with 15-second interval
2. **preload.ts**: Exposed `context.get()` method in ElectronContextAPI
3. **stats-strip.js**: Switched from client-side polling to server push subscription via `context.onUpdate()`

## Key Decisions

- **Polling interval**: 15 seconds (balances responsiveness vs. overhead)
- **Push-based updates**: Main process broadcasts changes, renderer subscribes
- **Change detection**: Only broadcasts when values differ (reduces event volume)

## Test Results

- 38/38 B-22 stats-strip tests: PASS
- 28/28 B-2.1 IPC wiring tests: PASS
- No new test failures introduced

## Review Summary

- **Reviewed by**: The Queen of Hearts
- **Verdict**: APPROVED
- **Findings**: 0 Critical, 0 Major, 0 Minor
- **All 6 acceptance criteria met**

## Acceptance Criteria

1. ✅ `context:get` IPC handler registered (main.ts:676-679)
2. ✅ `context.get()` method exposed (preload.ts:216)
3. ✅ 15-second polling interval (main.ts:489)
4. ✅ `context:update` broadcast on change (main.ts:481)
5. ✅ Stats strip displays actual percentage
6. ✅ Real-time updates via subscription

## Architecture

Follows established tokenStats/toolStats patterns exactly. Security verified - proper input validation, no XSS vectors. Graceful error handling - errors returned in ContextInfo.error field.

## PR Details

- **PR #120**: fix(cyclist): wire context meter IPC to Electron polling
- **Branch**: fix/17-6-context-meter-polling
- **Merge Commit**: fed22ed3
- **Base**: develop
