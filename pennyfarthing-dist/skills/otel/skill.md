---
name: otel
description: Claude Code OTEL telemetry format documentation. Use when working with OTEL span interception, enrichment, or correlation in Cyclist.
---

# OTEL Skill - Claude Code Telemetry

## Purpose

Document the actual OTEL data Claude Code emits. This is ground truth, not speculation.

**WARNING:** Do NOT assume fields exist. Check this document first.

## Quick Start - Enable Debug Logging

```bash
# Option 1: Via just command
just cyclist-electron true

# Option 2: Via environment variable
OTEL_DEBUG=true npm run dev

# Option 3: Runtime toggle (in code or devtools)
import { setOtelDebug } from './otlp-receiver.js';
setOtelDebug(true);
```

Captures go to:
- Console: `[OTEL-CAPTURE]` prefix
- File: `/tmp/otel-capture.jsonl`

View captures:
```bash
cat /tmp/otel-capture.jsonl | jq .
# Or tail live:
tail -f /tmp/otel-capture.jsonl | jq .
```

## Status

**NEEDS DATA CAPTURE** - This skill requires live OTEL capture to document actual format.

## Known Facts (Verified)

### LogRecord Structure

Claude Code exports OTEL logs (not traces/spans). The logRecord structure:

```typescript
interface LogRecord {
  timeUnixNano: string;       // Nanoseconds since epoch
  observedTimeUnixNano: string;
  body: { stringValue: string };  // Event name (e.g., "claude_code.tool_result")
  attributes: Attribute[];    // Key-value pairs
  droppedAttributesCount: number;
  // NOTE: traceId and spanId are NOT present at logRecord level
}
```

### What We Know Is MISSING

- `traceId` - NOT in logRecord (Story 36-9 confirmed)
- `spanId` - NOT in logRecord (Story 36-9 confirmed)
- `tool_use_id` - Status UNKNOWN - need to verify

### Event Types Observed

| Event Name | Description |
|------------|-------------|
| `claude_code.tool_result` | Tool execution completed |
| `claude_code.user_prompt` | User prompt submitted |
| `claude_code.api_request` | API request made |

### Tool Result Attributes (NEEDS VERIFICATION)

```
tool_name: string           // e.g., "Read", "Edit", "Bash"
tool_parameters: string     // JSON string - WHAT'S INSIDE?
tool_output: string         // Tool output (truncated)
duration_ms: string|number  // Execution time
success: string             // "true" or "false" as string
error?: string              // Error message if failed
```

## UNKNOWN - Need to Capture

1. **Does `tool_parameters` contain `file_path`?**
   - We assume yes, but need verification
   - If not, how do we correlate Read/Edit to specific files?

2. **Is there a `tool_use_id` in attributes?**
   - This would solve correlation with message stream
   - Claude message stream has `block.id` - does OTEL have matching ID?

3. **What's the exact format of `tool_parameters` for each tool?**
   - Read: `{ file_path: string, ... }` ?
   - Edit: `{ file_path: string, old_string: string, new_string: string }` ?
   - Bash: `{ command: string, ... }` ?

4. **Timing relationship between events?**
   - Does OTEL arrive before or after message stream tool_use?
   - Is it consistent or variable?

## Correlation Strategy (Current)

1. Claude message stream provides `tool_use` with `block.id`, `block.name`, `block.input`
2. Store in FIFO queue keyed by `toolName`
3. When OTEL arrives, match by `toolName` and consume from queue

**Problem:** FIFO by toolName alone is unreliable when:
- Multiple tools of same type in flight
- OTEL arrives before message stream
- Order not guaranteed

## Files to Reference

| File | Purpose |
|------|---------|
| `packages/cyclist/src/otlp-receiver.ts` | OTEL parsing and processing |
| `packages/cyclist/src/span-correlation.ts` | Pending tool input queue |
| `packages/cyclist/src/main.ts:820-824` | Message stream tool_use capture |

## API

```typescript
// Enable/disable at runtime
import { setOtelDebug, isOtelDebugEnabled } from './otlp-receiver.js';

setOtelDebug(true);   // Start capturing
setOtelDebug(false);  // Stop capturing
isOtelDebugEnabled(); // Check status
```

## Captured Data Format

Each line in `/tmp/otel-capture.jsonl` contains:

```json
{
  "timestamp": "2026-01-15T08:00:00.000Z",
  "eventName": "claude_code.tool_result",
  "logRecordKeys": ["timeUnixNano", "body", "attributes", ...],
  "traceId": null,
  "spanId": null,
  "attributes": [
    { "key": "tool_name", "value": { "stringValue": "Read" } },
    ...
  ]
}
```

## Next Steps

1. Run `just cyclist-electron true`
2. Perform Read/Edit/Bash operations in Claude Code
3. Analyze `/tmp/otel-capture.jsonl`
4. Update this skill with ground truth
5. Fix correlation based on actual data
