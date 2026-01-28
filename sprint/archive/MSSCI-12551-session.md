# Story MSSCI-12551: BikeLane: Fix workflow display - remove from story, show in bikelane

## Story Details
- **ID:** MSSCI-12551
- **Jira:** MSSCI-12551
- **Epic:** MSSCI-12465 (Cyclist UX Polish)
- **Points:** 3
- **Workflow:** tdd

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-28T07:00:15Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-28T06:50:00Z | 2026-01-28T06:53:00Z | 3m |
| red | 2026-01-28T06:53:00Z | 2026-01-28T06:53:13Z | 13s |
| green | 2026-01-28T06:53:13Z | 2026-01-28T06:53:30Z | 17s |
| review | 2026-01-28T06:53:30Z | 2026-01-28T07:00:15Z | 6m 45s |
| finish | 2026-01-28T07:00:15Z | - | - |

---
## Handoff History

| From | To | Gate | Status | Timestamp |
|------|-----|------|--------|-----------|
| setup (sm) | red (tea) | session_exists | PASSED | 2026-01-28T06:53:00Z |
| red (tea) | green (dev) | tests_red | PASSED | 2026-01-28T06:53:13Z |
| green (dev) | review (reviewer) | tests_green | PASSED | 2026-01-28T06:53:30Z |
| review (reviewer) | finish (sm) | review_approved | PASSED | 2026-01-28T07:00:15Z |

---
## Problem Statement

Workflow steps are displaying in the **story panel** instead of the **bikelane panel**, AND the bikelane panel is not displaying workflow data at all.

### Root Causes (from investigation)

1. **story.js** has `updateWorkflowProgress()` function (lines 130-176) that renders workflow steps to `#workflow-progress`
2. `#workflow-progress` element is located inside `#story-section` in index.html (lines 261-264)
3. **bikelane.js** has correct rendering logic but section stays hidden or data doesn't arrive properly

### Data Flow (Current - Broken)
```
sidebar/index.js onmessage (line 68-77)
    ├── story.update(data)           ← Gets full story object with workflow
    │   └── updateWorkflowProgress() ← WRONG: Renders to #workflow-progress in story section
    └── bikelane.update(data.workflow) ← Correct call but section not visible
```

### Data Flow (Expected - Fixed)
```
sidebar/index.js onmessage
    ├── story.update(data)           ← Only story info, NO workflow rendering
    └── bikelane.update(data.workflow) ← Renders workflow, section becomes visible
```

---
## Technical Approach

### Files to Modify

1. **packages/cyclist/src/public/js/sidebar/story.js**
   - Remove `updateWorkflowProgress()` function (lines 130-176)
   - Remove call to `updateWorkflowProgress(story.workflow)` (line 245)

2. **packages/cyclist/src/public/index.html**
   - Remove `#workflow-progress` element from story section (lines 261-264)

3. **packages/cyclist/src/public/js/sidebar/bikelane.js**
   - Ensure `update()` function shows section when workflow data exists
   - Verify rendering to `.phase-progress` and `.phase-history-list` works

4. **packages/cyclist/src/public/js/sidebar/index.js** (verify only)
   - Confirm `bikelane.update(data.workflow)` is called correctly

---
## Acceptance Criteria

- [x] AC1: Workflow steps render ONLY in bikelane panel (not story panel)
- [x] AC2: Bikelane section VISIBLE when workflow is active
- [x] AC3: Shows workflow type badge (TDD, trivial, etc)
- [x] AC4: Shows phase progress with current phase highlighted
- [x] AC5: Shows phase history timeline

---
## Branch
**Feature Branch:** feat/MSSCI-12551-bikelane-workflow-display
**Repos:** pennyfarthing

---
## TEA Assessment

**Tests Required:** Yes
**Reason:** UI behavior change requires verification that workflow renders in correct panel

**Test Files:**
- `packages/cyclist/tests/MSSCI-12551-bikelane-workflow-display.test.ts` - Tests for all 5 ACs

**Tests Written:** 29 tests covering 5 ACs
- AC1: 4 tests - Workflow NOT in story panel
- AC2: 4 tests - Bikelane section visibility
- AC3: 5 tests - Workflow type badge display
- AC4: 8 tests - Phase progress with highlighting
- AC5: 7 tests - Phase history timeline
- Integration: 1 test - No duplicate rendering

**Status:** RED (4 tests failing - ready for Dev)

**Failing Tests:**
1. `should NOT have #workflow-progress element in story section`
2. `should NOT render workflow steps when story.update() is called`
3. `should NOT render workflow arrows in story section`
4. `should not duplicate workflow rendering`

**Handoff:** To Dev (Inigo Montoya) for implementation

---
## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/cyclist/src/public/index.html` - Removed #workflow-progress element from story section
- `packages/cyclist/src/public/js/sidebar/story.js` - Removed updateWorkflowProgress() function and its call

**Tests:** 29/29 passing (GREEN)
**PR:** #531 - fix(cyclist): remove workflow display from story panel (MSSCI-12551)
**Branch:** feat/MSSCI-12551-bikelane-workflow-display (pushed)

**Handoff:** To Reviewer (Westley) for code review

---
## Reviewer Assessment

**Verdict:** APPROVED

**Data flow traced:** WebSocket message → `sidebar/index.js:73-75` → `story.update(data)` (no workflow) + `bikelane.update(data.workflow)` (workflow only). Correctly separated.

**Pattern observed:** Clean removal pattern - function + call + HTML element all removed together at `story.js:130-176`, `story.js:245`, `index.html:261-264`

**Error handling:** `bikelane.js:124-128` correctly handles null/undefined workflow by hiding section

**Observations:**
1. [VERIFIED] Data flow correct - workflow now only rendered in bikelane
2. [VERIFIED] HTML cleanup complete - #workflow-progress removed from story section
3. [VERIFIED] Null handling - bikelane.js handles missing workflow correctly
4. [VERIFIED] Tests comprehensive - 29/29 tests passing, all 5 ACs covered
5. [LOW] Dead code: getDefaultLabel() at story.js:77-85 now unused (minor, doesn't block)

**Security:** No concerns - UI refactoring only
**Tests:** 29/29 passing (verified independently)

**Handoff:** To SM (Vizzini) for finish-story
