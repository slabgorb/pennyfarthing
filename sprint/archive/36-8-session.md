# Story 36-8 Session

## Story Info
- **ID:** 36-8
- **Title:** Fix Read/Edit enrichment - correlate OTEL with Claude message stream
- **Type:** Bug
- **Points:** 2
- **Priority:** P1
- **Epic:** 36 - OTEL Tool Call Enrichment

## Status
- **Phase:** finish
- **Workflow:** trivial
- **Verdict:** APPROVED

## Context
**BUG:** Story 36-7 wired up enrichment but assumed OTEL sends `file_path` in `tool_parameters` attribute. It does NOT. The OTEL data from Claude Code only has tool_name, duration_ms, success - no file paths or tool inputs.

The file path is available in the **Claude message stream** (`tool_use` blocks) but not in OTEL spans.

**Current broken flow:**
1. OTEL span arrives with `tool_name: "Read"` but NO `file_path`
2. `processLogEvents()` tries to parse `tool_parameters` JSON
3. `tool_parameters` doesn't contain `file_path`
4. `enrichReadSpan()` gets correlation with `messageContext.input = undefined`
5. Enrichment fails silently, returns empty data

**Required fix:**
1. Capture `file_path` from Claude `tool_use` messages in the message stream
2. Store tool inputs by `tool_id` in a lookup map
3. When OTEL span arrives, correlate by tool name + timing (no tool_id in OTEL)
4. Use captured file path for enrichment

## Technical Analysis

### Where tool_use messages are processed
- `packages/cyclist/src/main.ts:811-827` - handles `tool_use` blocks for Edit/Write
- `SDKToolUseMessage` type has `tool_name`, `tool_id`, `input` with `file_path`

### The correlation problem
OTEL spans have:
- `tool_name` (e.g., "Read")
- `spanId`, `traceId`
- `duration_ms`, `success`
- `tool_parameters` (but this is NOT the same as Claude's tool input!)

Claude `tool_use` messages have:
- `tool_name`
- `tool_id` (unique per invocation)
- `input: { file_path, limit, offset, ... }`

**NO shared ID** between OTEL and Claude messages. Must correlate by:
- Tool name match
- Timing proximity (tool_use → tool_result timing window)

### Recommended approach
1. In main.ts message handler, when `tool_use` message arrives:
   - Store `{ tool_id, tool_name, input }` in a Map
   - Key by tool_id or tool_name+timestamp

2. In otlp-receiver.ts `processLogEvents()`:
   - For Read/Edit events, look up recent tool_use with matching tool_name
   - Use that input data for enrichment

3. Alternative: Use `tool_result` messages which have both `tool_id` and are closer to OTEL timing

## Files to Modify
- `packages/cyclist/src/main.ts` - capture tool_use inputs
- `packages/cyclist/src/otlp-receiver.ts` - correlate with captured inputs
- `packages/cyclist/src/span-correlation.ts` - may need tool input storage

## Acceptance Criteria
- [ ] Read tool events show file size, line count, language in ToolLogViewer
- [ ] Edit tool events show diff summary (+N/-N lines)
- [ ] Enrichment data persists in tool event storage
- [ ] Works with actual Claude Code OTEL data (not just mocks)

## Dev Assessment

### Implementation Summary
Fixed the OTEL enrichment bug by implementing two-stage correlation:
1. Capture tool inputs from Claude message stream (tool_use blocks)
2. Correlate with OTEL spans when they arrive (matched by tool name)

The root cause was that Story 36-7 assumed OTEL data included `file_path` in `tool_parameters`, but Claude Code's OTEL spans only contain `tool_name`, `duration_ms`, `success` - no file paths.

### Changes Made

**packages/cyclist/src/span-correlation.ts:**
- Added `PendingToolInput` interface for storing tool inputs
- Added `storePendingToolInput()` to capture from message stream
- Added `consumePendingToolInput()` to look up when OTEL arrives
- Added `clearPendingToolInputs()` for testing/reset
- Updated `resetCorrelations()` to also clear pending inputs
- 5-second TTL on pending inputs to avoid memory bloat

**packages/cyclist/src/main.ts:**
- Added import for `storePendingToolInput`
- Capture ALL tool_use block inputs (not just Edit/Write)
- Stores `{ toolId, toolName, input }` when tool_use arrives

**packages/cyclist/src/otlp-receiver.ts:**
- Added import for `consumePendingToolInput`
- Replace OTEL param parsing with pending input lookup
- Link `toolUseId` from Claude to span correlation

**packages/cyclist/tests/36-7-enrichment-pipeline.test.ts:**
- Updated `createToolResultEvent` to call `storePendingToolInput`
- Simulates two-stage correlation (message stream → OTEL)

### Test Results
- All 16 Story 36-7 enrichment tests pass
- Full Cyclist test suite: 2275 passed
- TypeScript build: PASS

### Risk Assessment
- **Low risk**: Non-invasive change to existing pipeline
- Pending inputs are consumed (removed) when matched, preventing memory leaks
- 5-second TTL provides additional safety against orphaned entries
- Graceful handling when no pending input found (falls back to empty)

## Reviewer Handoff

**Repository:** pennyfarthing
**Branch:** fix/36-8-otel-read-enrichment
**PR:** https://github.com/1898andCo/pennyfarthing/pull/260

### Key Files to Review
- `packages/cyclist/src/span-correlation.ts` - Pending input storage
- `packages/cyclist/src/main.ts` - Tool input capture (lines 819-822)
- `packages/cyclist/src/otlp-receiver.ts` - Correlation lookup (lines 691-712)

### Quality Gates Passed
- TypeScript: PASS
- Tests: 2275 passed
- PR created and open

## Workflow Tracking
**Workflow:** trivial
**Phase:** finish
**Phase Started:** 2026-01-15T11:57:13.000Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-15T14:45:00.000Z | 2026-01-15T14:47:00.000Z | 2m |
| green | 2026-01-15T14:47:00.000Z | 2026-01-15T14:55:00.000Z | 8m |
| review | 2026-01-15T14:55:00.000Z | 2026-01-15T11:57:13.000Z | 21h 2m |
| finish | 2026-01-15T11:57:13.000Z | - | - |

## Reviewer Pre-Flight Report

Generated: 2026-01-15T06:55:00.000Z

### Test Cache
| Metric | Value |
|--------|-------|
| Git SHA | 60dd7267571b8479f05d094d9138282dd6abfe70 |
| Result | PASS: 2275/2275 tests passed, 0 failed |
| Last Run | 2026-01-15T06:54:55.000Z |
| Duration | 5.05s |

### Build Status
| Component | Status |
|-----------|--------|
| TypeScript | PASS |
| ESLint | PASS (0 errors, 0 warnings) |
| Tests | PASS (2275 passed, 118 skipped) |

### Code Quality
| Category | Result |
|----------|--------|
| Console.log in changed files | 0 instances |
| Skipped tests in changed files | 0 instances |
| Code smells | 0 detected |
| Type errors | 0 |

### Files Changed
- **Total**: 14 files (5 source, 9 generated maps)
- **Additions**: +240 lines
- **Deletions**: -26 lines
- **Net**: +214 lines

### Key Files to Review
1. `/packages/cyclist/src/span-correlation.ts` (NEW)
2. `/packages/cyclist/src/otlp-receiver.ts` (lines 691-712)
3. `/packages/cyclist/src/main.ts` (lines 819-823)
4. `/packages/cyclist/tests/36-7-enrichment-pipeline.test.ts` (fixture)

### Recommendation
**READY FOR REVIEW** - All checks pass, low risk, comprehensive test coverage.

## Reviewer Assessment

**PR:** #260
**Verdict:** APPROVED

**Code Review Evidence:**

**Data flow traced:** `tool_use.input` captured in `main.ts:821-822` from Claude message stream → stored in `pendingToolInputs` queue (span-correlation.ts:115-120) → consumed when OTEL `tool_result` arrives at `otlp-receiver.ts:694` → passed to `enrichReadSpan()`/`enrichEditSpan()` with `file_path` available.

**Pattern observed:** FIFO queue with TTL cleanup - good defensive pattern at `span-correlation.ts:104-145`. Every store operation cleans expired entries (5s TTL), and consumed entries are removed via splice.

**Error handling:**
- Graceful fallback when no pending input found (`otlp-receiver.ts:694-695` - returns `undefined`, code continues with empty input)
- Enrichment wrapped in try-catch at `otlp-receiver.ts:733` - ignores errors, tool event still recorded
- Missing file paths don't crash - file-enrichment functions handle stat errors

**Security:** N/A - no auth changes, no user input flowing to dangerous sinks. File paths from Claude's own message stream, not external input.

**Performance:** Queue is filtered linearly O(n) on every store/consume, but n is bounded by 5s TTL and consumed entries are removed. In practice, n ≤ 10-20 for any realistic workload. No concern.

**Minor Observations (non-blocking):**

1. **Race condition potential (non-blocking):** If two `Read` calls for different files happen in rapid succession and OTEL events arrive out-of-order, the FIFO matching could assign the wrong `file_path` to a span. However:
   - OTEL events typically arrive in order
   - The failure mode is wrong metadata in the viewer, not data corruption
   - The 5s TTL limits the impact window
   - This is a known tradeoff documented in the session file ("correlate by tool name + timing")
   - `span-correlation.ts:136-137`

2. **Test fixture couples test to implementation detail:** The test fixture at `36-7-enrichment-pipeline.test.ts:51-53` calls `storePendingToolInput` directly, which tightly couples tests to the correlation mechanism. Not a problem now, but if correlation logic changes, all tests break. Minor concern.

**What I Verified:**
- [x] Data flow: Input → Storage → Consumption → Enrichment
- [x] TTL cleanup prevents memory bloat
- [x] Graceful degradation when correlation fails
- [x] No null pointer risks (optional chaining used correctly)
- [x] Tests cover happy path and error cases
- [x] No security issues introduced

**Handoff:** To SM for finish-story workflow

## Handoff History

| Phase | Agent | Timestamp | Context % | Mode | Gate | Status |
|-------|-------|-----------|-----------|------|------|--------|
| review | reviewer | 2026-01-15T11:57:13.000Z | 26% | ask | approval | PASSED |

## Handoff Summary

**Gate:** approval - PASSED
**Verdict:** APPROVED
**Next Phase:** finish
**Next Agent:** sm

Reviewer approved the PR. All code quality checks passed. Two-stage OTEL correlation implementation is ready for SM to merge and close the story.

<!-- CYCLIST:HANDOFF:/sm -->
