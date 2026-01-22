# Story MSSCI-12126: Chat response formatting improvements

## Story Details
- **ID:** MSSCI-12126
- **Title:** Chat response formatting improvements
- **Workflow:** tdd
- **Jira:** MSSCI-12126
- **Epic:** 53 - VS Code Extension UX/UI Pass
- **Points:** 2

## Description

Improve how Claude responses render in VS Code chat:
- Better code block syntax highlighting
- Collapsible tool use sections
- File path links that open in editor
- Markdown table rendering
- Progress indicators for long operations

## Acceptance Criteria

- [ ] AC1: Code blocks render with syntax highlighting when language is specified or can be inferred
- [ ] AC2: Tool use events display as collapsible sections with tool name and input
- [ ] AC3: File paths in responses become clickable links that open in editor
- [ ] AC4: Markdown tables render correctly with proper alignment
- [ ] AC5: Long operations show progress indicator in chat

## Workflow Tracking

**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-21T17:15:00Z

### Phase History

| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-21T10:15:00Z | 2026-01-21T15:07:06Z | 4h 52m |
| red | 2026-01-21T15:07:06Z | 2026-01-21T15:15:00Z | 7m 54s |
| green | 2026-01-21T15:15:00Z | 2026-01-21T16:45:00Z | 1h 30m |
| review | 2026-01-21T16:45:00Z | 2026-01-21T17:15:00Z | 30m |
| finish | 2026-01-21T17:15:00Z | - | - |

### Handoff History

| From | To | Gate | Result | Timestamp |
|------|-----|------|--------|-----------|
| TEA | Dev | tests_fail | PASSED | 2026-01-21T15:15:00Z |
| Dev | Reviewer | tests_pass | PASSED | 2026-01-21T15:45:00Z |
| Reviewer | Dev | approval | PASSED (REJECTED) | 2026-01-21T16:15:00Z |
| Dev | Reviewer | tests_pass | PASSED | 2026-01-21T16:45:00Z |
| Reviewer | SM | approval | PASSED (APPROVED) | 2026-01-21T17:15:00Z |

## Implementation Notes

Working on VS Code extension chat improvements. Focus areas:
1. Code block rendering with syntax highlighting
2. Tool use display as collapsible sections
3. File path link handling
4. Markdown table rendering
5. Progress indicators

## TEA Assessment

**Tests Required:** Yes
**Reason:** New feature with 5 acceptance criteria requiring implementation

**Test Files:**
- `packages/vscode-extension/tests/MSSCI-12126-chat-response-formatting.test.ts` - All AC tests
- `packages/vscode-extension/src/adapters/response-formatter.ts` - Stub implementation (throws "not implemented")

**Tests Written:** 44 tests covering 5 ACs
**Status:** RED (43 failing - ready for Dev)

### Test Coverage by AC

| AC | Tests | Description |
|----|-------|-------------|
| AC1 | 12 tests | Code block syntax highlighting (formatCodeBlocks, inferLanguage) |
| AC2 | 6 tests | Collapsible tool use sections (formatToolUse) |
| AC3 | 10 tests | File path clickable links (formatFilePaths, createFileLink) |
| AC4 | 5 tests | Markdown table rendering (formatTables) |
| AC5 | 7 tests | Progress indicators (ProgressTracker class) |
| Integration | 4 tests | Full formatResponse pipeline |

### Functions to Implement

1. `formatCodeBlocks(text: string): string` - Add language hints to code blocks
2. `inferLanguage(code: string): string | null` - Detect language from content
3. `formatToolUse(name, input): string` - Render tool as collapsible section
4. `formatFilePaths(text: string): string` - Convert paths to command links
5. `createFileLink(path, line?, col?): string` - Generate vscode.open command URI
6. `formatTables(text: string): string` - Fix table formatting
7. `ProgressTracker` class - Track and display tool progress
8. `formatResponse(text: string): string` - Full pipeline

**Handoff:** To Dev for implementation

**Next Agent:** Dev (Miles)

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/vscode-extension/src/adapters/response-formatter.ts` - Full implementation (441 lines)

**Tests:** 44/44 passing (GREEN)
**PR:** #406 - feat(MSSCI-12126): Chat response formatting improvements
**Branch:** feat/MSSCI-12126-chat-response-formatting (pushed)

### Implementation Summary

| Function | Description |
|----------|-------------|
| `formatCodeBlocks()` | Adds language hints to fenced code blocks |
| `inferLanguage()` | Detects TS, Go, Python, JSON, YAML, Bash, JS from content |
| `formatToolUse()` | Wraps tool invocations in `<details>`/`<summary>` with emoji |
| `formatFilePaths()` | Converts file paths to vscode.open command links |
| `createFileLink()` | Generates command URIs with line:column support |
| `formatTables()` | Normalizes table formatting, adds missing separators |
| `isWellFormedTable()` | Detects well-formed tables to preserve them |
| `ProgressTracker` | Stack-based progress tracking for tool operations |
| `formatResponse()` | Full pipeline: tables → code blocks → file paths |

**Handoff:** To Reviewer for code review

**Next Agent:** Reviewer (Aral)

## Reviewer Assessment

**PR:** #406
**Verdict:** REJECTED

**Critical Issue Found:**

| Severity | Issue | Location | Fix Required |
|----------|-------|----------|--------------|
| [CRITICAL] | Formatter module not wired into extension | `chat-participant.ts:156-171`, `extension.ts` | Import and call `formatResponse()`, `formatToolUse()`, `ProgressTracker` |

**Code Review Evidence:**

- **Data flow traced:** Claude response text arrives at `chat-participant.ts:157` via `onText()` callback → passes through `ReflectorAdapter.processText()` → raw text sent to `response.markdown()` at line 161 WITHOUT passing through `formatResponse()`. Formatters are NEVER called.

- **Wiring verified:** The `response-formatter.ts` module is only referenced by itself. Confirmed via grep:
  ```
  grep -r "response-formatter|formatResponse" packages/vscode-extension/src
  # Only match: packages/vscode-extension/src/adapters/response-formatter.ts
  ```

- **Pattern observed:** This is the EXACT failure pattern from MSSCI-12048 (Unconnected Components) and MSSCI-12123 (AC1-style Requirements). Tests pass because they call functions directly. Feature doesn't work because functions are never invoked in production.

**What Doesn't Work End-to-End:**

| AC | Function | Called In Tests? | Called In Production? |
|----|----------|------------------|----------------------|
| AC1 | `formatCodeBlocks()` | YES | NO |
| AC2 | `formatToolUse()` | YES | NO |
| AC3 | `formatFilePaths()` | YES | NO |
| AC4 | `formatTables()` | YES | NO |
| AC5 | `ProgressTracker` | YES | NO |

**Required Fixes:**

1. In `chat-participant.ts`, import the formatter:
   ```typescript
   import { formatResponse, formatToolUse, ProgressTracker } from '../adapters/response-formatter';
   ```

2. In `onText()` handler (line 157-163), wrap text through formatter:
   ```typescript
   const onText = async (text: string) => {
     const result = await this.reflectorAdapter.processText(text);
     if (result.displayText) {
       const formatted = formatResponse(result.displayText);
       response.markdown(formatted);
     }
   };
   ```

3. In `onToolUse()` handler (line 166-171), use `formatToolUse()`:
   ```typescript
   const onToolUse = (name: string, input: Record<string, unknown>) => {
     const formatted = formatToolUse(name, input);
     response.markdown('\n\n' + formatted + '\n');
   };
   ```

4. Create ProgressTracker instance and use it:
   ```typescript
   const progressTracker = new ProgressTracker();
   // In onToolUse:
   progressTracker.startToolProgress(name, response);
   // After tool completes:
   progressTracker.endToolProgress(response);
   ```

**What Passed:**

- **Implementation quality:** `response-formatter.ts` is well-structured with clear separation of concerns
- **Test coverage:** 44 tests covering all 5 ACs comprehensively
- **Security:** No injection vectors found - uses `encodeURIComponent()` for URIs, excludes code blocks from path conversion
- **Performance:** Regex patterns are reasonable, no catastrophic backtracking risk
- **Code cleanliness:** No console.log, no TODO/FIXME, no skipped tests

**Non-Blocking Observations:**

- [LOW] `CODE_BLOCK_REGEX` at line 21 requires `\n` after opening backticks; inline code blocks like ` ```json{} ``` ` won't match
- [LOW] `RELATIVE_PATH_REGEX` at line 178 only catches specific prefixes (src, lib, test, etc.); paths like `components/Button.tsx` would be missed

**Blocking Issues:** 1 Critical
**Non-Blocking Issues:** 2 Low

**Handoff:** Back to Dev for integration fixes

**Next Agent:** Dev (Miles)

## Dev Assessment (Fix Round)

**Implementation Complete:** Yes
**Fix Applied:** Wired response-formatter into chat-participant

**Files Changed:**
- `packages/vscode-extension/src/providers/chat-participant.ts` - Integration of formatters
- `packages/vscode-extension/tests/MSSCI-12097-chat-participant.test.ts` - Updated tests

**Changes Made:**
1. Added import for `formatResponse`, `formatToolUse`, `ProgressTracker` from response-formatter
2. Created `ProgressTracker` instance in `streamClaudeResponse()`
3. Wrapped `onText` handler output through `formatResponse()` (AC1, AC3, AC4)
4. Replaced inline tool formatting with `formatToolUse()` (AC2)
5. Added `onToolResult` handler to clear progress after tool completes
6. Integrated `startToolProgress()` and `endToolProgress()` calls (AC5)
7. Removed now-unused `truncateInput()` method (truncation handled by formatToolUse)
8. Updated AC5 tests to verify new implementation pattern

**Tests:** 298/298 passing (GREEN)
**Commit:** e54cf4750 - fix(MSSCI-12126): wire response formatter into chat participant
**Branch:** feat/MSSCI-12126-chat-response-formatting (pushed)

**Integration Verified:**
```bash
grep -r "response-formatter" packages/vscode-extension/src
# Now shows: chat-participant.ts AND response-formatter.ts
```

**Handoff:** To Reviewer for re-review

**Next Agent:** Reviewer (Aral)

## Reviewer Assessment (Re-Review)

**PR:** #406
**Verdict:** APPROVED

**Critical Issue Resolution Verified:**

| Issue | Status | Verification |
|-------|--------|--------------|
| Formatter module not wired | RESOLVED | `grep -r "response-formatter" packages/vscode-extension/src` now returns 2 files |

**Code Review Evidence:**

- **Data flow traced:** Claude response → `onText()` at line 166 → `reflectorAdapter.processText()` → `formatResponse()` at line 171 → `response.markdown()` at line 172. **COMPLETE PATH VERIFIED.**

- **Tool use wiring:** `onToolUse()` at line 178 → `progressTracker.recordToolStart()` at 180 → `progressTracker.startToolProgress()` at 181 → `formatToolUse()` at 184 → `response.markdown()` at 185. **AC2 VERIFIED.**

- **Progress tracking wired:**
  - `ProgressTracker` created at line 162 ✓
  - `onToolResult` handler at line 189 clears progress ✓
  - Event registered at line 226 ✓
  - Cleanup at line 218 ✓
  - **AC5 VERIFIED.**

**Integration Verification:**
```bash
grep -r "response-formatter" packages/vscode-extension/src
# packages/vscode-extension/src/adapters/response-formatter.ts
# packages/vscode-extension/src/providers/chat-participant.ts  <-- NOW PRESENT
```

**What Now Works End-to-End:**

| AC | Function | Called In Production? |
|----|----------|----------------------|
| AC1 | `formatCodeBlocks()` | YES (via formatResponse) |
| AC2 | `formatToolUse()` | YES (direct call) |
| AC3 | `formatFilePaths()` | YES (via formatResponse) |
| AC4 | `formatTables()` | YES (via formatResponse) |
| AC5 | `ProgressTracker` | YES (instance + handlers) |

**Tests:** 298/298 passing (GREEN)
**Security:** No issues (same assessment as first review)
**Performance:** No issues

**Non-Blocking Observations (carried forward):**
- [LOW] `CODE_BLOCK_REGEX` requires `\n` after backticks - minor edge case
- [LOW] `RELATIVE_PATH_REGEX` only catches specific prefixes - acceptable limitation

**Handoff:** To SM (Baz Jesek) for finish-story workflow

**Next Agent:** SM (Baz)
