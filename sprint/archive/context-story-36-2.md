# Story 36-2: Read/Edit Tool Enrichment

## Overview

Enrich Read and Edit tool spans with file context metadata. Building on 36-1's span correlation foundation, this story adds file-specific enrichments before spans are exported.

**Points:** 2
**Priority:** P1
**Repo:** cyclist

## Technical Approach

### Foundation (from 36-1)

The span-correlation module (`packages/cyclist/src/span-correlation.ts`) provides:
- `getCorrelation(spanId)` - Retrieve span data
- `getCorrelationsByToolName(toolName)` - Filter by tool type (Read, Edit)
- `linkToolUseToSpan(spanId, messageContext)` - Attach context to span
- `enriched` flag on SpanCorrelation interface - Mark as enriched

### Enrichment Strategy

1. **Intercept Read/Edit spans** via existing correlation pipeline
2. **Extract file path** from span attributes or tool input
3. **Gather file metadata:**
   - File size (bytes)
   - Line count
   - Language (from extension mapping)
   - Git status (modified, new, untracked, clean)
4. **For Edit spans:** Calculate diff summary (lines added/removed)
5. **Store enrichment** in correlation record
6. **Mark as enriched** before export

### Key Files to Modify

| File | Change |
|------|--------|
| `packages/cyclist/src/span-correlation.ts` | Add enrichment data types and storage |
| `packages/cyclist/src/file-enrichment.ts` | NEW - File metadata extraction utilities |
| `packages/cyclist/tests/36-2-file-enrichment.test.ts` | NEW - Test suite for enrichment |

### Utility Functions Needed

```typescript
// File metadata extraction
getFileSize(filePath: string): number
getLineCount(filePath: string): number
detectLanguage(filePath: string): string
getGitStatus(filePath: string): 'modified' | 'new' | 'untracked' | 'clean'

// Edit-specific
calculateDiffSummary(oldContent: string, newContent: string): { added: number, removed: number }
```

## Acceptance Criteria

- [ ] Read spans include file size and line count
- [ ] Edit spans include diff summary (lines added/removed)
- [ ] Language detected from file extension
- [ ] Git status included when in git repo
- [ ] Enrichment happens before span export

## Dependencies

- **36-1** (DONE) - Span correlation infrastructure

## Test Strategy

Follow pattern from `36-1-span-correlation.test.ts`:
- Group tests by acceptance criteria
- Mock file system for predictable results
- Verify enriched flag set after processing
- Test edge cases (missing files, binary files, non-git repos)

## Reference

- Implementation: `packages/cyclist/src/span-correlation.ts`
- Tests: `packages/cyclist/tests/36-1-span-correlation.test.ts`
- Summary: `sprint/context/story-36-1-summary.md`
