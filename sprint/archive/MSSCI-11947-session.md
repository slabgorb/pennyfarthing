# Story MSSCI-11947: Hook Response Data Channel

## Story Overview

| Field | Value |
|-------|-------|
| Epic | 48 - WheelHub Notification Consolidation |
| Jira | MSSCI-11947 |
| Points | 5 |
| Priority | P1 |
| Workflow | tdd |
| Repos | cyclist |

## Technical Context

### Problem Statement

The current PreToolUse hook system only supports `allow/deny` decisions. For interactive tools like **AskUserQuestion** and **ExitPlanMode**, Claude needs to receive user-provided data (selected answers, custom input, plan approval feedback) - not just a boolean.

### Current Architecture

```
Claude Code                        Hook Script                         Cyclist
    │                                  │                                  │
    ├─ tool_use (AskUserQuestion) ────►│                                  │
    │                                  ├─ POST /approval-request ────────►│
    │                                  │                                  │
    │                                  │◄─ {decision: allow/deny} ────────┤
    │◄─ stdout: {permissionDecision} ──┤                                  │
    │                                  │                                  │
```

**Gap:** No mechanism to return structured data (user selections) back to Claude.

### Target Architecture

```
Claude Code                        Hook Script                         Cyclist
    │                                  │                                  │
    ├─ tool_use (AskUserQuestion) ────►│                                  │
    │   {questions: [...]}             │                                  │
    │                                  ├─ POST /approval-request ────────►│
    │                                  │   {toolName, input, toolId}      │
    │                                  │                                  │
    │                                  │            [User fills form]     │
    │                                  │                                  │
    │                                  │◄─ {decision, data: {answers}} ───┤
    │◄─ stdout: {updatedInput} ────────┤                                  │
    │   answers: {q0: "option1"}       │                                  │
```

**Solution:** Hook returns `updatedInput` with user-provided data, which Claude receives in the tool result.

### Key Files

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `src/hooks/cyclist-pretooluse-hook.js` | Hook script | Return `updatedInput` when data present |
| `src/main.ts` | Approval server | Extend response schema with `data` field |
| `src/public/js/components/ApprovalModal.js` | Frontend modal | Render form elements, capture selections |
| `src/preload.ts` | IPC bridge | Ensure data field passed through |

### Current Hook Response Format

```javascript
// cyclist-pretooluse-hook.js:165-178
function outputDecision(decision, reason, updatedInput = null) {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  };
  if (updatedInput) {
    output.hookSpecificOutput.updatedInput = updatedInput;  // Already supported!
  }
  console.log(JSON.stringify(output));
}
```

The hook already has `updatedInput` support - just need to wire it through.

### Approval Server Current Response

```typescript
// main.ts:1775-1778
pending.resolve({
  decision: approved ? 'allow' : 'deny',
  reason: approved ? `Approved by user (${grantScope || 'once'})` : 'Rejected by user',
});
```

Needs to add optional `data` field for user selections.

### AskUserQuestion Tool Schema

From Claude Code, the tool input looks like:
```json
{
  "questions": [
    {
      "question": "Which auth method?",
      "header": "Auth",
      "options": [
        {"label": "OAuth", "description": "Use OAuth 2.0"},
        {"label": "JWT", "description": "Use JWT tokens"}
      ],
      "multiSelect": false
    }
  ]
}
```

Expected output in tool result:
```json
{
  "answers": {
    "0": "OAuth"           // Single select
  }
}
```
Or for multiSelect:
```json
{
  "answers": {
    "0": ["OAuth", "JWT"]  // Multi select
  }
}
```

### ExitPlanMode Tool Schema

Input: `{}` (empty, plan already written to file)

Expected output:
```json
{
  "approved": true,
  "feedback": "Looks good, proceed with implementation"
}
```

## Technical Approach

### 1. Extend Response Schema (main.ts)

```typescript
interface ApprovalResponse {
  decision: 'allow' | 'deny';
  reason: string;
  data?: Record<string, unknown>;  // NEW: user-provided data
}
```

### 2. Modal Form Rendering (ApprovalModal.js)

For AskUserQuestion, render:
- Radio buttons for single select questions
- Checkboxes for multiSelect questions
- Text input for "Other" option
- Submit button captures all selections

For ExitPlanMode, render:
- Plan content display (read from plan file)
- Approve/Reject buttons
- Optional feedback textarea

### 3. Hook Data Passthrough (cyclist-pretooluse-hook.js)

```javascript
if (response.decision === 'allow') {
  // If data present, include as updatedInput
  const updatedInput = response.data ? { answers: response.data } : null;
  outputDecision('allow', response.reason, updatedInput);
}
```

## Acceptance Criteria

- [ ] `/approval-request` endpoint accepts and returns structured data payloads
- [ ] AskUserQuestion modal renders question options and captures user selection
- [ ] ExitPlanMode modal shows plan content and captures approval with optional feedback
- [ ] Hook response includes `data` field that Claude receives in tool result
- [ ] Existing allow/deny flows continue to work unchanged

## Testing Strategy

### Unit Tests
- Modal renders radio buttons for single-select questions
- Modal renders checkboxes for multi-select questions
- Form submission captures all selected values
- Hook correctly formats updatedInput from data field

### Integration Tests
- Full flow: tool_use → hook → modal → response → tool_result
- AskUserQuestion with single selection
- AskUserQuestion with multi selection
- AskUserQuestion with "Other" custom input
- ExitPlanMode with approval
- ExitPlanMode with rejection and feedback

## Dependencies & Risks

### Dependencies
- Existing approval gate infrastructure (Stories 22-3, 33-3)
- Hook script already supports updatedInput (line 165-178)

### Risks
1. **Modal complexity** - Multiple question types need different UI
2. **Data serialization** - Ensure JSON round-trips correctly through all layers
3. **Backward compatibility** - Existing Bash approval must continue working

### Mitigations
- Test each question type in isolation
- Add schema validation at each boundary
- Preserve existing code paths, add new ones alongside

---

## Test Cache

| Field | Value |
|-------|-------|
| Last Run | 2026-01-19T20:28:15Z |
| Git SHA | 06c33bf8 |
| Result | GREEN |
| Pass | 56 |
| Fail | 0 |
| Skip | 0 |
| Duration | 0.55s |

---

## Workflow Tracking

**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-19T12:36:34Z

### Phase History

| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-19T17:30:00Z | 2026-01-19T12:07:52Z | See note |
| red | 2026-01-19T12:07:52Z | 2026-01-19T19:15:00Z | 7h 7m 8s |
| green | 2026-01-19T19:15:00Z | 2026-01-19T12:36:34Z | 6h 38m |
| review | 2026-01-19T12:36:34Z (approx) | 2026-01-19T12:36:34Z | (Reviewer assessment time) |
| finish | 2026-01-19T12:36:34Z | - | - |

**Note:** Phase times are UTC.

---

## Handoff History

| Phase | Agent | Timestamp | Context % | Mode |
|-------|-------|-----------|-----------|------|
| red | TEA | 2026-01-19T19:15:00Z | 45% | TEA→Dev handoff |
| green | Dev | 2026-01-19T19:15:00Z | - | Awaiting Dev |
| review | Reviewer | 2026-01-19T12:36:34Z (approx) | 50-55% | Dev→Reviewer handoff |
| finish | SM | 2026-01-19T12:36:34Z | 65% | Reviewer→SM (auto, context HIGH) |

---

## Workflow (Legacy)

| Phase | Agent | Status | Timestamp |
|-------|-------|--------|-----------|
| Setup | SM | DONE | 2026-01-19 |
| Tests | TEA | DONE | 2026-01-19T19:15:00Z |
| Implementation | Dev | DONE | 2026-01-19T19:15:00Z |
| Review | Reviewer | DONE | 2026-01-19T12:36:34Z |
| Finish | SM | IN_PROGRESS | 2026-01-19T12:36:34Z |

**Status:** APPROVED_READY_FOR_FINISH

---

## TEA Assessment

**Tests Required:** Yes
**Reason:** This is a 5-point feature story implementing new functionality for interactive tool data channels.

**Test Files:**
- `packages/cyclist/tests/MSSCI-11947-hook-response-data-channel.test.ts` - Comprehensive test suite covering all 5 ACs

**Tests Written:** 56 tests covering 5 ACs
**Status:** RED (46 failing, 10 passing - backward compatibility tests pass)

### Test Coverage by AC

| AC | Tests | Description |
|----|-------|-------------|
| AC1 | 13 | `/approval-request` endpoint data payloads |
| AC2 | 15 | AskUserQuestion modal rendering and capture |
| AC3 | 11 | ExitPlanMode modal display and feedback |
| AC4 | 5 | Hook response `data` field passthrough |
| AC5 | 9 | Backward compatibility (10 passing) |
| Integration | 3 | Full end-to-end flows |

### Functions to Implement

**main.ts:**
- `resolveHookApprovalWithData(toolId, approved, grantScope?, data?)`
- `isInteractiveToolUse(toolUse)` - detect AskUserQuestion/ExitPlanMode
- `processInteractiveToolUse(toolUse)` - handle interactive tool approval flow
- `formatHookResponseWithData(decision, reason, data?)` - format response with optional data
- `formatUpdatedInputForAskUserQuestion(answers)` - format answers as updatedInput
- `formatUpdatedInputForExitPlanMode(response)` - format plan response
- `serializeApprovalData(data)` / `deserializeApprovalData(data)`

**ApprovalModal.js:**
- `renderAskUserQuestionForm(questions)` - render radio/checkbox form
- `getAskUserQuestionAnswers()` - collect form answers
- `getRenderedFormHtml()` - get current form HTML
- `selectOption(questionIndex, value)` - select an option
- `selectOtherOption(questionIndex)` - select "Other"
- `isOtherInputVisible(questionIndex)` - check if Other input shown
- `setOtherInput(questionIndex, value)` - set custom text
- `handleSubmitAskUserQuestion()` - submit with data
- `renderExitPlanModeForm(allowedPrompts)` - render plan approval form
- `getExitPlanModeResponse()` - get approval response with feedback
- `hasApprovePlanButton()` / `hasRejectPlanButton()` - check buttons exist
- `setPlanFeedback(text)` - set feedback textarea
- `handleApprovePlan()` / `handleRejectPlan()` - handle plan buttons

**cyclist-pretooluse-hook.js:**
- Wire `data` field from server response to `updatedInput` in hook output

**Handoff:** To Dev for implementation

---

## TEA Handoff Summary

**Date:** 2026-01-19T19:15:00Z
**Gate:** tests_fail
**Status:** PASS

### Pre-Flight Verification

✓ Tests are committed (commit: 06c33bf8)
✓ Tests are RED (46 failing, 10 passing)
✓ Assessment section written
✓ Git working tree clean

### Test Execution Summary

- **Total Tests:** 56
- **Failed:** 46 (all in new feature code - expected for RED phase)
- **Passed:** 10 (backward compatibility tests verify existing flows unchanged)
- **Skipped:** 75
- **Duration:** 34.72s
- **Timestamp:** 2026-01-19T19:14:30Z

### Implementation Notes for Dev

1. **Test Architecture:** Tests use mocking for modal, hook, and server components with isolated unit tests
2. **Key Functions Needed:** See "Functions to Implement" section - prioritize `processInteractiveToolUse()`, `formatHookResponseWithData()`, and modal rendering methods
3. **Schema Extension:** Main.ts ApprovalResponse interface needs optional `data` field
4. **Backward Compatibility:** All 10 existing approval flow tests passing - ensure this continues

### Ready for Dev

All gate conditions met. Ready to transition to GREEN phase (implementation).

---

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/cyclist/src/main.ts` - Added 8 functions for interactive tool handling (isInteractiveToolUse, processInteractiveToolUse, resolveHookApprovalWithData, formatHookResponseWithData, formatUpdatedInputForAskUserQuestion, formatUpdatedInputForExitPlanMode, serializeApprovalData, deserializeApprovalData)
- `packages/cyclist/src/public/js/components/ApprovalModal.js` - Added form rendering and state management for AskUserQuestion and ExitPlanMode (renderAskUserQuestionForm, renderExitPlanModeForm, selectOption, selectOtherOption, setOtherInput, handleSubmitAskUserQuestion, handleApprovePlan, handleRejectPlan, etc.)
- `packages/cyclist/src/hooks/cyclist-pretooluse-hook.js` - Wired data field through to updatedInput for Claude

**Tests:** 56/56 passing (GREEN)
**PR:** #353 - feat(MSSCI-11947): Hook response data channel for interactive tools
**Branch:** feat/48-6-hook-response-data-channel (pushed)

**Handoff:** To Reviewer for code review

---

## Reviewer Assessment

**PR:** #353
**Verdict:** APPROVED

**Code Review Evidence:**

- **Data flow traced:** User selection from `selectedAnswers`/`otherInputValues` (ApprovalModal.js:718-723) → `handleSubmitAskUserQuestion()` → `responseCallback()` → IPC → `resolveHookApprovalWithData()` (main.ts:1829-1844) → Promise resolve → hook `outputDecision()` with `updatedInput`. Safe - all paths through controlled code.

- **Pattern observed:** Follows existing `handleHookApprovalRequest` pattern at main.ts:1718-1750. Clean separation of form rendering (pure functions) and state management (module-level variables).

- **Error handling:** `escapeHtml()` handles null (line 945-946). `resolveHookApprovalWithData` silently ignores unknown toolIds (matches existing pattern). Hook has ECONNREFUSED fallback.

**Security:** XSS prevention via `escapeHtml()` on all user-provided content at render time (lines 671-682). No auth changes. Data serialized to JSON, not executed.

**Performance:** O(n) rendering where n = questions (expected small). No N+1 patterns.

**Minor Observations (non-blocking):**
- `pendingHookApprovals` lacks timeout cleanup (pre-existing, not introduced)
- `serializeApprovalData`/`deserializeApprovalData` are thin wrappers (acceptable for testability)

**Handoff:** To SM for finish-story workflow

---

## Reviewer Handoff Summary

**Date:** 2026-01-19T12:36:34Z
**Gate:** approval
**Status:** PASS

### Pre-Flight Verification

✓ Reviewer Assessment section exists
✓ Verdict is APPROVED
✓ PR #353 reviewed and approved

### Handoff Details

**Verdict:** APPROVED
**Status Update:** Workflow complete, ready for SM finish phase
**Next Phase:** finish (SM)
**PR:** #353 - feat(MSSCI-11947): Hook response data channel for interactive tools

Ready for SM to finalize story completion.
