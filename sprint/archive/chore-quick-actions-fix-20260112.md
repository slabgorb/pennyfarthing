# Quick Actions Fix - Dev Session

## Status
- **Phase:** Review
- **Status:** APPROVED (ready for SM finish)
- **Started:** 2026-01-12
- **Next Agent:** SM (Hawkeye Pierce) - finish-story workflow
- **Handoff Date:** 2026-01-12
- **Review Complete:** 2026-01-12

## Problem Statement

The quick actions button detection in Cyclist is flaky. Sometimes wrong buttons appear, sometimes correct buttons don't appear.

## Root Cause Analysis

**Found:** The system has two detection mechanisms that conflict:

1. **Marker-based detection** (`<!-- CYCLIST:HANDOFF:/agent -->`) - 100% accurate, intentional
2. **Pattern-based detection** (regex on "shall I", "ready for review", etc.) - heuristic, causes false positives

**The flakiness comes from:**
1. SDK streams multiple `assistant` messages during response generation
2. Each streaming message triggers `processMessageForQuickActions()` (line 84-89 in message-view-init.js)
3. Early messages have partial content - no markers yet
4. Pattern detection runs on incomplete text, may show wrong buttons
5. When final message arrives with marker, UI may already have wrong state

## Decision

**Lean into markers, disable pattern detection.**

Rationale:
- Markers are 100% reliable (Claude puts them intentionally)
- Pattern detection causes the flakiness
- We control agent output - ensure all agents emit markers
- Simpler code, no confidence scoring needed
- No false positives possible with markers

## Implementation Plan

### Phase 1: Simplify quick-actions.js

1. Modify `processMessageForQuickActions()` to ONLY use marker detection
2. Remove or comment out:
   - `detectHandoffPattern()` call
   - `detectListChoices()` call
   - `detectQuestionPattern()` call
3. Keep the functions for potential future opt-in use
4. Remove confidence threshold logic (markers are always 1.0)

### Phase 2: Fix timing issue

1. In `message-view-init.js`, move quick action processing from `onMessage` to `onComplete`
2. Store accumulated text content during streaming
3. Process markers only when turn is complete

### Phase 3: Verify agent markers

1. Audit all agents to ensure they emit `<!-- CYCLIST:HANDOFF:/agent -->` markers
2. Key files to check:
   - `.claude/agents/sm.md` - handoff to TEA/Dev
   - `.claude/agents/tea.md` - handoff to Dev
   - `.claude/agents/dev.md` - handoff to Reviewer
   - `.claude/agents/reviewer.md` - handoff to SM

## Files to Modify

| File | Change |
|------|--------|
| `packages/cyclist/src/public/js/components/message-view/quick-actions.js` | Simplify to markers-only |
| `packages/cyclist/src/public/js/message-view-init.js` | Move processing to onComplete |

## Tests to Update

- `tests/25-5-structured-markers.test.ts` - Keep, this is the correct behavior
- `tests/25-3-handoff-detection.test.ts` - May need to mark as skipped or remove
- `tests/B-9.6-list-choices.test.ts` - May need to mark as skipped or remove
- `tests/25-4-universal-yes-proceed.test.ts` - May need to mark as skipped or remove

## Acceptance Criteria

- [x] Only CYCLIST markers trigger quick action buttons
- [x] Pattern-based detection disabled (no false positives)
- [x] Handoff buttons appear reliably when agents emit markers
- [x] No buttons appear on partial/streaming messages
- [x] Existing marker tests pass
- [x] Build succeeds

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/cyclist/src/public/js/components/message-view/quick-actions.js` - Simplified to markers-only detection
- `packages/cyclist/src/public/js/message-view-init.js` - Moved processing to onComplete, track last assistant message
- `packages/cyclist/tests/25-3-handoff-detection.test.ts` - Skipped pattern tests, added marker test
- `packages/cyclist/tests/25-4-universal-yes-proceed.test.ts` - Skipped pattern test, added marker test
- `packages/cyclist/tests/25-5-structured-markers.test.ts` - Skipped fallback test, added null result test
- `packages/cyclist/tests/B-9.6-integration.test.ts` - Skipped pattern tests, updated to markers-only

**Tests:** 2017/2017 passing (GREEN) - 122 intentionally skipped
**PR:** #200 - fix(cyclist): disable pattern detection for markers-only quick actions
**Branch:** fix/quick-actions-markers-only (pushed)

**Handoff:** To Reviewer for code review

## Context

- Epic 25 (Smart Question Detection) delivered the pattern system
- Story 25-5 added structured markers as the "reliable" path
- This fix completes the migration to markers-only

## Workflow

| Timestamp | Agent | Action |
|-----------|-------|--------|
| 2026-01-12 | Dev (Colonel Potter) | Diagnosed issue, wrote this handoff |
| 2026-01-12 | Dev (Colonel Potter) | Implemented fix, PR #200 ready |
| 2026-01-12 | Handoff Assistant | Verified quality gates and handoff |
| 2026-01-12 | Reviewer (Granny Weatherwax) | Code review complete, APPROVED |
| 2026-01-12 | Handoff Assistant | Completed reviewer handoff, ready for SM finish-story workflow |

## Reviewer Handoff

**Handoff to:** Granny Weatherwax (Reviewer)

**Repository:** pennyfarthing-2
**Branch:** fix/quick-actions-markers-only
**PR:** #200 - https://github.com/keithavery/pennyfarthing-2/pull/200

**Key Files Changed:**
- `packages/cyclist/src/public/js/components/message-view/quick-actions.js` - Simplified to markers-only detection
- `packages/cyclist/src/public/js/message-view-init.js` - Moved processing to onComplete
- `packages/cyclist/tests/25-3-handoff-detection.test.ts` - Updated tests
- `packages/cyclist/tests/25-4-universal-yes-proceed.test.ts` - Updated tests
- `packages/cyclist/tests/25-5-structured-markers.test.ts` - Updated tests
- `packages/cyclist/tests/B-9.6-integration.test.ts` - Updated tests

**What Was Implemented:**
1. Disabled pattern-based quick action detection (regex heuristics)
2. Kept marker-based detection only (CYCLIST:HANDOFF comments)
3. Fixed timing issue by moving processing from onMessage to onComplete
4. Prevents buttons from appearing during streaming/partial messages
5. All 2017 tests passing, 122 intentionally skipped

**Quality Checks:**
- Type Check: PASS (tsc --noEmit)
- Tests: PASS (2017/2017 passing)
- Lint: Unable to run (missing eslint package - not a code issue)
- Git: Clean working tree, changes pushed to remote

**Review Focus:**
- Does marker-only approach solve the flakiness?
- Are the timing changes correct (onComplete vs onMessage)?
- Should any of the skipped tests be re-enabled?
- Are there edge cases with streaming responses?

## Notes

- This is a chore/bugfix, not a new story
- Can be done without TDD - simplifying existing code
- Tests exist for marker detection already
- Lint failure is environmental (missing eslint), not code-related

## Reviewer Assessment

**PR:** #200
**Verdict:** APPROVED

**Code Review Evidence:**

- **Data flow traced:** `message.message.content` from SDK → concatenation at `quick-actions.js:604-607` → `detectStructuredMarkers()` at line 613 → marker regex at line 185 → safe result object. All inputs properly guarded with null checks.

- **Pattern observed:** Marker regex `/<!--\s*CYCLIST:(\w+):([^>]+?)\s*-->/gi` at `quick-actions.js:185` uses non-greedy match preventing runaway captures. Code block stripping at line 180 correctly prevents false positives from example markers.

- **Error handling:** Proper guards at lines 598, 602, 609, 614-617. The `onComplete` handler correctly clears `lastAssistantMessage` at line 110 after processing.

- **Timing change verified:** Moving processing from `onMessage` to `onComplete` is the correct fix. Streaming messages have partial content; waiting for completion ensures full text analysis.

**Security:** N/A - no auth changes, no user input handling changes, no data exposure changes.

**Performance:** No performance concerns. The change reduces processing (from pattern+marker to marker-only) and moves it to a less frequent event (completion vs every streaming chunk).

**Minor Observations (non-blocking):**
- `lastAssistantMessage` not cleared in `onError` handler (`message-view-init.js:114`). This is acceptable since errors don't necessarily invalidate the message, but could be noted for future consideration.
- Pattern detection functions remain exported but unused in main flow. Acceptable for potential future re-enablement.

**Test Coverage:**
- New tests added for marker-only behavior
- Pattern-based tests properly skipped with documentation explaining rationale
- 2017/2017 tests GREEN

**Handoff:** To Hawkeye Pierce (SM) for finish-story workflow
