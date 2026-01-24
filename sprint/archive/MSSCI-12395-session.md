# MSSCI-12395: Refactor turbo mode into independent relay toggle

## Story Details
- **Epic:** epic-62 (Hook Infrastructure Improvements)
- **Points:** 5
- **Priority:** P1
- **Workflow:** TDD

## Problem Statement
Currently 'turbo' mode conflates two behaviors:
1. Auto-accept file edits (gearshift)
2. Auto-handoff between agents (relay)

Agents frequently misinterpret 'turbo' as meaning 'skip all safeguards'
when it really just means 'auto-handoff'.

## Target State
- Gearshift modes (mutually exclusive): plan, manual, accept
- Relay mode (independent toggle): on/off
- Current 'turbo' behavior = accept + relay:on

## Acceptance Criteria
- [ ] Gearshift only has plan/manual/accept modes
- [ ] Relay is independent on/off toggle
- [ ] accept + relay:on = old turbo behavior
- [ ] manual + relay:on works (ask permission but auto-handoff)
- [ ] Existing turbo configs migrate correctly
- [ ] UI shows both controls clearly

## Session Log
- **Started:** 2026-01-24
- **Agent:** SM (Leo McGarry)
- **Phase:** Setup

### Setup Phase
Researching current implementation to understand scope...

**Research Complete.** Key findings:

1. **Type definitions** in `packages/cyclist/src/settings.ts:18-28`
   - `PermissionMode = 'plan' | 'manual' | 'accept' | 'turbo'`

2. **UI controls** in `packages/cyclist/src/public/js/controls.js`
   - 4-segment gearshift with MODE_TO_CLAUDE mapping
   - Keyboard shortcuts Cmd+1/2/3/4

3. **Hook enforcement** in `pennyfarthing-dist/scripts/hooks/question-reflector-check.mjs`
   - **Already checks relay_mode!** (lines 92-100)
   - Anticipates the split we're implementing

4. **Settings API** in `packages/cyclist/src/api/settings.ts`
   - Validates permission_mode against `['plan', 'manual', 'accept', 'turbo']`

5. **Handoff logic** in `packages/core/src/workflow/handoff.ts`
   - Already reads `handoff_mode` separately from permission_mode

## Implementation Plan

### Phase 1: Type System Changes (TDD)
1. Update `PermissionMode` type to remove 'turbo': `'plan' | 'manual' | 'accept'`
2. Add `relay_mode: boolean` to `WorkflowSettings` interface
3. Update validation in settings.ts
4. Add migration logic: `turbo` → `(accept, relay_mode: true)`

### Phase 2: Settings Layer
1. Update `loadProjectSettings()` to read relay_mode
2. Update `saveProjectSettings()` to persist relay_mode
3. Update `validateSettings()` to validate new structure
4. Update API endpoints in `packages/cyclist/src/api/settings.ts`

### Phase 3: UI Changes
1. Remove TURBO button from gearshift control
2. Add separate relay toggle (bicycle relay icon?)
3. Update keyboard shortcuts (remove Cmd+4 for turbo, add for relay)
4. Update status displays to show relay state

### Phase 4: Hook & Handoff Updates
1. Update question-reflector to only check relay_mode (remove turbo check)
2. Update handoff.ts to use relay_mode instead of handoff_mode
3. Ensure backward compatibility with old configs

### Phase 5: Migration & Cleanup
1. Test migration from turbo configs
2. Update documentation
3. Remove deprecated turbo references

## Files to Modify (Priority Order)

| File | Changes |
|------|---------|
| `packages/cyclist/src/settings.ts` | Type, validation, migration |
| `packages/cyclist/src/api/settings.ts` | API validation |
| `packages/cyclist/src/public/js/controls.js` | UI controls |
| `pennyfarthing-dist/scripts/hooks/question-reflector-check.mjs` | Remove turbo check |
| `packages/core/src/workflow/handoff.ts` | Use relay_mode |
| Tests (multiple) | Update expectations |

## Risk Assessment

- **Low risk:** Hook already anticipates relay_mode
- **Medium risk:** UI changes need careful visual design
- **Migration:** Need to handle users with existing turbo configs

---

## SM → TEA Handoff

**Date:** 2026-01-24
**From:** Leo McGarry (SM)
**To:** Sam Seaborn (TEA)

### Context
Story is set up with comprehensive research. The codebase already anticipates `relay_mode` in the question-reflector hook, so this refactoring aligns with existing infrastructure direction.

### What TEA Needs to Do
Write failing tests for the relay toggle refactoring using TDD approach:

1. **Type/Settings tests** (`packages/cyclist/tests/`)
   - PermissionMode type excludes 'turbo'
   - WorkflowSettings includes relay_mode boolean
   - Migration converts turbo → (accept, relay_mode: true)
   - Validation rejects 'turbo' as invalid

2. **API tests** (`packages/cyclist/tests/`)
   - Settings API accepts relay_mode
   - API rejects 'turbo' permission_mode

3. **Hook tests** (`pennyfarthing-dist/scripts/hooks/tests/`)
   - Enforcement skipped when relay_mode: true
   - Enforcement NOT skipped for accept without relay
   - Legacy turbo check removed/deprecated

4. **UI behavior tests** (if applicable)
   - Gearshift has 3 modes only
   - Relay toggle is independent control

### Key Files to Reference
- `packages/cyclist/src/settings.ts` - current types
- `packages/cyclist/tests/MSSCI-12052-gearshift.test.ts` - existing gearshift tests
- `pennyfarthing-dist/scripts/hooks/tests/question-reflector.test.mjs` - hook tests

### Ready for TEA
Session file and branch ready. Go write those failing tests, Sam.

---

## TEA Phase Complete

**Date:** 2026-01-24
**Agent:** Sam Seaborn (TEA)

### Tests Written

Created `packages/cyclist/tests/MSSCI-12395-relay-toggle.test.ts` with 33 tests covering:

#### Type System Tests
- PermissionMode should reject 'turbo'
- WorkflowSettings should include relay_mode boolean
- Default relay_mode should be false

#### Migration Tests
- turbo → accept + relay_mode: true
- Preserve non-turbo modes with relay_mode: false
- handoff_mode: auto → relay_mode: true
- handoff_mode: manual → relay_mode: false
- Explicit relay_mode passes through unchanged

#### Settings Merge Tests
- relay_mode override merges correctly
- turbo in override should be rejected

#### API Tests
- PATCH accepts relay_mode
- PATCH rejects 'turbo'
- GET returns relay_mode

#### UI Tests
- Mode switch has 3 segments (not 4)
- No TURBO segment
- Has separate relay toggle control

#### Backward Compatibility Tests
- isTurboModeEnabled() exists for legacy code
- accept + relay_mode: true = isTurboModeEnabled() returns true
- accept + relay_mode: false = isTurboModeEnabled() returns false

### Test Results (RED Phase)

```
Passing: 15 tests (current behavior)
Failing: 18 tests (new behavior needed)
```

Key failures that define implementation scope:
1. validateSettings() accepts 'turbo' (should reject)
2. getDefaultSettings() doesn't include relay_mode (should be false)
3. migrateSettings() preserves 'turbo' (should convert to accept + relay)
4. UI has 4 segments (should be 3)
5. No relay toggle control exists

### Existing Tests to Note

The hook tests in `question-reflector.test.mjs` already cover relay_mode:
- `shouldSkipEnforcement` with relay_mode: true/false
- Legacy turbo check marked as "legacy"

These tests already pass because the hook implementation anticipated this change.

---

## TEA → Dev Handoff

**Date:** 2026-01-24
**From:** Sam Seaborn (TEA)
**To:** Toby Ziegler (Dev)

### Context
Tests are written and failing appropriately. The implementation is well-scoped. The hook infrastructure already supports relay_mode, so this is primarily a settings/types/UI refactoring.

### What Dev Needs to Implement

1. **settings.ts Changes:**
   - Remove 'turbo' from PermissionMode type: `'plan' | 'manual' | 'accept'`
   - Add `relay_mode?: boolean` to WorkflowSettings interface
   - Update DEFAULT_SETTINGS to include `relay_mode: false`
   - Update validateSettings() to reject 'turbo'
   - Update migrateSettings() to convert turbo → accept + relay_mode: true
   - Update migrateSettings() to handle handoff_mode → relay_mode
   - Update mergeSettings() to handle relay_mode
   - Update isTurboModeEnabled() to check accept + relay_mode: true

2. **api/settings.ts Changes:**
   - Update validation to reject 'turbo'
   - Return relay_mode in GET response

3. **UI Changes (controls.js, index.html):**
   - Remove TURBO segment from mode-switch
   - Add relay toggle control
   - Update keyboard shortcuts (remove Cmd+4)

### Files to Modify

| File | Priority | Changes |
|------|----------|---------|
| `packages/cyclist/src/settings.ts` | P0 | Type, defaults, validation, migration |
| `packages/cyclist/src/api/settings.ts` | P0 | API validation |
| `packages/cyclist/src/public/index.html` | P1 | Remove TURBO, add relay toggle |
| `packages/cyclist/src/public/js/controls.js` | P1 | Mode mapping, shortcuts |
| `packages/cyclist/src/public/css/styles.css` | P2 | Relay toggle styling |

### Run Tests With

```bash
cd packages/cyclist && npm test -- tests/MSSCI-12395-relay-toggle.test.ts
```

### Ready for Dev
18 failing tests define the implementation. Make them pass, Toby.

---

## Dev Phase Complete

**Date:** 2026-01-24
**Agent:** Toby Ziegler (Dev)

### Implementation Summary

#### settings.ts Changes
- Removed 'turbo' from `PermissionMode` type: `'plan' | 'manual' | 'accept'`
- Added `relay_mode?: boolean` to `WorkflowSettings` interface
- Updated `DEFAULT_SETTINGS` to include `relay_mode: false`
- Updated `validateSettings()` to reject 'turbo' and validate relay_mode
- Updated `migrateSettings()` to convert:
  - `turbo` → `accept + relay_mode: true`
  - `handoff_mode: 'auto'` → `relay_mode: true`
  - `handoff_mode: 'manual'` → `relay_mode: false`
- Updated `mergeSettings()` to handle relay_mode
- Updated `isTurboModeEnabled()` to check `accept + relay_mode: true`

#### api/settings.ts Changes
- Updated validation to reject 'turbo' permission_mode
- Added validation for relay_mode boolean
- Updated SettingsResponse to include relay_mode

#### UI Changes (index.html, controls.js, styles.css)
- Removed TURBO segment from 3-way gearshift control
- Added independent RELAY toggle button with 🔄 icon
- Updated keyboard shortcuts: Cmd+1/2/3 for gearshift, Cmd+4 for relay toggle
- Added relay toggle CSS with purple/magenta active state

#### Test Updates
- Updated MSSCI-12052-gearshift.test.ts for 3-segment control
- Updated 35-1-contextual-settings.test.ts for relay toggle
- Updated MSSCI-11840-auto-context-clear.test.ts for new isTurboModeEnabled behavior

### Test Results

```
Test Files: 98 passed, 2 failed (pre-existing issues)
Tests: 2989 passed, 6 failed (pre-existing issues)
```

The 2 failing test files are pre-existing issues unrelated to this story:
- MSSCI-12275-bell-mode.test.ts - bell toggle location tests
- 36-6-timeline-visualization.test.ts - jsdom/ESM module issue

### Files Modified

| File | Changes |
|------|---------|
| `packages/cyclist/src/settings.ts` | Type, defaults, validation, migration |
| `packages/cyclist/src/api/settings.ts` | API validation, response type |
| `packages/cyclist/src/public/index.html` | 3-segment gearshift + relay toggle |
| `packages/cyclist/src/public/js/controls.js` | Mode handling, relay toggle |
| `packages/cyclist/src/public/styles.css` | Relay toggle styling |
| `packages/cyclist/tests/MSSCI-12395-relay-toggle.test.ts` | New test file (33 tests) |
| `packages/cyclist/tests/MSSCI-12052-gearshift.test.ts` | Updated for 3-segment |
| `packages/cyclist/tests/35-1-contextual-settings.test.ts` | Updated for relay |
| `packages/cyclist/tests/MSSCI-11840-auto-context-clear.test.ts` | Updated for relay |

### Build Status
TypeScript compilation successful.

---

## Dev → Reviewer Handoff

**Date:** 2026-01-24
**From:** Toby Ziegler (Dev)
**To:** Josh Lyman (Reviewer)

### Summary
Refactored 'turbo' mode into separate gearshift (plan/manual/accept) and relay (on/off) controls. All acceptance criteria implemented and tested.

### Key Implementation Decisions

1. **Migration strategy:** Old turbo configs automatically become `accept + relay_mode: true`
2. **Backward compatibility:** `isTurboModeEnabled()` still works for legacy code
3. **UI design:** Relay toggle follows same pattern as bell toggle (button with icon)
4. **Keyboard shortcuts:** Cmd+4 repurposed for relay toggle

### Acceptance Criteria Status

- [x] Gearshift only has plan/manual/accept modes
- [x] Relay is independent on/off toggle
- [x] accept + relay:on = old turbo behavior
- [x] manual + relay:on works (ask permission but auto-handoff)
- [x] Existing turbo configs migrate correctly
- [x] UI shows both controls clearly

### Review Focus Areas

1. **Migration logic** in `migrateSettings()` - handles multiple legacy formats
2. **Type safety** - PermissionMode no longer includes 'turbo'
3. **UI consistency** - relay toggle matches bell toggle styling pattern
4. **Backward compat** - `isTurboModeEnabled()` function preserved for legacy consumers

### Test Command

```bash
cd packages/cyclist && npm test -- tests/MSSCI-12395-relay-toggle.test.ts
```

### Ready for Review
Implementation complete. Go find the holes, Josh.

---

## Reviewer Phase Complete

**Date:** 2026-01-24
**Agent:** Josh Lyman (Reviewer)

### Issues Found and Fixed

#### 1. Migration Bug (Critical)
**Problem:** Users with `{permission_mode: 'manual', handoff_mode: 'auto'}` would lose their auto-handoff setting. The `else if` chain meant `handoff_mode` migration only ran if no valid `permission_mode` was present.

**Fix:** Restructured `migrateSettings()` to check `handoff_mode` INDEPENDENTLY of `permission_mode` handling. Now `manual + relay` works correctly (AC4).

**Tests Added:**
- `should migrate combined permission_mode + handoff_mode: auto`
- `should migrate combined permission_mode + handoff_mode: manual`

#### 2. Accessibility Inconsistency (Minor)
**Problem:** Relay toggle used `aria-checked` while bell toggle uses `aria-pressed`. For toggle buttons, `aria-pressed` is the correct semantic attribute.

**Fix:** Changed relay toggle to use `aria-pressed` for consistency with bell toggle.

### Acceptance Criteria Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Gearshift only has plan/manual/accept modes | ✓ | `PermissionMode` type, HTML, validation |
| Relay is independent on/off toggle | ✓ | Separate `relay_mode` field, independent UI |
| accept + relay:on = old turbo behavior | ✓ | `isTurboModeEnabled()` logic, migration |
| manual + relay:on works | ✓ | Fixed migration bug, added tests |
| Existing turbo configs migrate correctly | ✓ | `migrateSettings()` handles all legacy formats |
| UI shows both controls clearly | ✓ | 3-segment + relay toggle with distinct styling |

### Test Results After Review

```
Test Files: 98 passed, 2 failed (pre-existing)
Tests: 2991 passed, 6 failed (pre-existing)
New tests: +2 (migration edge cases)
```

### Files Modified During Review

| File | Changes |
|------|---------|
| `packages/cyclist/src/settings.ts` | Fixed migration logic |
| `packages/cyclist/src/public/index.html` | aria-checked → aria-pressed |
| `packages/cyclist/src/public/js/controls.js` | aria-checked → aria-pressed |
| `packages/cyclist/tests/MSSCI-12395-relay-toggle.test.ts` | Added 2 migration tests, fixed aria test |

### Verdict: APPROVED

Implementation is solid. The migration bug I found was a real issue that would have broken backward compatibility for users with combined settings. Now fixed with tests.

Ready for Leo to finish the story.

---

## Reviewer → SM Handoff

**Date:** 2026-01-24
**From:** Josh Lyman (Reviewer)
**To:** Leo McGarry (SM)

### Verdict: APPROVED

Story is ready for completion. All acceptance criteria verified, critical migration bug found and fixed during review.
