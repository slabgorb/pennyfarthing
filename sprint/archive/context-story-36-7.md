# Story 36-7: Wire up Read/Edit enrichment to OTEL receiver

## Overview
BUG FIX: The span-correlation and file-enrichment modules (Stories 36-1, 36-2) were implemented but never wired into the OTEL processing pipeline. The enrichment code is dead - Read/Edit spans flow through but never get enriched with file metadata.

## Technical Approach

### Root Cause
`processLogEvents()` in `otlp-receiver.ts` processes tool_result events and creates ToolEvent records, but never:
1. Calls `correlateSpan()` to register spans in the correlation map
2. Calls `enrichReadSpan()`/`enrichEditSpan()` for Read/Edit tools
3. Stores enrichment data in the ToolEvent record

### Solution
Wire up the enrichment pipeline in `otlp-receiver.ts`:

1. **Import enrichment modules** at top of file
2. **After creating ToolEvent**, call `correlateSpan()` with the event data
3. **For Read/Edit tools**, call the enrichment function and merge result into ToolEvent
4. **Extend ToolEvent interface** to include enrichment fields (optional)
5. **Update ToolLogViewer** to display enrichment data

### Data Flow (After Fix)
```
OTEL POST → parseOTLPLogs → processLogEvents
                              ↓
                         correlateSpan() ← registers span
                              ↓
                    if Read/Edit → enrichReadSpan()/enrichEditSpan()
                              ↓
                         recordToolEvent() ← with enrichment data
                              ↓
                         ToolLogViewer ← displays enriched fields
```

## Files to Modify

| File | Change |
|------|--------|
| `packages/cyclist/src/otlp-receiver.ts` | Import enrichment, call correlateSpan, call enrich functions, extend ToolEvent |
| `packages/cyclist/src/public/js/components/ToolLogViewer.js` | Display enrichment metadata |
| `packages/cyclist/tests/B-36-7-*.test.ts` | Integration tests for enrichment pipeline |

## Acceptance Criteria
- [ ] processLogEvents() calls correlateSpan() for each tool span
- [ ] Read tool spans get file size, line count, language, git status
- [ ] Edit tool spans get diff summary (added/removed lines)
- [ ] Enriched data visible in tool event storage
- [ ] ToolLogViewer displays enrichment metadata
- [ ] Unit tests verify enrichment pipeline is connected
