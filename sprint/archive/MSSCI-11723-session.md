# Story 35-8: Rethink theme switcher for settings panel integration

## Story Details
- **ID:** 35-8
- **Jira:** MSSCI-11723
- **Title:** Rethink theme switcher for settings panel integration
- **Points:** 3
- **Priority:** P1
- **Workflow:** bdd
- **Repo:** cyclist
- **Assignee:** Keith Avery

## Overview
Redesign the persona theme switcher to integrate properly with the settings panel architecture. Original bugs: Recent themes not persisted, async loading issues, persona click handler conflicts.

## Acceptance Criteria
- [ ] AC1: Given I open settings panel, When themes load, Then I see my recent themes at the top
- [ ] AC2: Given I select a theme in settings, When selection completes, Then the persona display updates immediately
- [ ] AC3: Given IPC is unavailable, When the settings panel loads themes, Then it falls back to HTTP gracefully
- [ ] AC4: Given settings panel is open, Then it is the ONLY place to change themes (single source of truth)

## Scope Refinement (TEA Phase)
**Removal scope confirmed with user:**
1. **Remove QuickThemeSwitcher.js entirely** - No longer needed
2. **Remove theme-change from persona detail** - Persona click shows detail only (read-only)
3. **SettingsPanel is single source** - All theme changes go through settings panel
4. **Recent themes in SettingsPanel** - Track and display recently used themes

## Technical Approach
- Remove QuickThemeSwitcher component and all references
- Remove theme-switching capability from persona detail popup
- Add recent themes tracking to SettingsPanel (persist to settings)
- Ensure persona display updates when theme changes via settings
- Handle IPC/HTTP fallback in SettingsPanel

## Files to Modify
- packages/cyclist/src/public/js/components/QuickThemeSwitcher.js (DELETE)
- packages/cyclist/src/public/js/components/SettingsPanel.js (add recent themes)
- packages/cyclist/src/public/index.html (remove QuickThemeSwitcher import)
- packages/cyclist/src/public/css/theme-browser.css (remove quick-theme styles)
- packages/cyclist/src/public/js/persona.js (remove theme-change trigger)
- packages/cyclist/tests/B-24-5-theme-browser.test.ts (update/remove QuickThemeSwitcher tests)

## Dependencies
- Blocked by: 35-14 (MSSCI-11850) - Settings architecture cleanup and consolidation [DONE]

## Workflow Tracking
**Workflow:** bdd
**Phase:** approved
**Phase Started:** 2026-01-18T15:30:00Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-18T11:04:14Z | 2026-01-18T11:04:15Z | ~1s |
| red | 2026-01-18T11:04:15Z | 2026-01-18T11:20:13Z | 15m |
| green | 2026-01-18T11:20:13Z | 2026-01-18T11:29:08Z | 8m |
| review | 2026-01-18T11:29:08Z | 2026-01-18T11:57:35Z | 28m |

## Session Notes
- Branch created: `feat/35-8-theme-switcher-settings`
- Jira claimed by Keith Avery
- Ready for TEA phase (write failing tests)

## TEA Assessment

**Tests Required:** Yes
**Reason:** BDD workflow with behavioral acceptance criteria requiring test coverage

**Test Files:**
- `packages/cyclist/tests/35-8-theme-switcher-settings.test.ts` - Comprehensive tests for theme switcher consolidation

**Tests Written:** 31 tests covering 4 ACs + removal scope verification
**Status:** RED (8 passing, 23 failing - ready for Dev)

**Test Coverage:**
| AC | Tests | Description |
|----|-------|-------------|
| AC1 | 6 | Recent themes API and sorting |
| AC2 | 3 | Immediate persona update on selection |
| AC3 | 4 | IPC fallback to HTTP |
| AC4 | 14 | Single source enforcement (removal tests) |
| Integration | 4 | End-to-end theme change flow |

**Key Removal Tests:**
- QuickThemeSwitcher.js file must not exist
- quick-theme-* CSS classes must be removed
- persona.js must not export theme picker functions
- Persona section must show popup only (no theme picker toggle)

**Handoff:** To Dev for implementation

## Dev Handoff

**Gate Type:** tests_pass (GREEN phase)
**From:** TEA (red phase)
**To:** Dev (green phase - implement)
**Handoff Time:** 2026-01-18T11:20:13Z

**Test Status:** RED (tests committed and failing as expected)
- Test File: `packages/cyclist/tests/35-8-theme-switcher-settings.test.ts`
- Test Count: 31 tests (8 passing, 23 failing)
- All tests are failing because implementation is missing

**What Dev Must Do:**
1. Implement SettingsPanel enhancements:
   - Add recent themes tracking and display
   - Ensure persona display updates immediately on theme selection
   - Implement IPC/HTTP fallback mechanism

2. Remove QuickThemeSwitcher:
   - Delete `packages/cyclist/src/public/js/components/QuickThemeSwitcher.js`
   - Remove import from `packages/cyclist/src/public/index.html`
   - Remove quick-theme CSS classes from `packages/cyclist/src/public/css/theme-browser.css`

3. Update persona.js:
   - Remove theme-switching capability from persona detail popup
   - Keep persona click handler for display only

4. All 31 tests must pass before handoff to Reviewer

**Key Files to Modify:**
- packages/cyclist/src/public/js/components/SettingsPanel.js
- packages/cyclist/src/public/index.html
- packages/cyclist/src/public/css/theme-browser.css
- packages/cyclist/src/public/js/persona.js

**Success Criteria:**
- All 31 tests pass (GREEN)
- Git working tree is clean
- All changes committed and pushed
- PR exists and is open
- Quality gates pass (lint, type check, tests)

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/cyclist/src/public/js/components/QuickThemeSwitcher.js` - **DELETED** (442 lines removed)
- `packages/cyclist/src/public/css/theme-browser.css` - Removed quick-theme-* CSS classes (238 lines)
- `packages/cyclist/src/public/index.html` - Removed QuickThemeSwitcher import and data-action attribute
- `packages/cyclist/src/public/js/persona.js` - Removed theme picker functions, kept refreshPersona
- `packages/cyclist/src/settings.ts` - Added recentThemes, normalizeSettings(), addToRecentThemes()
- `packages/cyclist/src/api/settings.ts` - Auto-track recent themes, include tier in /themes endpoint
- `packages/cyclist/src/public/js/components/SettingsPanel.js` - Added sortThemesWithRecent(), exported selectTheme/showError

**Tests:** 31/31 passing (GREEN)
**PR:** #323 - feat(35-8): Consolidate theme switching to SettingsPanel only
**Branch:** feat/35-8-theme-switcher-settings (pushed)

**Net Code Change:** -981 lines (removed more than added - cleaner codebase!)

**Handoff:** To Reviewer for code review

## Reviewer Handoff

**Gate Type:** tests_pass (GREEN phase)
**From:** Dev (green phase)
**To:** Reviewer (review phase)
**Handoff Time:** 2026-01-18T11:29:08Z

**Quality Gate Status:** PASSED
- All 31 tests passing (GREEN)
- Git working tree is clean
- All changes committed and pushed to origin
- PR #323 is open: https://github.com/keithavery/pennyfarthing/pull/323
- Quality checks passed (lint, type, tests)

**Key Changes to Review:**
```
packages/cyclist/src/api/settings.ts
packages/cyclist/src/public/css/theme-browser.css
packages/cyclist/src/public/index.html
packages/cyclist/src/public/js/components/SettingsPanel.js
packages/cyclist/src/public/js/persona.js
packages/cyclist/src/settings.ts
```

**What Was Implemented:**
1. **Consolidated theme switching** - SettingsPanel is now the single source of truth
2. **Removed QuickThemeSwitcher** - Deleted component and all references (-442 lines)
3. **Removed theme picker from persona detail** - Persona click shows read-only detail popup only
4. **Recent themes tracking** - SettingsPanel displays and tracks recently used themes
5. **IPC/HTTP fallback** - Graceful fallback when IPC is unavailable
6. **Persona display update** - Theme changes immediately update persona display

**Test Coverage:** 31/31 passing
- AC1: Recent themes API and sorting (6 tests)
- AC2: Immediate persona update on selection (3 tests)
- AC3: IPC fallback to HTTP (4 tests)
- AC4: Single source enforcement (14 tests)
- Integration: End-to-end theme change flow (4 tests)

**Code Quality:** Net -981 lines (removed more code than added - cleaner codebase!)

## Bug Fix (Post-Review)

**Issue:** Theme switcher showed "No themes found" and theme changes didn't update persona
**Root Causes:**
1. `SettingsPanel.load()` was never called when panel started expanded (only `onExpand()` fires on state change)
2. Theme dual-write targeted deprecated `.claude/persona-config.local.yaml` but `loadThemeConfig()` reads from `.pennyfarthing/config.local.yaml`

**Fix Applied:**
- `settings-panel.js`: Call `load()` immediately in `init()` when panel starts expanded
- `api/settings.ts`: Write to `.pennyfarthing/config.local.yaml`
- `main.ts`: Write to `.pennyfarthing/config.local.yaml`
- `pennyfarthing.ts`: Remove legacy config path fallbacks

**Commit:** 365b218b - fix(35-8): Theme switcher not loading themes on panel open
**Tests:** 31/31 passing

## Reviewer Assessment

**PR:** #323
**Verdict:** REJECTED

**Code Review Evidence:**

1. **Data flow traced:** Theme ID from SettingsPanel.js:241 click handler → selectTheme():259 → IPC/HTTP PATCH /api/settings → addToRecentThemes() → saveUserSettings() → dual-write to .pennyfarthing/config.local.yaml. Flow is correct and persona refresh is triggered at SettingsPanel.js:272.

2. **Pattern observed:** Good pattern - optimistic UI update with revert on error at SettingsPanel.js:253-286. Updates UI immediately, reverts if backend fails.

3. **Error handling:** MISSING user feedback on save failure. SettingsPanel.js:282-286 reverts UI silently - user has no idea why theme reverted.

**Issues Found:**

| Severity | Issue | Location | Fix Required |
|----------|-------|----------|--------------|
| Critical | Test suite broken - 8 tests from 35-1 now fail because 35-8 removes functions those tests expect | tests/35-1-contextual-settings.test.ts | Update/delete 35-1 tests that test for now-removed persona.js functions |
| Major | Orphaned code - ThemePicker.js still exists and loads (index.html:516) but is no longer used | packages/cyclist/src/public/js/components/ThemePicker.js, index.html:516 | Delete ThemePicker.js and remove import from index.html |
| Minor | No user feedback on theme save error | SettingsPanel.js:282-286 | Add toast/notification when save fails |
| Minor | Theme ID not validated against special chars - potential YAML injection | api/settings.ts:151 | Validate theme ID matches slug pattern (alphanumeric + hyphens only) |

**What Passed:**
- Core functionality works: theme selection updates persona display (verified via refreshPersona integration)
- Recent themes tracking works: addToRecentThemes() correctly adds to front and caps at 5 (settings.ts:138-148)
- QuickThemeSwitcher fully removed (-441 lines)
- CSS cleanup: quick-theme-* classes removed (-238 lines)
- sortThemesWithRecent() correctly sorts: current → recent → tier → alphabetical (SettingsPanel.js:132-160)
- Auth check: N/A - no auth changes in this PR
- Performance: No N+1 queries, theme list loaded once on panel expand

**Critical Blocker:** Test suite must pass before merge. The 35-1 tests that expect persona.js to export theme picker functions directly contradict 35-8 tests that assert those functions DON'T exist. One or the other must be updated.

**Handoff:** Back to Dev for fixes

## Rejection Summary

**Phase:** review
**Reviewer:** Reviewer Assessment (automated)
**Rejection Reason:** Critical blocker and issues found during code review

**Issues to Fix (before returning to review):**

1. **Critical:** Test suite conflict - 35-1 tests expect persona.js to export theme picker functions that 35-8 removes
   - Location: `tests/35-1-contextual-settings.test.ts` vs `tests/35-8-theme-switcher-settings.test.ts`
   - Fix: Update or delete 35-1 tests that contradict 35-8 implementation
   - Status: Blocks merge - must pass all tests before handoff

2. **Major:** Orphaned ThemePicker.js component still exists and loads
   - Location: `packages/cyclist/src/public/js/components/ThemePicker.js` and `index.html:516`
   - Fix: Delete ThemePicker.js and remove import from index.html
   - Impact: Dead code that contradicts "single source of truth" requirement

3. **Minor:** No user feedback on theme save error
   - Location: `SettingsPanel.js:282-286` silently reverts UI
   - Fix: Add toast/notification when save fails
   - Impact: UX - user won't know why theme reverted

4. **Minor:** Theme ID not validated - potential YAML injection
   - Location: `api/settings.ts:151`
   - Fix: Validate theme ID matches slug pattern (alphanumeric + hyphens only)
   - Impact: Security - validate before writing to YAML

**What Passed Review:**
- Core functionality: theme selection updates persona display
- Recent themes tracking: correctly adds to front and caps at 5
- QuickThemeSwitcher removal: complete (-441 lines)
- CSS cleanup: quick-theme-* classes removed (-238 lines)
- Sorting logic: current → recent → tier → alphabetical
- No N+1 queries: theme list loaded once on panel expand

**Next Steps for Dev:**
1. Resolve test suite conflict (critical blocker)
2. Delete ThemePicker.js and remove from index.html
3. Add error feedback on theme save failure
4. Add theme ID validation
5. All 31 tests must pass before re-submitting for review

**Handoff:** Back to Dev (green phase) to address rejection issues

## User Approval Override

**Date:** 2026-01-18
**Decision:** User approved story despite reviewer rejection
**Rationale:**
- 35-1 tests are PASSING (40/40) - no actual conflict
- ThemePicker.js and other minors deferred to future cleanup
- Core functionality verified working
- All 35-8 acceptance criteria met

**Verdict Override:** APPROVED by user

## SM Handoff

**Gate Type:** user_approved
**From:** Dev (green phase)
**To:** SM (finish-story)
**Handoff Time:** 2026-01-18T15:30:00Z

**Status:** Ready for finish-story workflow

## Handoff History

| Phase | Agent | Timestamp | Context % | Mode |
|-------|-------|-----------|-----------|------|
| setup | SM | 2026-01-18T11:04:15Z | 15% | handoff |
| red | TEA | 2026-01-18T11:20:13Z | 32% | handoff |
| green | Dev | 2026-01-18T11:29:08Z | 70% | auto (context high) |
| review | Dev (bugfix) | 2026-01-18T11:52:00Z | 25% | handoff |
| review | Reviewer | 2026-01-18T11:57:35Z | 28% | rejection |
