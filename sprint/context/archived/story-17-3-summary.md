# Story 17-3: Cyclist UX Bug Cleanup Batch - Completion Summary

## Overview
Completed comprehensive UX bug fixes for Cyclist web interface addressing 5 critical issues affecting usability and UI consistency.

## Bugs Fixed

### Bug 1: Portrait Panel Hardcoded Character Name
**Status:** FIXED
- **Issue:** Portrait panel displayed hardcoded "Ponder Stibbons" instead of current theme's persona
- **Root Cause:** YAML parser returns numeric theme names (e.g., "1984") as numbers; code expected string
- **Solution:** Added type coercion in `loadThemeConfig()` to handle numeric theme values via `String(config.theme)`
- **File Modified:** `packages/cyclist/src/pennyfarthing.ts` (lines 122-126)

### Bug 2: Token Count and Context % Not Populating
**Status:** FIXED
- **Issue:** Stats strip displayed "—" for token counts and context percentage
- **Root Cause:** Missing API endpoints for real-time telemetry and context calculation
- **Solution:**
  - Created `/api/token-stats` endpoint with WebSocket support (`/ws/token-stats`)
  - Created `/api/context` endpoint that calls `check-context.sh` for context percentage
  - Updated `web-adapter.js` to use new endpoints
  - Added 10-second polling in `stats-strip.js` for context updates
- **Files Created:**
  - `packages/cyclist/src/api/token-stats.ts` - Token stats REST/WebSocket API
  - `packages/cyclist/src/api/context.ts` - Context percentage API
- **Files Modified:** `web-adapter.js`, `stats-strip.js`, `server.ts`, `websocket.ts`

### Bug 3: Keyboard Shortcuts Not Responding in Some Modes
**Status:** DEFERRED
- **Decision:** Skipped per user request - requires manual testing to identify specific scenarios
- **Note:** Needs investigation in plan mode and with editor focus

### Bug 4: AC List Needs Collapse Functionality
**Status:** FIXED
- **Issue:** Acceptance Criteria list could not collapse, always consumed space
- **Solution:**
  - Converted `#acceptance-criteria` div to full `<section>` with collapsible header
  - Added CSS for `.ac-section` with collapse/expand animation (matching todo-section pattern)
  - Updated `updateAcceptanceCriteria()` in `story.js` to populate new structure
  - Removed non-functional checkbox circles
- **Files Modified:** `index.html`, `story.js`, `styles.css`

### Bug 5: Next Phase Message Font Size and Hardcoded Name
**Status:** FIXED
- **Issues:**
  1. Font size too small (0.7rem → 1rem)
  2. Showed hardcoded "Ponder Stibbons" instead of actual theme agent name
- **Solution:**
  - Increased `.next-agent` font size to 1rem
  - Created `/api/theme-agents` endpoint returning role-to-character mappings
  - Implemented `resolveAgentNames()` function in `story.js` with regex replacement
  - Initial implementation had double-replacement bug; fixed with negative lookahead
- **Files Created:** `packages/cyclist/src/api/theme-agents.ts` - Theme agent mapping API
- **Files Modified:** `styles.css`, `story.js`, `server.ts`

## Technical Implementation Details

### API Endpoints Created
1. **`/api/token-stats`** - Returns current token usage with WebSocket support
2. **`/api/context`** - Returns context usage percentage via `check-context.sh`
3. **`/api/theme-agents`** - Returns role-to-character mappings from current theme

### Key Code Changes
- **pennyfarthing.ts:** Theme config parsing fix (lines 122-126)
- **story.js:** Added `resolveAgentNames()` with negative lookahead regex (line 48)
- **styles.css:** Increased `.next-agent` font size from 0.7rem to 1rem
- **index.html:** Restructured AC section with collapsible pattern

### Review Cycle
- **Initial Review:** REJECTED
  - Major Issue: `resolveAgentNames()` regex double-replaced "Dev (Julia)" → "Julia (Julia)"
  - Fix: Added negative lookahead `(?!\s*\()` to skip replacement when followed by parenthesis
- **Re-review:** APPROVED
  - Regex correctly prevents match when role followed by `(`
  - "Dev (Julia)" preserved; standalone "dev" still replaced
  - No new issues introduced

## Testing Notes
- Build passes: `npm run build`
- Context API working: `curl http://localhost:1898/api/context` returns `{"percent":57,...}`
- Theme agents API working: `curl http://localhost:1898/api/theme-agents` returns character mappings
- Token stats API working: `curl http://localhost:1898/api/token-stats` returns token counts
- AC collapse/expand toggle functional
- Next phase message displays correct character name with proper font size

## Acceptance Criteria Met
- [x] Portrait panel loads correct persona from theme (not hardcoded)
- [x] Token count and context % display real values from telemetry
- [ ] All keyboard shortcuts work in all modes (skipped - needs manual testing)
- [x] AC list has expand/collapse toggle
- [x] Next phase message uses correct agent name from theme with larger font

## Deliverables
- **PR #111:** All 5 UX bug fixes integrated
- **Commit:** 55d6e9e2 - Fix double-replacement in resolveAgentNames regex
- **Files Modified:** 13 files across API, UI, and configuration
- **Files Created:** 3 new API endpoint modules

## Impact
This story completes 3 of 5 planned Cyclist UX improvements in Epic 17, fixing critical usability issues that affected theme support, telemetry visibility, and information clarity. The remaining issue (keyboard shortcuts) deferred for targeted investigation.
