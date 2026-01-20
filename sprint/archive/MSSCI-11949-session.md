# Story MSSCI-11949: Remove tool/skill log panels

**Epic:** MSSCI-11942 - WheelHub Notification Consolidation
**Points:** 3 | **Priority:** P2
**Repos:** cyclist
**Branch:** feat/MSSCI-11949-remove-panels
**Jira:** MSSCI-11949
**Phase:** finish
**Status:** in_progress
**Workflow:** trivial

## Acceptance Criteria
- [x] tool-panel.js and its UI removed
- [x] skill-panel.js and its UI removed
- [x] Badge polling for these panels removed
- [x] Related localStorage keys cleaned up
- [x] Messages view remains the single source for tool/skill activity

## Technical Context

### Current State
The tool-panel.js (312 lines) and skill-panel.js (552 lines) provide dedicated side panels for viewing tool executions and skill invocations. Both use the VerticalPanel base class pattern with:
- localStorage persistence (`cyclist-tool-panel`, `cyclist-skill-panel`)
- Resize/collapse functionality
- Badge count updates via `window.panelBadgeCounts`

### Why Remove
Per MSSCI-11929, tool/skill activity is now visible in the enriched messages view. The separate panels add UI complexity without unique value.

### Files to Modify

**Delete (2 files):**
- `packages/cyclist/src/public/js/tool-panel.js` - Tool panel module
- `packages/cyclist/src/public/js/skill-panel.js` - Skill panel module

**Modify (5 files):**
- `packages/cyclist/src/public/index.html` - Remove panel HTML elements
- `packages/cyclist/src/public/styles.css` - Remove panel-specific styles
- `packages/cyclist/src/public/js/components/ToolLogViewer.js` - May reference tool-panel
- `packages/cyclist/tests/35-5-vertical-panel.test.ts` - May test tool-panel
- `packages/cyclist/tests/35-12-skill-panel.test.ts` - Skill panel tests (delete)

**localStorage keys to document for cleanup:**
- `cyclist-tool-panel`
- `cyclist-skill-panel`

### Testing Strategy
- Verify Cyclist loads without errors after removal
- Verify messages view still shows tool/skill activity
- No regressions in other panel functionality

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/cyclist/src/public/js/tool-panel.js` - Deleted
- `packages/cyclist/src/public/js/skill-panel.js` - Deleted
- `packages/cyclist/src/public/js/components/ToolLogViewer.js` - Deleted
- `packages/cyclist/src/public/index.html` - Removed panel HTML and registrations
- `packages/cyclist/src/public/styles.css` - Removed ~580 lines of panel styles
- `packages/cyclist/tests/35-12-skill-panel.test.ts` - Deleted
- `packages/cyclist/tests/35-5-vertical-panel.test.ts` - Removed tool-panel test

**Tests:** 2927/2928 passing (1 pre-existing failure unrelated to this PR)
**PR:** #362 - feat(MSSCI-11949): Remove tool/skill log panels from Cyclist
**Branch:** feat/MSSCI-11949-remove-panels (pushed)

**Handoff:** To Reviewer for code review

## Reviewer Assessment

**Decision:** APPROVED ✅
**Reviewer:** The Queen of Hearts
**Date:** 2026-01-19

### Verification Summary

| Check | Result |
|-------|--------|
| Tests | 2927/2928 passing (1 pre-existing failure in persona-info) |
| Build | Clean |
| Security | No issues |
| Forbidden Patterns | None added (14 console.logs removed!) |

### Changes Verified
- **2,690 lines deleted** - substantial cleanup
- tool-panel.js, skill-panel.js, ToolLogViewer.js deleted
- HTML panel elements and registrations removed
- CSS styles (~580 lines) removed
- Badge count tracking removed
- Tests updated appropriately
- No dangling references

### Acceptance Criteria
All criteria verified and met. Clean deletion PR with proper test updates.

**Handoff:** To SM (The Mad Hatter) for story completion

## Workflow
- [x] SM: Story setup
- [x] Dev: Remove panels and cleanup references
- [x] Reviewer: Code review - APPROVED
- [ ] SM: Finish story
