# Story 37-6: Fix pattern-based question detection - Summary

## What Was Done

Cleaned up dead test code in B-9.6-integration.test.ts. The 8 skipped tests for pattern-based question detection were dead code testing a feature that was intentionally removed in Story 25-5.

## Key Technical Decisions

**Decision:** Remove dead tests rather than implement pattern fallback.

**Rationale:** Pattern-based detection (heuristics for questions/lists) was deliberately replaced with structured CYCLIST markers in Story 25-5. The markers provide 100% reliable detection vs unreliable pattern matching that produced false positives.

The detection strategy is now:
- **Markers only** - Quick actions trigger ONLY when explicit `<!-- CYCLIST:TYPE:value -->` markers are present
- **No fallback** - Plain questions/lists without markers do NOT trigger quick actions
- **Agent control** - Agents decide when quick actions appear by emitting markers

## Implementation

**Removed:**
- 8 skipped `it.skip()` tests for pattern-based detection
- Dead test code for question detection heuristics
- Dead test code for numbered list detection

**Added:**
- 4 tests verifying plain questions/lists DON'T trigger quick actions
- Comprehensive tests for structured marker detection (HANDOFF, QUESTION, CHOICES)
- Detection strategy documentation in test file header

## Files Modified

| File | Change |
|------|--------|
| `packages/cyclist/tests/B-9.6-integration.test.ts` | Replaced dead tests with marker-only tests |

## Test Impact

- **Before:** 12 tests, 8 skipped
- **After:** 11 tests, 0 skipped
- **Full suite:** 2502 tests passing

## Lessons

1. Skipped tests should be deleted when the feature they test is intentionally removed
2. `it.skip()` accumulates as tech debt - either fix or delete
3. Detection strategy should be documented where tests live, not just in source code
