# Story MSSCI-12128: Error handling with actionable messages

## Story Details
- **ID:** MSSCI-12128
- **Title:** Error handling with actionable messages
- **Epic:** MSSCI-12122 (VS Code Extension UX/UI Pass)
- **Points:** 2
- **Jira:** MSSCI-12128
- **Workflow:** tdd
- **Assignee:** Keith Avery

## Acceptance Criteria
- [ ] AC1: Network/connectivity errors show "Check internet connection" guidance
- [ ] AC2: Auth errors suggest "Verify Claude Pro/Max subscription"
- [ ] AC3: CLI process errors suggest "Try reinstalling pennyfarthing"
- [ ] AC4: Each error type includes a specific, actionable next step
- [ ] AC5: Error messages render cleanly in VS Code chat UI

## Technical Context
See: `.session/context-story-MSSCI-12128.md`

## TEA Assessment

**Tests Required:** Yes
**Reason:** New error handling functionality with 5 ACs covering classification and formatting

**Test Files:**
- `packages/vscode-extension/tests/MSSCI-12128-error-handler.test.ts` - 47 tests for error classification, formatting, and chat UI integration

**Tests Written:** 47 tests covering 5 ACs
**Status:** RED (failing - ready for Dev)

**Test Categories:**
| Category | Tests | ACs Covered |
|----------|-------|-------------|
| Error Classification | 16 | AC1-AC4 |
| Network Messages | 9 | AC1 |
| Auth Messages | 3 | AC2 |
| Process Messages | 3 | AC3 |
| Actionable Steps | 7 | AC4 |
| Chat UI Formatting | 10 | AC5 |
| Integration | 6 | All |

**Expected Implementation:**
- File: `packages/vscode-extension/src/adapters/error-handler.ts`
- Exports: `classifyError()`, `formatErrorMessage()`, `getActionableSteps()`, `createErrorResponse()`, `handleChatError()`

**Handoff:** To Dev (Ponder Stibbons) for implementation

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/vscode-extension/src/adapters/error-handler.ts` - Error classification and formatting module (269 lines)
- `packages/vscode-extension/src/providers/chat-participant.ts` - Wired handleChatError() into catch block

**Exports:**
| Function | Purpose |
|----------|---------|
| `classifyError()` | Pattern-match errors to types |
| `formatErrorMessage()` | Markdown with emoji + numbered steps |
| `getActionableSteps()` | Type-specific recovery suggestions |
| `createErrorResponse()` | Chat stream wrapper with newlines |
| `handleChatError()` | Main entry point |

**Tests:** 50/50 passing (GREEN)
**PR:** #440 - feat(MSSCI-12128): Error handling with actionable messages
**Branch:** feat/MSSCI-12128-error-handling-actionable-messages (pushed)

**Self-Review Checklist:**
- [x] Code follows project patterns (matches response-formatter.ts style)
- [x] All acceptance criteria met
- [x] Tests passing (not skipped)
- [x] No console.log or debug code
- [x] Error handling implemented (handles null/undefined/string inputs)
- [x] HTML escaping for security (prevents XSS)
- [x] Message truncation for chat display
- [x] Code wired to chat-participant.ts (CRITICAL fix)

**Reviewer Feedback Addressed:**
| Issue | Severity | Fix |
|-------|----------|-----|
| Module not integrated | CRITICAL | Added import and `handleChatError()` call in chat-participant.ts:146 |
| Truncation after escaping | MEDIUM | Swapped order at error-handler.ts:219-220 |
| `/invalid/i` too broad | MEDIUM | Added `/invalid\s+token/i` to auth patterns at error-handler.ts:61 |
| Missing rate-limit patterns | LOW | Added `/\b429\b/` and `/rate\s*limit/i` at error-handler.ts:51,56 |

**New Tests Added:**
- `should classify 429 rate limit as auth error`
- `should classify "rate limit" message as auth error`
- `should classify "invalid token" as auth error`

**Handoff:** To Reviewer (Granny Weatherwax) for re-review

## Reviewer Assessment (Round 1)

**PR:** #440
**Verdict:** REJECTED

**Issues Found:**

| Severity | Issue | Location | Fix Required |
|----------|-------|----------|--------------|
| [CRITICAL] | Module not integrated | `chat-participant.ts` (unchanged) | Import `handleChatError` and use in catch block |
| [MEDIUM] | Truncation after escaping | `error-handler.ts:219-220` | Truncate BEFORE escaping |
| [MEDIUM] | `/invalid/i` pattern too broad | `error-handler.ts:74` | Add `/invalid\s+token/i` to auth |
| [LOW] | Missing rate-limit patterns | `error-handler.ts:31-70` | Add 429 and rate limit patterns |

**Handoff:** Back to Dev for fixes

---

## Reviewer Assessment (Round 2)

**PR:** #440
**Verdict:** APPROVED

**All Previous Issues Resolved:**

| Issue | Status | Evidence |
|-------|--------|----------|
| Module not integrated | ✓ FIXED | `chat-participant.ts:20` import, `:147` usage |
| Truncation order | ✓ FIXED | `error-handler.ts:223-224` - truncate then escape |
| Invalid token pattern | ✓ FIXED | `error-handler.ts:60` - `/invalid\s+token/i` in auth |
| Rate-limit patterns | ✓ FIXED | `error-handler.ts:53,57` - 429 and rate limit |

**Code Review Evidence:**
- **Data flow traced:** `error` → `handleChatError()` at `chat-participant.ts:147` → `createErrorResponse()` → `formatErrorMessage()` → `extractMessage()` → `truncate()` → `escapeHtml()` → markdown output. **Safe.**
- **Integration wired:** Import at `chat-participant.ts:20`, used in catch block at `:147`
- **Pattern observed:** Clean section organization, typed constants, follows response-formatter.ts style
- **Error handling:** Null/undefined return safe defaults at `error-handler.ts:85-87,194-196`

**Security:** HTML escaping at `error-handler.ts:171-178` correctly ordered (& first). Truncation before escaping prevents broken entities.

**Tests:** 50/50 passing (3 new tests for rate-limit and invalid-token patterns)

**Non-Blocking Observations:**
- None. All issues from Round 1 fully addressed.

**Handoff:** To SM (Captain Carrot Ironfoundersson) for story completion

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-22T14:48:36Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-22 13:56:11 UTC | 2026-01-22 13:57:19 UTC | 1m |
| red | 2026-01-22 13:57:19 UTC | 2026-01-22 14:05:00 UTC | 8m |
| green | 2026-01-22 14:05:00 UTC | 2026-01-22T14:06:13Z | 1m |
| review | 2026-01-22T14:06:13Z | 2026-01-22T14:15:55Z | 9m |
| green | 2026-01-22T14:15:55Z | 2026-01-22T14:34:00Z | 18m |
| review | 2026-01-22T14:34:00Z | 2026-01-22T14:48:36Z | 14m |

### Handoff History
| From | To | Gate | Status | Timestamp |
|------|-----|------|--------|-----------|
| red (tea) | green (dev) | tests_fail | PASSED | 2026-01-22T14:01:19Z |
| green (dev) | review (reviewer) | tests_pass | PASSED | 2026-01-22T14:06:13Z |
| review (reviewer) | green (dev) | approval | PASSED | 2026-01-22T14:15:55Z |
| green (dev) | review (reviewer) | tests_pass | PASSED | 2026-01-22T14:34:00Z |
| review (reviewer) | finish (sm) | approval | PASSED | 2026-01-22T14:48:36Z |

**Note:** packages/vscode-extension tests: 503/503 passing. Pre-existing failures in unrelated packages/shared (Story 9-4) do not block this story.

<!-- CYCLIST:HANDOFF:/sm -->
