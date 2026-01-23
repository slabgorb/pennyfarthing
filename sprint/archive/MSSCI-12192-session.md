# Story 57-2: Portrait Loading with Caching

## Story Details
- **ID:** 57-2
- **Jira:** MSSCI-12192
- **Epic:** 57 - Agent Identity & Emotional Connection
- **Branch:** feat/57-2-portrait-caching
- **Started:** 2026-01-23
- **Points:** 3
- **Workflow:** tdd

## Status
Review complete. APPROVED. Ready for SM to finish.

## Current Phase
**PHASE: finish**

## Acceptance Criteria
- [x] AC1: Cache bundled portraits to VS Code globalStorage for faster subsequent loads
- [x] AC2: Return cached portrait path if cache hit, bundled path if cache miss
- [x] AC3: Support all 102+ themes with proper cache isolation per theme
- [x] AC4: Provide cache invalidation/clear capability

## Technical Context
See `.session/context-story-57-2.md` for full technical approach.

## Files to Create/Modify
- `packages/vscode-extension/src/services/portrait-cache.ts` (NEW)
- `packages/vscode-extension/src/providers/agent-portrait-webview.ts` (MODIFY)

## TEA Assessment

**Tests Required:** Yes
**Test Files:** `packages/vscode-extension/tests/MSSCI-12192-portrait-caching.test.ts`
**Test Count:** 46 tests (45 failing, 1 passing)
**Status:** RED

**Test Coverage by AC:**
- AC1 (Cache to globalStorage): 8 tests
- AC2 (Cache hit/miss): 10 tests
- AC3 (Theme isolation): 8 tests
- AC4 (Cache invalidation): 9 tests
- Integration tests: 6 tests
- Error handling: 5 tests

**Scope Change:** CDN loading removed from scope per user request. Story now focuses on local caching of bundled portraits to VS Code globalStorage.

**Files to Create:**
- `packages/vscode-extension/src/services/portrait-cache.ts` (NEW - PortraitCacheService class)

**Files to Modify:**
- `packages/vscode-extension/src/providers/agent-portrait-webview.ts` (add setPortraitCacheService, getPortraitCacheService, loadPortraitAsync methods)

## Dev Assessment

**Implementation Complete:** Yes
**PR:** #453
**Tests Status:** GREEN - 46/46 new tests, 662/662 total

**Changes Made:**
- `packages/vscode-extension/src/services/portrait-cache.ts` (NEW - 240 lines)
  - `PortraitCacheService` class with globalStorage caching
  - `getPortrait()` - async method returning cached or bundled path
  - `isCached()` - check if portrait is cached
  - `clearCache()` / `clearThemeCache()` / `invalidatePortrait()` - cache management
  - `getCacheStats()` - cache statistics
  - `validateTheme()` / `validateAgent()` - path traversal protection
- `packages/vscode-extension/src/providers/agent-portrait-webview.ts` (+38 lines)
  - `setPortraitCacheService()` - inject cache service
  - `getPortraitCacheService()` - retrieve cache service
  - `loadPortraitAsync()` - async portrait loading with cache

**Build Output:** 266.4kb bundle (up from 265.3kb)

## Reviewer Assessment

**PR:** #453
**Verdict:** APPROVED

**Code Review Evidence:**
- **Path traversal protection:** `validateTheme()` at :248-255 checks `..`, `/`, leading `/`; `validateAgent()` at :260-264 checks `..`, `/`. Both called before path construction.
- **Data flow traced:** User input → validation (throws on bad) → `path.join()` with clean values → `fs.readFileSync()`/`vscode.workspace.fs.writeFile()` - no injection vectors
- **Error handling:** Cache miss falls back to bundled (:117-121), write failure falls back with log (:147-150), read failure returns `{path: null, source: 'none'}` (:154-156)
- **Integration pattern:** Type-only imports, optional cache service with backwards-compatible fallback

**Security:** Path traversal mitigated via input validation before any path operations. All file I/O uses validated inputs.
**Performance:** Sync `fs.readFileSync` for bundled read is acceptable - files are small PNGs, already in extension bundle.

**Non-Blocking Observations:**
- [LOW] `console.log` in private `log()` method at :265 - debugging aid, appropriately scoped

**Tests:** 46/46 passing for MSSCI-12192, 662/662 total VS Code extension tests GREEN

**Handoff:** To SM for finish-story workflow

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-23T10:02:00Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-23 | 2026-01-23 | 0m |
| test | 2026-01-23 | 2026-01-23 | 5m |
| red | 2026-01-23 | 2026-01-23T09:53:25Z | 9h 53m |
| green | 2026-01-23T09:53:25Z | 2026-01-23T09:56:00Z | 3m |
| review | 2026-01-23T09:56:00Z | 2026-01-23T10:02:00Z | 6m |

### Handoff History
| From | To | Gate | Status | Timestamp |
|------|-----|------|--------|-----------|
| test (TEA) | red (Dev) | tests_written | PASSED | 2026-01-23 |
| red (TEA) | green (Dev) | tests_fail | PASSED | 2026-01-23T09:53:25Z |
| green (Dev) | review (Reviewer) | tests_pass | PASSED | 2026-01-23T09:56:00Z |
| review (Reviewer) | finish (SM) | approval | PASSED | 2026-01-23T10:02:00Z |
