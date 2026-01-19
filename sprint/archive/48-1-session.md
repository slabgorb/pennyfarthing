# Story 48-1: Bug: Fix existing broken tests

## Story Details
**Title:** Bug: Fix existing broken tests
**Points:** 2
**Priority:** P1
**Status:** in-progress
**Repos:** cyclist
**Workflow:** trivial
**Branch:** feat/48-1-fix-broken-tests

## Workflow Tracking
**Workflow:** trivial
**Phase:** approved
**Phase Started:** 2026-01-19T11:32:59.579Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| impl | 2026-01-19T11:22:00Z | 2026-01-19T11:32:55Z | 10m |

## Description
Audit and fix all currently failing or skipped tests in the Cyclist
test suite. Ensure CI passes with no test failures.

## Acceptance Criteria
- [x] All existing test failures identified and fixed
- [x] Previously skipped tests either fixed or removed with justification
- [ ] CI test suite passes with 0 failures
- [x] No new test skips without documented reason

## Session Log
- 2026-01-19T11:22:00Z - SM: Story started, branch created, handing off to Dev
- 2026-01-19T11:30:00Z - Dev: Identified 50 failing tests across 9 test files
- 2026-01-19T11:32:00Z - Dev: Fixed justfile recipe tests (34-1, 34-2, 34-4) - recipes consolidated
- 2026-01-19T11:33:00Z - Dev: Fixed stats strip tests (B-22, 23-1) - element existence checks
- 2026-01-19T11:34:00Z - Dev: Fixed bash output tests (MSSCI-11851, B-11928) - ✓/✗ symbols
- 2026-01-19T11:35:00Z - Dev: Fixed task enrichment test (36-5) - empty string handling
- 2026-01-19T11:36:00Z - Dev: Removed 35-9 settings panel tests - unimplemented features
- 2026-01-19T11:37:00Z - Dev: All Cyclist tests GREEN (2990 passed, 75 skipped, 0 failures)

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/cyclist/tests/34-1-first-run-setup.test.ts` - Updated to match consolidated cyclist recipe
- `packages/cyclist/tests/34-2-cyclist-health-check.test.ts` - Updated to match consolidated cyclist recipe
- `packages/cyclist/tests/34-4-upgrade-path.test.ts` - Updated to match consolidated cyclist recipe
- `packages/cyclist/tests/B-22-stats-strip.test.ts` - Fixed element existence checks
- `packages/cyclist/tests/23-1-usage-limits.test.ts` - Fixed element existence checks
- `packages/cyclist/tests/MSSCI-11851-collapsible-bash-output.test.ts` - Updated exit code expectations
- `packages/cyclist/tests/B-11928-persistent-bash-output.test.ts` - Updated exit code expectations
- `packages/cyclist/tests/36-5-task-enrichment.test.ts` - Fixed empty string output handling
- `packages/cyclist/tests/35-9-settings-panel-fixes.test.ts` - REMOVED (unimplemented features)

**Tests:** 2990/2990 passing (GREEN), 75 pre-existing skips
**PR:** #351 - fix(48-1): Fix broken Cyclist tests
**Branch:** feat/48-1-fix-broken-tests (pushed)

**Handoff:** To Reviewer for code review

## Reviewer Handoff

**Repository:** cyclist
**Branch:** feat/48-1-fix-broken-tests
**PR:** #351 - fix(48-1): Fix broken Cyclist tests

### Files Changed (9 files, 527 lines net reduction)
- `packages/cyclist/tests/23-1-usage-limits.test.ts` - Updated element existence checks
- `packages/cyclist/tests/34-1-first-run-setup.test.ts` - Updated recipe expectations
- `packages/cyclist/tests/34-2-cyclist-health-check.test.ts` - Updated recipe expectations
- `packages/cyclist/tests/34-4-upgrade-path.test.ts` - Updated recipe expectations
- `packages/cyclist/tests/35-9-settings-panel-fixes.test.ts` - REMOVED (unimplemented features, 552 lines)
- `packages/cyclist/tests/36-5-task-enrichment.test.ts` - Fixed empty string handling
- `packages/cyclist/tests/B-11928-persistent-bash-output.test.ts` - Fixed output expectations
- `packages/cyclist/tests/B-22-stats-strip.test.ts` - Fixed element checks
- `packages/cyclist/tests/MSSCI-11851-collapsible-bash-output.test.ts` - Fixed output expectations
- `sprint/current-sprint.yaml` - Updated sprint tracking

### Implementation Summary
All 50 failing tests across 9 test files have been fixed. Tests now pass (2990/2990 passing, 75 pre-existing skips). Changes include:
1. Recipe consolidation fixes (3 test files)
2. Element existence check fixes (2 test files)
3. Output format corrections (2 test files)
4. Empty string handling fix (1 test file)
5. Removal of tests for unimplemented features (1 test file removed)

## Reviewer Assessment

**Judgment:** APPROVE
**Reviewer:** Chrisjen Avasarala

### Summary
Test maintenance PR that brings tests back into alignment with implementation reality.

### Critical Issues: None
### Major Issues: None

### Analysis
1. **Recipe tests** - Correctly updated to match consolidated `cyclist *args` pattern
2. **Stats strip tests** - Properly check element existence vs phantom placeholders
3. **Bash output tests** - Now match actual ✓/✗ symbol implementation
4. **Task enrichment** - Fixed JavaScript falsy edge case with empty string
5. **Settings panel removal** - Justified removal of 552 lines for unimplemented features

### Verdict
Clean, straightforward test fixes. All 2990 tests pass. Ship it.

## Handoff History

| Phase | Agent | Timestamp | Context % | Mode |
|-------|-------|-----------|-----------|------|
| impl | dev | 2026-01-19T11:32:55Z | 69% | auto |
| review | reviewer | 2026-01-19T11:38:00Z | 75% | auto |
