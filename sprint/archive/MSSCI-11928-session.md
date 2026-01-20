# Story MSSCI-11928: Persistent Bash output in message stream

## Story Details
- **ID:** MSSCI-11928
- **Jira:** MSSCI-11928
- **Title:** Persistent Bash output in message stream (not transient popup)
- **Points:** 3
- **Priority:** P1
- **Workflow:** tdd
- **Repos:** cyclist
- **Assignee:** Keith Avery

## Acceptance Criteria
- [x] Bash tool_result messages added to message stream (not just popup)
- [x] Collapsible section shows command in header
- [x] Exit code badge shows success (green) or error (red)
- [x] Output preserved with ANSI color support
- [x] Collapsed by default, expandable on click

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-19T06:00:44Z
**Status:** approved

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-19T06:35:00Z | 2026-01-19T06:45:00Z | 10m |
| red | 2026-01-19T06:45:00Z | 2026-01-19T06:50:00Z | 5m |
| green | 2026-01-19T06:50:00Z | 2026-01-19T07:00:00Z | 10m |
| review | 2026-01-19T07:00:00Z | 2026-01-19T06:00:44Z | 1h 0m |

## Context

See: `.session/context-story-MSSCI-11928.md`

## Technical Summary

MSSCI-11851 built the collapsible Bash renderer infrastructure, but it's not being used because:

1. **SDK message structure:** Tool results come wrapped in `user` messages:
   ```javascript
   {type: 'user', message: {content: [{type: 'tool_result', tool_use_id: '...', content: '...'}]}}
   ```

2. **Current filtering:** `renderUserMessage()` at `message-renderers.js:496-498` explicitly skips these:
   ```javascript
   if (message.message?.content) {
     return '';  // Tool result from SDK - skip it
   }
   ```

3. **Enrichment exists:** `message-enrichment.js` already enriches `tool_result` messages with `tool_name: 'Bash'`, `bash_command`, and `bash_exit_code` - but only for direct `tool_result` messages, not SDK-wrapped ones.

4. **Renderer exists:** `renderBashToolResult()` at `message-renderers.js:328-355` is fully implemented with collapsible `<details>` element, ANSI color support, and exit code badges.

## Technical Approach

**Option 1: Extract tool_result from user messages**
- Modify `renderUserMessage()` to detect SDK-wrapped tool_result content
- Extract and enrich each tool_result block
- Return combined HTML from `renderToolResultMessage()` for each

**Option 2: Pre-process in message-view-init**
- Before calling `addMessage()`, detect user messages with tool_result content
- Extract and emit separate `tool_result` messages for each block
- Let existing enrichment and rendering handle them

**Recommended: Option 2** - Cleaner separation of concerns, enrichment already handles Bash detection, doesn't modify renderer logic.

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `packages/cyclist/src/public/js/message-view-init.js` | Edit | Extract tool_result from user messages before addMessage |
| `packages/cyclist/src/public/js/message-enrichment.js` | Verify | May need adjustment if SDK wrapping differs |
| `packages/cyclist/tests/B-11928-*.test.ts` | Create | TDD tests for the new behavior |

## Dependencies
- Existing `renderBashToolResult()` renderer (MSSCI-11851)
- Existing `enrichMessage()` function
- Existing CSS for `.bash-output`, `.bash-header`, `.ansi-*` classes

## TEA Assessment

**Tests Required:** Yes
**Reason:** AC explicitly requires UI behavior changes - extract and render tool_result from SDK user messages

**Test Files:**
- `packages/cyclist/tests/B-11928-persistent-bash-output.test.ts` - 25 tests covering all 5 ACs

**Tests Written:** 25 tests covering 5 ACs
- AC1: 6 tests - `extractToolResultsFromUserMessage` function (NEW - must be implemented)
- AC2: 2 tests - Command in collapsible header
- AC3: 4 tests - Exit code badge styling
- AC4: 5 tests - ANSI color support and HTML escaping
- AC5: 4 tests - Collapsed by default, verbose mode expansion
- Integration: 4 tests - End-to-end enrichment and rendering

**Status:** RED (6 failing, 19 passing - ready for Dev)

**What Dev Must Implement:**
1. Add `extractToolResultsFromUserMessage()` function to `message-view-init.js`
2. Modify the `onMessage` handler to:
   - Detect SDK user messages with `tool_result` content
   - Extract each `tool_result` block as standalone message
   - Enrich and add to message stream
3. Export the new function for testing

**Handoff:** To Dev for implementation

## TEA Handoff Summary

**Gate:** tests_fail - PASSED

**Test Status:**
- Tests committed: c7922d24
- Tests RED: 6 failing (AC1 - new function doesn't exist)
- Tests GREEN: 19 passing (AC2-5 - existing renderer infrastructure)

**Ready for Dev:** Implementation of `extractToolResultsFromUserMessage` function

## Handoff History

| Phase | Agent | Timestamp | Mode |
|-------|-------|-----------|------|
| red | tea | 2026-01-19T05:37:33Z | handoff |
| green | dev | 2026-01-19T06:50:00Z | handoff |
| review | reviewer | 2026-01-19T07:00:00Z | handoff |
| finish | sm | 2026-01-19T06:00:44Z | approved |

## GREEN Phase Summary

**All 25 tests PASSING**

### Implementation Complete
The Dev phase successfully implemented the required functionality:

1. **Function Implementation:** `extractToolResultsFromUserMessage()` exported from `message-view-init.js`
   - Extracts SDK-wrapped tool_result messages from user message wrappers
   - Returns array of tool_result objects with proper structure
   - Handles edge cases: non-user messages, editor messages without SDK content

2. **Message Stream Integration:** Modified `onMessage` handler
   - Detects SDK-wrapped tool_result in user messages
   - Extracts and enriches each tool_result as standalone message
   - Adds extracted messages to message stream (not just popup)
   - Prevents rendering of wrapper user message

3. **Test Environment Fix:** Fixed module initialization
   - Modified `message-view-init.js` to check for DOM element before initializing
   - Allows tests to import the module without DOM-related errors
   - Maintains production functionality

### Test Results
- **Total Tests:** 25
- **Passed:** 25 (100%)
- **Failed:** 0
- **Status:** GREEN

**Test Coverage by AC:**
- AC1 (6 tests): Extract tool_result from SDK messages - PASSING
- AC2 (2 tests): Command in collapsible header - PASSING
- AC3 (4 tests): Exit code badge styling - PASSING
- AC4 (5 tests): ANSI color support - PASSING
- AC5 (4 tests): Collapsed by default - PASSING
- Integration (4 tests): End-to-end enrichment/rendering - PASSING

### Key Changes
**File:** `/Users/keithavery/Projects/pennyfarthing/packages/cyclist/src/public/js/message-view-init.js`

1. Exported `extractToolResultsFromUserMessage()` function (lines 43-64)
2. Fixed module initialization check (lines 67-73) to verify DOM element exists before running
3. Integrated extraction in message handler (lines 120-131)

**No breaking changes** - Implementation fully backward compatible with existing code.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/cyclist/src/public/js/message-view-init.js` - Added `extractToolResultsFromUserMessage()` export, integrated extraction in onMessage handler, fixed DOM initialization guard

**Tests:** 25/25 passing (GREEN)
**PR:** #346 - feat(MSSCI-11928): persistent Bash output in message stream
**Branch:** feat/MSSCI-11928-persistent-bash-output (pushed)

**Handoff:** To Reviewer for code review

## Reviewer Handoff

**Gate:** tests_pass - PASSED

**Pre-Flight Verification:**
- Quality gates: PASSED (25/25 MSSCI-11928 tests passing, lint/type checks pass)
- Git working tree: Clean (no uncommitted changes related to MSSCI-11928)
- Changes pushed: Yes - feat/MSSCI-11928-persistent-bash-output branch pushed
- PR status: OPEN - #346 ready for review

**Implementation Summary:**
The Dev phase successfully implemented persistent Bash output in the message stream. Two files changed:
1. `packages/cyclist/src/public/js/message-view-init.js` (59 lines added/modified)
   - Exported `extractToolResultsFromUserMessage()` function to extract SDK-wrapped tool_result messages
   - Integrated extraction in message handler to process tool_result blocks as standalone messages
   - Fixed module initialization guard to prevent DOM errors during testing

2. `packages/cyclist/tests/B-11928-persistent-bash-output.test.ts` (509 lines added)
   - 25 comprehensive tests covering all 5 acceptance criteria
   - AC1: Extract tool_result from SDK messages (6 tests)
   - AC2: Command in collapsible header (2 tests)
   - AC3: Exit code badge styling (4 tests)
   - AC4: ANSI color support (5 tests)
   - AC5: Collapsed by default (4 tests)
   - Integration tests (4 tests)

**Key Review Points:**
- Implementation extracts SDK-wrapped tool_result from user messages before rendering
- All 25 tests passing - no new failures introduced
- No breaking changes to existing functionality
- Maintains backward compatibility

**Ready for:** Reviewer code review

## Reviewer Assessment

**PR:** #346
**Verdict:** APPROVED

**Code Review Evidence:**
- **Data flow traced:** SDK message at `message-view-init.js:83` → `extractToolResultsFromUserMessage()` extracts `tool_result` blocks → `enrichMessage()` adds metadata → `addMessage()` → `renderToolResultMessage()` → `renderBashToolResult()` produces collapsible HTML (safe - escapes before render)
- **Pattern observed:** Follows existing `enrichMessage()` delegation pattern at `message-enrichment.js:48-70`. New extraction function matches project style with guard clauses and early returns.
- **Error handling:** `truncateCommand()` at `message-renderers.js:117` guards null with `if (!command) return ''`. Extraction function returns `[]` for invalid input at lines 45-52.

**Security:** XSS protection verified:
- `escapeHtml()` at `markdown-parser.js:28-37` escapes `&`, `<`, `>`, `"`, `'`
- `renderBashToolResult()` line 340 escapes output BEFORE ANSI conversion
- Command double-escaped at line 349: `escapeHtml(displayCommand)`
- Test at `B-11928-persistent-bash-output.test.ts:315-332` explicitly verifies XSS protection

**Performance:** No concerns - single pass extraction with filter/map at lines 56-63

**Minor Observations (non-blocking):**
- DOM check at line 67 `document.getElementById('message-view')` differs from previous pattern but intentionally allows test imports

**Handoff:** To SM (The Mad Hatter) for finish-story workflow

## Approval Gate Summary

**Gate Type:** approval
**Verdict:** APPROVED
**Assessment:** Reviewer Assessment exists with explicit APPROVED verdict
**PR:** #346 - feat(MSSCI-11928): persistent Bash output in message stream
**Code Quality:** PASSED - all 25 tests passing, security verified, patterns followed

**Security Review Completed:**
- XSS protection verified in `renderBashToolResult()` - output escaped before ANSI conversion
- Command escaping verified at line 349 - double-escaped with `escapeHtml()`
- `escapeHtml()` function in `markdown-parser.js` properly escapes &, <, >, ", '
- Test coverage includes explicit XSS protection test

**Data Flow Verified:**
- SDK message → `extractToolResultsFromUserMessage()` → `enrichMessage()` → `renderToolResultMessage()` → `renderBashToolResult()` (safe rendering)
- Pattern follows existing project delegation model

**Ready for SM:** Story completion (finish phase)

## Work Log
- SM: Story setup complete, technical context written
- TEA: Wrote 25 failing tests covering all 5 ACs. AC1 tests fail because extractToolResultsFromUserMessage doesn't exist. Committed c7922d24.
- Dev: Implemented extractToolResultsFromUserMessage function and fixed module initialization. All 25 tests now PASSING.
- Testing-Runner: Verified GREEN state - all tests passing, no failures
- Dev: Created PR #346, committed cbc69285, ready for Reviewer
- Handoff: Dev→Reviewer transition complete - all gates passed, ready for code review
- Reviewer: Code review APPROVED - security verified, patterns followed, no critical/major issues
- Handoff: Reviewer→SM transition complete - approval gate PASSED, ready for story finish
