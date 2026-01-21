# Story MSSCI-12086: Tri-modal support (create/validate/edit)

**Epic:** MSSCI-12060 - Stepped Workflow Support (BikePaths)
**Points:** 2 | **Priority:** P2
**Repos:** pennyfarthing
**Branch:** feat/MSSCI-12086-trimodal-support
**Phase:** review
**Status:** in_progress
**Jira:** MSSCI-12086
**Workflow:** tdd

## Story Description

Implement tri-modal workflow execution for BikePaths:
- Mode selection at workflow start via `--mode` flag
- Route to appropriate steps directory based on mode (create/validate/edit)
- Track mode in session state
- Default to create mode if not specified

## Acceptance Criteria

- [x] AC1: Mode selectable via `--mode create|validate|edit` flag on `/workflow start`
- [x] AC2: Steps loaded from mode-specific directory (workflow.modes.{mode} path)
- [x] AC3: Mode tracked in session state (WorkflowState.mode field)
- [x] AC4: Defaults to create mode when --mode not specified

## TEA Assessment

**Tests Required:** Yes
**Reason:** New tri-modal support functionality requires comprehensive testing

**Test Files:**
- `packages/core/src/workflow/trimodal.test.ts` - Tri-modal mode parsing, validation, and path resolution

**Tests Written:** 40 tests covering 4 ACs
**Status:** GREEN (all passing)

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/core/src/workflow/trimodal.ts` - Four functions implemented

**Functions Implemented:**
- `parseTrimodalFlag()` - Parse --mode, --mode=, -m flags from args
- `validateMode()` - Validate mode against workflow.modes config
- `resolveStepsPath()` - Resolve mode-specific or fallback steps path
- `getDefaultMode()` - Return workflow default or 'create' for stepped

**Tests:** 40/40 passing (GREEN)
**PR:** #397 - feat(workflow): implement tri-modal support for BikePaths (MSSCI-12086)
**Branch:** feat/MSSCI-12086-trimodal-support (pushed)

## Reviewer Assessment

**Verdict:** APPROVED

**Security:** No issues
- Pure string processing, no I/O
- Input validated against fixed VALID_MODES array
- No injection vectors

**Data Flow:** Traced and verified
- parseTrimodalFlag → validateMode → resolveStepsPath
- getDefaultMode provides fallback chain

**Edge Cases:** All handled
- No flag → undefined mode (success)
- Missing value → error
- Invalid value → error with helpful message
- Case sensitive → 'Create' fails
- No modes config → fallback to steps.path
- Phased workflow → undefined mode

**Tests:** 40/40 passing, comprehensive coverage

**Performance:** O(n) argument parsing, acceptable

**Handoff:** To SM (finish)

## Workflow Tracking

**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-21T09:15:00Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-21T08:46:26Z | 2026-01-21T08:47:14Z | 48s |
| red | 2026-01-21T08:47:14Z | 2026-01-21T08:52:30Z | 5m 16s |
| green | 2026-01-21T08:52:30Z | 2026-01-21T09:10:28Z | 17m 58s |
| review | 2026-01-21T09:10:28Z | 2026-01-21T09:15:00Z | 4m 32s |
| finish | 2026-01-21T09:15:00Z | - | - |

### Handoff History
| From | To | Gate | Time |
|------|----|----|------|
| TEA (red) | Dev (green) | tests_fail | 2026-01-21T08:52:30Z |
| Dev (green) | Reviewer (review) | tests_pass | 2026-01-21T09:10:28Z |
| Reviewer (review) | SM (finish) | approval | 2026-01-21T09:15:00Z |

## Workflow

- [x] SM: Story setup
- [x] TEA: Write failing tests (RED phase)
- [x] Dev: Implement to GREEN
- [x] Reviewer: Code review ← completed
- [ ] SM: Finish story ← current
