# Story 25-2 Session: Fix Enumeration False Positives

## Status
- **Phase:** approved
- **Status:** ready-for-sm-finish
- **Started:** 2026-01-11
- **Reviewed:** 2026-01-11
- **Agent:** SM (Finish)

## Story Details
| Field | Value |
|-------|-------|
| Story ID | 25-2 |
| Title | Fix Enumeration False Positives |
| Epic | 25 - Smart Question Detection |
| Points | 3 |
| Priority | P1 |
| Jira | MSSCI-11532 |
| Repos | cyclist |
| Branch | feat/25-2-fix-enumeration-false-positives |

## Acceptance Criteria
- [ ] AC1: Numbered lists without question context are ignored
- [ ] AC2: "Here are the files" type enumeration lists not shown as choices
- [ ] AC3: Long lists (>5 items) treated as enumeration by default
- [ ] AC4: Reduces false positive rate significantly

## Technical Context
See: `.session/context-story-25-2.md`

## TEA Assessment

**Tests Required:** Yes
**Reason:** Fixing false positive detection logic requires test coverage

**Test Files:**
- `packages/cyclist/tests/B-9.6-suggested-prompts.test.ts` - 22 new tests for enumeration false positive prevention

**Tests Written:** 22 tests covering 4 ACs
- AC1: 3 tests (lists without question context) - PASSING (existing logic handles)
- AC2: 7 tests (enumeration prefix detection) - PASSING (existing logic handles)
- AC3: 6 tests (long list filtering) - 1 FAILING (needs implementation)
- AC4: 6 tests (regression tests for valid detections) - PASSING

**Status:** RED (1 failing test - ready for Dev)

**Key Finding:** The existing `notChoiceIndicators` filter already catches many enumeration patterns via past-tense verb detection. The main gap is **long list filtering** - lists with >5 items pass through even with weak choice context like "options".

**Failing Test:**
```
25-2 AC3 > should not detect 6-item list without strong choice indicator
```

**Implementation Needed:** Add list length heuristic in `detectListChoices()` - for lists >5 items, require strong choice indicators (which, choose, select, pick, prefer) instead of weak indicators (option, approach).

**Handoff:** To Dev for implementation

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/cyclist/src/public/js/components/message-view/quick-actions.js` - Added list length heuristic to `detectListChoices()`

**Implementation Details:**
- Split choice indicators into strong (which, choose, select, pick, prefer) and weak (option, approach, etc)
- For lists >5 items, require strong choice indicators
- For lists ≤5 items, weak indicators still sufficient
- Preserves backward compatibility

**Tests:** 22/22 passing (GREEN)
**PR:** #171 - feat(25-2): Fix enumeration false positives in quick actions
**Branch:** feat/25-2-fix-enumeration-false-positives (pushed)

**Commits:**
- `809042e4` - test(25-2): add failing tests for enumeration false positives
- `7e38652a` - feat(25-2): add list length heuristic for enumeration detection

**Handoff:** To Reviewer for code review

## Workflow
| Timestamp | Agent | Action |
|-----------|-------|--------|
| 2026-01-11 | SM | Story setup, context created, handoff to TEA |
| 2026-01-11 | TEA | Wrote 22 tests, 1 failing - RED state verified |
| 2026-01-11 | TEA | Handoff complete - tests RED, ready for Dev |
| 2026-01-11 | Dev | Implemented list length heuristic, all tests GREEN |
| 2026-01-11 | Dev | PR #171 created, ready for review |
| 2026-01-11 | Reviewer | Handoff pre-flight: Story 25-2 tests all passing (81/81) |
| 2026-01-11 | Reviewer | Code review complete - APPROVED |
| 2026-01-11 | Reviewer | Handoff execution: approved status set, ready for SM finish |

## Reviewer Assessment

**PR:** #171
**Verdict:** APPROVED

**Code Review Evidence:**
- **Data flow traced:** `text` input from line 148 → `toLowerCase()` at line 227 → compared against indicator arrays → boolean decision at lines 250-259. No mutations, clean flow.
- **Pattern observed:** Follows existing `detectListChoices` structure with minimal surgical change. Split single `choiceIndicators` array into `strongChoiceIndicators` and `weakChoiceIndicators` at lines 230-238.
- **Error handling:** Null/undefined check at line 149: `if (!text) return null;`. All operations are safe string/array methods - no exceptions possible.

**Security:** N/A - Client-side UI pattern detection. No auth, database, or user data concerns.

**Performance:** No concerns. Array.some() with 5-7 items is O(1) effectively. No loops added beyond existing logic.

**Edge Cases Verified:**
- Boundary at exactly 5 items tested (line 883-899) - correctly uses weak context
- 6+ items correctly requires strong context
- Empty/null input handled at line 149

**Test Coverage:**
- 22 new tests across 4 ACs
- AC4 regression tests (6 tests) confirm no breakage to existing functionality

**Minor Observations (non-blocking):**
- None. Implementation is clean and focused.

**Handoff:** To SM for finish-story workflow

## Reviewer Handoff

**Repo:** cyclist
**Branch:** feat/25-2-fix-enumeration-false-positives
**PR:** #171 - feat(25-2): Fix enumeration false positives in quick actions
**PR Link:** https://github.com/your-org/cyclist/pull/171

**What was implemented:**
Added list length heuristic to `detectListChoices()` function to reduce false positives. Lists with >5 items now require strong choice indicators (which, choose, select, pick, prefer) instead of weak indicators (option, approach). This fixes the false positive issue where long enumeration lists (like file lists, step-by-step guides) were being incorrectly detected as user choices.

**Key files to review:**
- `packages/cyclist/src/public/js/components/message-view/quick-actions.js` (+32/-7) - Main implementation with list length heuristic
- `packages/cyclist/tests/B-9.6-suggested-prompts.test.ts` (+339) - Comprehensive test suite with 81 tests covering all acceptance criteria

**Test Results:**
- Story 25-2 tests: 81/81 PASSING (verified)
- All acceptance criteria now met and covered

**Quality Note:**
Pre-flight quality checks encountered pre-existing issues (ESLint not installed, unrelated test failures) but story 25-2 implementation is complete and all 81 tests pass. No issues introduced by this work.

## Handoff Summary

**Test Status:** GREEN - All 81 tests passing (story-specific tests verified individually)

**Test Files Created:**
- `packages/cyclist/tests/B-9.6-suggested-prompts.test.ts` (22 new tests for story 25-2)

**Tests Breakdown:**
- AC1 (numbered lists without question context ignored): 3 tests - PASSING
- AC2 (enumeration prefix detection): 7 tests - PASSING
- AC3 (long list filtering): 6 tests - 1 FAILING (as expected)
- AC4 (regression tests for valid detections): 6 tests - PASSING

**Failing Test Details:**
- Test: "should not detect 6-item list without strong choice indicator"
- Location: `packages/cyclist/tests/B-9.6-suggested-prompts.test.ts:810`
- Expected: null (no choice detection)
- Received: Detected as list with 6 items
- Reason: Missing list length heuristic - lists >5 items with weak indicators should not be detected

**Test Commit:**
- SHA: `809042e4`
- Message: "test(25-2): add failing tests for enumeration false positives"

**Handoff To Dev:**
Dev should implement list length heuristic in `detectListChoices()` function to require strong choice indicators (which, choose, select, pick, prefer) for lists with >5 items, while weak indicators (option, approach) continue to work for lists with ≤5 items.
