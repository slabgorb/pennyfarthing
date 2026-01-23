# Story 58-2: Sprint Metrics Display

## Story Details

| Field | Value |
|-------|-------|
| **ID** | 58-2 |
| **Jira** | MSSCI-12238 |
| **Title** | Sprint Metrics Display |
| **Points** | 2 |
| **Epic** | 58 - Sprint & Story Awareness |
| **Workflow** | tdd |
| **Phase** | green |

## Workflow Tracking

**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-23T11:19:31Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-23T10:50:00Z | 2026-01-23T10:49:42Z | < 1m |
| test | 2026-01-23T10:49:42Z | 2026-01-23T10:56:39Z | 6m |
| green | 2026-01-23T10:56:39Z | 2026-01-23T11:15:00Z | 18m |
| review | 2026-01-23T11:15:00Z | 2026-01-23T11:19:31Z | 4m |

### Handoff History
| From | To | Gate | Status | Timestamp |
|------|-----|------|--------|-----------|
| SM | TEA | AC verified | success | 2026-01-23T10:49:42Z |
| red (TEA) | green (Dev) | tests_fail | PASSED | 2026-01-23T10:56:39Z |
| green (Dev) | review (Reviewer) | tests_pass | PASSED | 2026-01-23T11:15:00Z |
| review (Reviewer) | finish (SM) | approval | PASSED | 2026-01-23T11:19:31Z |

## Branch

`feat/58-2-sprint-metrics-display`

## Technical Context

### Problem Statement

The VS Code extension sidebar displays sprint metrics, but the current implementation has gaps:

1. **In-progress shows COUNT, not POINTS** - Displays "In Progress: 3 stories" instead of showing the actual points sum
2. **Sprint end date not shown** - Users can't see when the sprint ends without checking the YAML file

### Files Modified

| File | Change |
|------|--------|
| `packages/vscode-extension/src/providers/sidebar.ts` | Extended SprintData interface, updated getSprintChildren(), added createEndDateItem() |
| `packages/vscode-extension/src/server/websocket-manager.ts` | Extended StatsData.sprint interface |

### Acceptance Criteria

- [x] AC1: Shows remaining points from sprint YAML
- [x] AC2: Shows in-progress points (sum of points for in_progress stories)
- [x] AC3: Shows sprint end date with urgency indicator
- [x] AC4: Updates when sprint YAML changes

## TEA Assessment

**Tests Required:** Yes
**Test Files:**
- `packages/cyclist/tests/MSSCI-12238-sprint-metrics.test.ts` - Parser tests
- `packages/vscode-extension/tests/MSSCI-12238-sprint-metrics-display.test.ts` - Sidebar display tests

**Tests Written:** 26 tests covering 4 ACs
**Status:** RED (6 failing - ready for Dev)

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/vscode-extension/src/providers/sidebar.ts` - Extended SprintData interface, updated getSprintChildren() to display points, added createEndDateItem() for end date with urgency
- `packages/vscode-extension/src/server/websocket-manager.ts` - Extended StatsData.sprint interface with inProgressPoints and endDate fields

**Tests:** 26/26 passing (GREEN)
**PR:** #459 - feat(sidebar): display sprint metrics with points and end date (58-2)
**Branch:** feat/58-2-sprint-metrics-display (pushed)

**Handoff:** To Reviewer for code review

## Reviewer Assessment

**PR:** #459
**Verdict:** APPROVED

**Code Review Evidence:**
- **Data flow traced:** `endDate` from `sprint/current-sprint.yaml` → `story-parser.ts:362` → WheelHub broadcast → `sidebar.ts:395-397` (safe - local file, not user input)
- **Pattern observed:** Follows existing sidebar child item pattern at `sidebar.ts:379-392`, consistent with Completed/In Progress items
- **Error handling:** Null check at `sidebar.ts:395` prevents crash when `endDate` is null

**Security:** N/A - no auth changes, data sourced from local YAML files controlled by tooling
**Performance:** No concerns - simple date arithmetic, no loops or external calls

**Non-Blocking Observations:**
- [MEDIUM] Date parsing at `sidebar.ts:413` assumes `YYYY-MM-DD` format; ISO format (`2026-02-02T23:59:59Z`) would produce `NaN` for day. Low risk since tooling controls YAML format.

**Handoff:** To SM for finish-story workflow
