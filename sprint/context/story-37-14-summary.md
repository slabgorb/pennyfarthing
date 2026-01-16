# Story 37-14: Fix handoff buttons showing wrong theme characters - Summary

## What Was Done

Fixed a timing race where handoff buttons displayed fallback role names (e.g., "Scrum Master") instead of themed character names (e.g., "The Mad Hatter") when the theme cache wasn't loaded before quick actions rendered.

## Root Cause

The `getAgentDisplayName()` function in quick-actions.js relied on a theme cache from story.js, but:
1. The cache was loaded asynchronously during init
2. Quick actions could render before the cache was populated
3. No mechanism existed to refresh buttons when cache became available
4. No mechanism existed to refresh cache when theme changed

## Implementation

**story.js changes:**
- Exported `loadThemeAgents()` (was private)
- Added `clearThemeAgentsCache()` function
- Added return value to `loadThemeAgents()` for promise chaining
- Added `themechange` event listener to refresh cache when persona theme changes

**quick-actions.js changes:**
- Import `loadThemeAgents` in addition to `getThemeAgents`
- Move `FRIENDLY_ROLE_NAMES` to module-level constant
- In `getAgentDisplayName()`: if cache is null, trigger fire-and-forget load for next render

## Files Modified

| File | Change |
|------|--------|
| `packages/cyclist/src/public/js/story.js` | Export cache functions, add themechange listener |
| `packages/cyclist/src/public/js/components/message-view/quick-actions.js` | Fire-and-forget fallback load |

## Test Impact

- All 2502 tests continue to pass
- No new tests added (behavior change is timing-related, hard to unit test)

## Lessons

1. Async cache patterns need fallback loading when cache miss occurs
2. Theme changes need to propagate to all components using theme data
3. Fire-and-forget pattern is appropriate when first render can use fallback
