# Story MSSCI-11847: Permission Presets by Workflow

## Story Details
- **ID:** MSSCI-11847
- **Title:** Permission presets by workflow
- **Points:** 2
- **Workflow:** TDD
- **Jira Key:** MSSCI-11847
- **Branch:** feat/MSSCI-11847-permission-presets-workflow
- **Assigned To:** Keith Avery

## Overview
- **Epic:** MSSCI-11705 (Epic 33: Runtime Permission Management)
- **Priority:** P2
- **Repos:** pennyfarthing

## Acceptance Criteria
- [ ] AC1: Workflow schema supports `permissions` field
- [ ] AC2: Workflow start checks required permissions
- [ ] AC3: Prompts for missing permissions
- [ ] AC4: Cached grants skip prompts

## Technical Context
See: `.session/context-story-MSSCI-11847.md`

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-18T13:15:22Z
**Status:** approved

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-18T12:45:00Z | 2026-01-18T12:58:39Z | 0:13:39 |
| red | 2026-01-18T12:58:39Z | 2026-01-18T13:00:30Z | 0:01:51 |
| green | 2026-01-18T13:00:30Z | 2026-01-18T13:11:17Z | 0:10:47 |
| review | 2026-01-18T13:11:17Z | 2026-01-18T13:15:22Z | 0:04:05 |

## TEA Assessment

**Tests Required:** Yes
**Reason:** Story adds new schema validation and permission checking functionality

**Test Files:**
- `packages/core/src/workflow/workflow-permissions.test.ts` - Full test suite covering all 4 ACs

**Tests Written:** 15 tests covering 4 ACs
- AC1: 7 tests for schema validation (permissions field in workflow YAML)
- AC2: 3 tests for permission checking against cached grants
- AC3: 2 tests for missing permissions with reasons
- AC4: 5 tests for cached grant recognition (session/always types)

**Status:** RED (failing - ready for Dev)

**Implementation Needed:**
1. Add `permissions` field to `WorkflowDefinition` interface in `workflow-schema.ts`
2. Update `validateWorkflow()` to validate permissions array
3. Implement `checkWorkflowPermissions()` in `workflow-permissions.ts`

**Handoff:** To Dev for implementation

## TEA Handoff

**Gate Type:** tests_fail (RED phase)
**Gate Status:** PASSED
**Test Result:** RED (15 failing tests as expected)
**Last Commit:** f66e17ec - test: add failing tests for MSSCI-11847 permission presets
**Working Tree:** Clean

### Pre-Flight Verification
- Tests committed: YES (f66e17ec)
- Tests RED (failing): YES (15 tests failing with "Not implemented")
- Assessment written: YES (TEA Assessment section completed)

### Failing Tests Summary
All 15 tests in `packages/core/src/workflow/workflow-permissions.test.ts` are failing as expected:
- 7 tests for schema validation (AC1)
- 3 tests for permission checking (AC2)
- 2 tests for missing permissions reasons (AC3)
- 3 tests for cached grant recognition (AC4)

Each test fails with "Error: Not implemented" from `checkWorkflowPermissions()` stub.

## Handoff History

| Phase | Agent | Timestamp | Context % | Mode |
|-------|-------|-----------|-----------|------|
| red | TEA | 2026-01-18T12:58:39Z | 58% | auto |
| green | Dev | 2026-01-18T13:00:30Z | 62% | auto |
| review | Reviewer | 2026-01-18T13:11:17Z | 45% | auto |
| finish | SM | 2026-01-18T13:15:22Z | 43% | ask |

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/core/src/workflow/workflow-permissions.ts` - Implemented `checkWorkflowPermissions()` with `isGranted()` helper
- `packages/core/src/workflow/workflow-schema.ts` - Added `WorkflowPermissionPreset` interface and validation

**Tests:** 17/17 passing (GREEN)
**PR:** #330 - feat(MSSCI-11847): Permission presets for workflows
**Branch:** feat/MSSCI-11847-permission-presets-workflow (pushed)

**Handoff:** To Reviewer for code review

## Reviewer Handoff

**Gate Type:** tests_pass (GREEN phase)
**Gate Status:** PASSED
**Test Result:** GREEN (17/17 tests passing)
**Last Commit:** eeda3f86 - fix: remove unused import in workflow-permissions.test.ts
**Working Tree:** Clean
**Changes Pushed:** Yes

### Pre-Flight Verification - tests_pass Gate
- Lint checks: PASSED (npm run lint)
- Type checks: PASSED (tsc --noEmit)
- Core tests (MSSCI-11847): PASSED (17/17 permission preset tests)
- Git working tree: CLEAN
- Changes pushed to remote: YES (eeda3f86)
- PR exists and is OPEN: YES (#330)

### Files to Review
| File | Additions | Deletions | Purpose |
|------|-----------|-----------|---------|
| `packages/core/src/workflow/workflow-permissions.test.ts` | 365 | 0 | Complete test suite for permission presets (17 tests) |
| `packages/core/src/workflow/workflow-permissions.ts` | 96 | 0 | Implementation of checkWorkflowPermissions() and isGranted() helper |
| `packages/core/src/workflow/workflow-schema.ts` | 62 | 0 | Added WorkflowPermissionPreset interface and validation |

### Implementation Summary
This PR implements workflow permission presets (MSSCI-11847), a foundational feature for the runtime permission management system. The implementation:

1. **Schema Support (AC1):** Added `permissions` field to WorkflowDefinition with validation for tool, scope, and reason
2. **Permission Checking (AC2):** Implemented checkWorkflowPermissions() to identify which preset permissions are granted/missing
3. **Missing Permission List (AC3):** Returns structured list of missing permissions with reasons for UI prompts
4. **Cached Grant Matching (AC4):** Properly matches grants by tool and scope pattern, supporting session and always grant types

All 17 tests passing across 4 acceptance criteria.

## Reviewer Assessment

**PR:** #330
**Verdict:** APPROVED

**Code Review Evidence:**
- **Data flow traced:** `workflowPermissions[]` from `workflow-permissions.ts:73` → `isGranted()` comparison at line 82 → `missing`/`granted` arrays returned (safe - pure comparison logic, no external I/O)
- **Pattern observed:** Validation at `workflow-schema.ts:271-307` follows existing phase validation pattern at lines 154-206 - consistent structure
- **Error handling:** Validation returns structured errors with field paths (e.g., `workflow.permissions[0].tool`) - proper error surfaces

**Security:** N/A - internal permission matching logic only, no user-controllable input at runtime, no external calls
**Performance:** O(n*m) where n=workflow permissions, m=cached grants. Acceptable for typical workflow sizes (usually <10 permissions)

**Minor Observations (non-blocking):**
- `WorkflowPermissionPreset` interface defined in two places (`workflow-permissions.ts:15-22` and `workflow-schema.ts:59-66`). Identical now but could drift. Consider consolidating to a shared types module in future.
- No runtime null guard on `checkWorkflowPermissions()` parameters - TypeScript enforces array type but callers should use `workflow.permissions ?? []`. Not a blocker since this is internal API.

**Test Coverage:** Comprehensive - 17 tests covering:
- AC1: 7 tests for schema validation
- AC2: 3 tests for permission checking
- AC3: 2 tests for missing permissions with reasons
- AC4: 5 tests for cached grant recognition

**Handoff:** To SM (The Mad Hatter) for finish-story workflow

## Approval Handoff

**Gate Type:** approval (review → finish)
**Gate Status:** PASSED
**Verdict:** APPROVED
**Last Commit:** eeda3f86 - fix: remove unused import in workflow-permissions.test.ts
**PR Status:** OPEN (#330)

### Pre-Flight Verification - approval Gate
- Reviewer Assessment section: EXISTS
- Verdict declaration: APPROVED ✓
- Assessment mismatch check: PASSED (VERDICT parameter matches assessment)
- Code review completed: YES (evidence of data flow tracing, pattern analysis, security review)

### Transition Details
**From Phase:** review (Reviewer)
**To Phase:** finish (SM)
**Duration:** 4 minutes 5 seconds
**Handoff Mode:** ask (context at 43% - below threshold for auto-reload)

### Session Update Summary
- Status changed from `in_progress` to `approved`
- Workflow phase advanced to `finish`
- Phase history updated with review completion timestamp
- Handoff history entry added for SM finish phase

## Next Steps
Ready for SM to run finish-story workflow.
