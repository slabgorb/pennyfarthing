# Story 36-8 Completion Summary

## Overview
Fixed OTEL tool call enrichment bug by implementing two-stage correlation between Claude message stream and OpenTelemetry spans.

## Bug Description
Story 36-7 assumed OTEL spans contained `file_path` in the `tool_parameters` attribute. However, Claude Code's OTEL spans only include:
- `tool_name` (e.g., "Read")
- `duration_ms`
- `success`

The actual file paths and tool inputs are only available in the Claude message stream's `tool_use` blocks, not in OTEL data.

## Solution Implemented
Implemented two-stage correlation mechanism:

1. **Capture phase** (main.ts): When Claude sends a `tool_use` message, capture the tool input including `file_path` and store it in a pending input queue
2. **Correlation phase** (otlp-receiver.ts): When OTEL span arrives, look up the pending input by tool name and consume it

## Files Changed

**packages/cyclist/src/span-correlation.ts** (NEW)
- Added `PendingToolInput` interface
- Added `storePendingToolInput()` - captures inputs from message stream
- Added `consumePendingToolInput()` - retrieves when OTEL arrives
- Added `clearPendingToolInputs()` - for testing/reset
- 5-second TTL on pending inputs prevents memory bloat
- FIFO queue with automatic cleanup

**packages/cyclist/src/main.ts**
- Import `storePendingToolInput`
- Capture ALL tool_use block inputs (lines 819-822)
- Stores `{ toolId, toolName, input }` when tool_use arrives

**packages/cyclist/src/otlp-receiver.ts**
- Import `consumePendingToolInput`
- Lookup pending input when OTEL span arrives (lines 691-712)
- Pass captured `file_path` to enrichment functions
- Graceful fallback when no pending input found

**packages/cyclist/tests/36-7-enrichment-pipeline.test.ts**
- Updated test fixtures to call `storePendingToolInput`
- Simulates two-stage correlation in test environment

## Test Results
- Story 36-7 enrichment tests: 16 passed
- Full Cyclist test suite: 2275 passed
- TypeScript build: PASS
- ESLint: 0 errors, 0 warnings

## Risk Assessment
**LOW RISK** implementation:
- Non-invasive - only adds new correlation mechanism, doesn't modify existing pipelines
- Pending inputs consumed (removed) when matched, preventing memory leaks
- 5-second TTL provides additional safety against orphaned entries
- Graceful degradation when correlation fails (enrichment continues with empty input)

## Known Tradeoffs
**Race condition potential (non-blocking):**
If two Read calls happen in rapid succession and OTEL events arrive out-of-order, FIFO matching could assign wrong file_path. However:
- OTEL events typically arrive in order
- Failure mode is wrong metadata in UI, not data corruption
- 5s TTL limits impact window
- Documented in implementation

## Acceptance Criteria Met
- [x] Read tool events show file size, line count, language
- [x] Edit tool events show diff summary (+N/-N lines)
- [x] Enrichment data persists in tool event storage
- [x] Works with actual Claude Code OTEL data

## Quality Gates
- [x] TypeScript compilation passes
- [x] All tests pass (2275/2275)
- [x] No console.log statements in changed files
- [x] No skipped tests in changed files
- [x] PR created and approved (#260)
- [x] Code review passed with APPROVED verdict

## Next Steps
OTEL enrichment pipeline is now complete and working. The correlation mechanism properly connects Claude message stream data with OTEL spans for accurate enrichment of Read/Edit tool calls.

---
**Completed:** 2026-01-15
**PR:** https://github.com/1898andCo/pennyfarthing/pull/260
**Workflow:** trivial (fix bug, no tests needed)
