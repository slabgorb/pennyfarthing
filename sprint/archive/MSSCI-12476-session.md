# Story MSSCI-12476: BikeLane section: Show workflow status when active

## Story Details
- **ID:** MSSCI-12476
- **Jira:** MSSCI-12476
- **Title:** BikeLane section: Show workflow status when active
- **Points:** 3
- **Priority:** P2
- **Epic:** epic-64 (MSSCI-12465 - Cyclist UX Polish)
- **Workflow:** tdd

## Description
BikeLane section exists but is hidden. Make it visible when a workflow is active.

## Acceptance Criteria
- Section visible when workflow active
- Shows workflow name and type badge
- Shows current step/phase
- Progress visualization
- Phase history timeline

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-27T22:57:15Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-27T18:00:00Z | 2026-01-27T22:49:14Z | 4h 49m |
| red | 2026-01-27T22:49:14Z | 2026-01-27T22:54:29Z | 5m |
| review | 2026-01-27T22:54:29Z | 2026-01-27T22:57:15Z | 2m |

## Technical Approach

### Context
The BikeLane section in Cyclist's sidebar currently exists as a hidden/collapsed component but needs to be made visible and functional when a workflow is active. This requires:

1. **State Detection**: Detect when a workflow is active via session file or WheelHub channel
2. **Workflow Display**: Show the active workflow name and type badge (phased/stepped)
3. **Phase Tracking**: Display current step/phase in the workflow execution
4. **Progress Visualization**: Implement a visual progress indicator across workflow phases
5. **Timeline**: Show phase history with completion timestamps and durations

### Implementation Areas
- **Cyclist Frontend** (`packages/cyclist/src/public/js/`): BikeLane section component visibility and state management
- **WheelHub Integration** (`packages/cyclist/src/server.ts`): Broadcast workflow state changes via WebSocket channels
- **Session File** (`.session/{story-id}-session.md`): Track workflow phase state and history
- **Type System** (`packages/core/src/types/`): Workflow state and phase interfaces

### Acceptance Criteria Mapping

| Criterion | Implementation | Component |
|-----------|----------------|-----------|
| Section visible when workflow active | Toggle display based on active workflow state | BikeLane component + state detection |
| Shows workflow name and type badge | Render from workflow definition + session state | BikeLane header display |
| Shows current step/phase | Read from session "Workflow Tracking" section | Phase indicator component |
| Progress visualization | Implement phase progress bar/indicator | Progress component |
| Phase history timeline | Render phase history table from session | Timeline component |

### Testing Strategy (TDD)
1. **RED**: Write tests for BikeLane component visibility, workflow state detection, and rendering
2. **GREEN**: Implement minimal functionality to pass tests
3. **REFACTOR**: Optimize state management and component structure

## Branch Information
- **Branch:** feat/MSSCI-12476-bikelane-workflow-status
- **Repos:** pennyfarthing

## TEA Assessment

**Tests Required:** No (already implemented)
**Reason:** Feature was fully implemented in B-12451, then sidebar was refactored (7f84ce5d6). Tests existed but had broken import paths.

**Test Files:**
- `packages/cyclist/tests/B-12451-bikelane-section.test.ts` - 78 tests covering all 5 ACs

**Test Fix Applied:**
- Updated imports from `../src/public/js/bikelane-section.js` to `../src/public/js/sidebar/bikelane.js`
- Updated dynamic imports to match new module location
- Updated HTML verification to check for `sidebar/index.js` instead of `bikelane-section.js`

**Status:** GREEN (all 78 tests passing)

**Implementation Files Already Exist:**
- `packages/cyclist/src/public/js/sidebar/bikelane.js` - Main module with `update()`, `renderPhaseProgress()`, etc.
- `packages/cyclist/src/public/js/sidebar/index.js` - Coordinator that imports and initializes bikelane
- `packages/cyclist/src/public/index.html` - HTML structure for `#bikelane-section`

**All Acceptance Criteria Already Met:**
1. ✅ Section visible when workflow active - `update()` toggles `hidden` class
2. ✅ Shows workflow name and type badge - `formatWorkflowType()`
3. ✅ Shows current step/phase - `renderPhaseProgress()` with status classes
4. ✅ Progress visualization - Phase icons with done/current/pending states
5. ✅ Phase history timeline - `renderPhaseHistory()` with durations

**Recommendation:** This story appears to be a duplicate of B-12451 or was created before the sidebar refactor was merged. Consider closing as "Already Done" rather than continuing through the TDD cycle.

**Handoff:** To Reviewer to verify feature works and close story

## Handoff History

| From | To | Gate | Status | Timestamp |
|------|-----|------|--------|-----------|
| red (tea) | review (reviewer) | tests_pass | PASSED | 2026-01-27T22:54:29Z |
| review (reviewer) | finish (sm) | approval | PASSED | 2026-01-27T22:57:15Z |

## Reviewer Assessment

**Verdict:** APPROVED

**Review Checklist:**
- [x] Find at least 5 observations (6 verified)
- [x] Trace data flow end-to-end
- [x] Check UI→backend wiring
- [x] Identify patterns
- [x] Verify error handling
- [x] Security analysis
- [x] Hard questions

**Observations:**
1. `[VERIFIED]` Import path updates correct - 8 paths changed from `bikelane-section.js` to `sidebar/bikelane.js`
2. `[VERIFIED]` Data flow traced: WebSocket → `sidebar/index.js:75` → `bikelane.update(data.workflow)` → visibility toggle
3. `[VERIFIED]` Component wiring complete - imported, initialized, and updated on all event sources
4. `[VERIFIED]` HTML structure exists at `index.html:301` with all required elements
5. `[VERIFIED]` CSS styling complete at `styles.css:2738-2938`
6. `[LOW]` 55 TODOs in test file - intentional AC markers, not code debt

**Preflight Results:**
- Tests: 78 passed, 0 failed
- Build: All packages successful
- Code smells: 0 blocking issues

**Data Flow Traced:**
- Session file `**Workflow:**` field → `story-parser.ts:parseWorkflowProgress()` → WebSocket broadcast → `sidebar/index.js` → `bikelane.update()` → DOM update

**Gotcha Check (from sidecar):**
- Unlike MSSCI-12048/12123, this component IS properly wired (not just exists)
- `bikelane.init()` called on sidebar init
- `bikelane.update()` called on every WebSocket/IPC message

**Handoff:** To Vizzini (SM) for finish-story

## Next Steps
1. ~~Spawn sm-handoff to transition to TEA for RED phase~~
2. ~~TEA writes failing tests for BikeLane workflow status visibility~~
3. ~~Dev implements to pass tests~~
4. ~~Reviewer verifies feature works in UI and closes story~~
5. SM finishes and archives session
