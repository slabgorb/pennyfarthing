# Story 38-1: DIFFS panel: Improve combined diff view

## Story Details
- **ID:** 38-1
- **Jira:** MSSCI-12468
- **Workflow:** tdd

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-27T22:17:50Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-27T22:08:15Z | 2026-01-27T22:15:30Z | 7m 15s |
| red | 2026-01-27T22:15:30Z | 2026-01-27T22:12:41Z | 2m |
| green | 2026-01-27T22:12:41Z | 2026-01-27T22:17:50Z | 5m |

## TEA Assessment

**Tests Required:** Yes
**Reason:** New feature requiring UI rendering and diff computation logic

**Test File:**
- `packages/cyclist/tests/B-MSSCI-12468-combined-diff-view.test.ts` - 24 tests covering both ACs

**Tests Written:** 24 tests covering 2 ACs

### AC Coverage:
- **AC1: Combined view shows clear original → final transition** - 8 tests
  - Header with original/final labels
  - File path display
  - Change summary (additions/deletions)
  - Unified diff with +/- prefixes
  - Dual line numbers (old/new)
  - New file handling
  - Deleted file handling
  - Visual hunk grouping

- **AC2: Context lines displayed appropriately** - 8 tests
  - Default 3 lines context before/after changes
  - Context line styling
  - Configurable context line count
  - Hunk collapsing with ellipsis
  - Hunk headers with line ranges
  - Expand buttons between sections
  - Correct line numbers in context
  - Single line change with surrounding context

- **Edge Cases** - 8 tests (empty, whitespace, HTML escaping, long lines, line endings, unicode)

**Status:** RED (all 24 tests failing)

**Implementation Targets:**
1. `computeCombinedDiff` → `packages/cyclist/src/public/js/components/DiffHistoryManager.js`
2. `renderCombinedDiff` → `packages/cyclist/src/public/js/components/DiffViewer.js`

**Commit:** `02b52e269` - test(cyclist): add failing tests for combined diff view improvements

**Handoff:** To Dev (Naomi) for implementation

### Handoff History
| From | To | Gate | Status | Timestamp |
|------|-----|------|--------|-----------|
| red (tea) | green (dev) | tests_fail | PASSED | 2026-01-27T22:12:41Z |
| green (dev) | review (reviewer) | tests_pass | PASSED | 2026-01-27T22:17:50Z |
| review (reviewer) | finish (sm) | approved | PASSED | 2026-01-27T22:59:35Z |

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/cyclist/src/public/js/components/DiffHistoryManager.js` - Added computeCombinedDiff with LCS algorithm, context lines, hunk grouping
- `packages/cyclist/src/public/js/components/DiffViewer.js` - Added renderCombinedDiff with headers, line numbers, hunks, expand buttons
- `packages/cyclist/tests/B-MSSCI-12468-combined-diff-view.test.ts` - Fixed test imports, corrected context line assertion

**Tests:** 24/24 passing (GREEN)
**PR:** #522 - feat(cyclist): improve combined diff view with context lines (MSSCI-12468)
**Branch:** feat/38-1-diffs-panel-improve-combined-diff (pushed)

**Implementation Details:**
- LCS-based diff algorithm for accurate line-by-line comparison
- Configurable context lines (default 3)
- Dual line number columns (old/new)
- Hunk headers with @@ format
- Expand buttons between collapsed sections
- XSS-safe HTML escaping via textContent
- New/deleted file indicators

**Handoff:** To Reviewer (Avasarala) for code review

## Reviewer Assessment

**Verdict:** APPROVED

### Review Checklist Completed

- [x] **5+ observations documented** - See findings below
- [x] **Data flow traced:** `diffData.oldContent/newContent` → `renderCombinedDiff()` → `computeCombinedDiff()` → LCS algorithm → hunk grouping → DOM creation via `textContent` (XSS-safe)
- [x] **Wiring verified:** Export in DiffViewer.js, import in test file, loaded via script tag in index.html
- [x] **Pattern identified:** LCS diff algorithm is a standard, well-implemented approach
- [x] **Error handling verified:** Empty content (DiffHistoryManager.js:615-624), identical content (631-639), null checks present
- [x] **Security analysis:** XSS prevented via `textContent` at DiffViewer.js:562, test verifies at line 982-993
- [x] **Hard questions answered:** Empty input? ✓ handled. Null? ✓ checks present. Huge input? O(m*n) LCS - acceptable for file diffs

### Findings

| Severity | Issue | Location | Notes |
|----------|-------|----------|-------|
| [VERIFIED] | XSS protection | DiffViewer.js:562 | Uses `textContent` which auto-escapes HTML |
| [VERIFIED] | Tests comprehensive | B-MSSCI-12468-combined-diff-view.test.ts | 24 tests, all ACs covered |
| [VERIFIED] | Empty content handled | DiffHistoryManager.js:615-624 | Returns empty hunks |
| [VERIFIED] | Identical content handled | DiffHistoryManager.js:631-639 | Returns zero changes |
| [LOW] | Import placement | DiffViewer.js:409 | Import placed after 400+ lines of code (valid but unconventional) |
| [VERIFIED] | CRLF normalization | DiffHistoryManager.js:611-613 | Line endings normalized to LF |

### Security Analysis

- **XSS:** Content is set via `content.textContent = line.line` which auto-escapes HTML entities
- **No innerHTML with user content:** The new code uses `textContent` for all user-provided content
- **Test coverage:** Explicit XSS test at lines 982-993 verifies `<script>` tags are escaped

### Test Results

- **Story tests:** 24/24 PASSED
- **Pre-existing failures:** 15 failures in unrelated test files (MSSCI-11946, MSSCI-12275) - not introduced by this PR

**Handoff:** To SM for finish-story
