# Story 36-9 Summary: Bug - OTEL enrichment blocked by missing trace/span IDs

## What Was Built

Fixed a P0 bug where OTEL enrichment never ran because the code required `traceId` and `spanId` fields that Claude Code's OTEL logs don't actually include. The fix removes the blocking guard and uses the Claude tool_use_id from the message stream as the correlation key instead.

## Key Technical Decisions

1. **Correlation via toolId instead of OTEL spanId** - Claude Code's OTEL logs don't include traceId/spanId at the logRecord level (despite OTEL spec), so we use the tool_use.id from Claude's message stream (captured by Story 36-8) as the correlation key.

2. **Remove blocking guard entirely** - The `if (event.spanId && event.traceId)` guard at otlp-receiver.ts:698 prevented all enrichment. Removed it to allow enrichment for all Read/Edit tool events.

3. **FIFO queue matching** - Reuse the pending tool input queue from Story 36-8 with 5-second timeout cleanup.

## Implementation Patterns

- **Tool correlation pattern**: Capture tool_use from Claude message stream → store in FIFO queue → match by toolName when OTEL event arrives → use toolId as correlation key
- **Graceful degradation**: Enrichment errors are caught and ignored, preventing crashes when files are missing or unreadable

## Files Modified

| File | Changes |
|------|---------|
| `packages/cyclist/src/otlp-receiver.ts` | Removed blocking guard, use toolId as correlationId |
| `packages/cyclist/src/main.ts` | Removed debug logging, updated comments |
| `packages/cyclist/tests/36-7-enrichment-pipeline.test.ts` | Updated tests for new correlation approach |
| `sprint/current-sprint.yaml` | Added bug story 36-9 |

## Lessons for Future Work

1. **Verify OTEL data actually exists** - The original Story 36-2 assumed OTEL logs would have traceId/spanId, but they don't. Always verify actual log structure before building on assumptions.

2. **Debug logging discipline** - Added and removed debug logging cleanly. Good pattern for investigation work.

3. **Two-phase correlation** - The Claude message stream arrives before OTEL logs, so capturing tool_use events first then matching to OTEL events later works well.

## Unblocked Stories

This fix unblocks Stories 36-3 (Bash), 36-4 (Search), 36-5 (Task), and 36-6 (Export) which all depend on working enrichment.
