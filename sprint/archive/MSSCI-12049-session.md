# Story MSSCI-12049: Reflector Protocol Adapter (Pivoted)

**Epic:** 52 - VS Code Extension for Pennyfarthing (MSSCI-12042)
**Points:** 3 | **Priority:** P1
**Repos:** pennyfarthing
**Branch:** feat/MSSCI-12049-reflector-chat
**Phase:** red
**Status:** in_progress
**Jira:** MSSCI-12049
**Workflow:** tdd

## Story Description

Parse Reflector HTML comments from Claude output in the VS Code chat participant:
- HANDOFF: Show VS Code notification with action button
- CONTEXT_CLEAR: Trigger TirePump via command
- QUESTION/CHOICES: Render VS Code quick pick

**Pivot Note:** Original implementation used WheelHub WebSocket approach. This version integrates with ClaudeService text events in chat-participant.ts instead.

## Current State

### ClaudeService (claude-service.ts)
- EventEmitter-based service managing Claude CLI child process
- Emits `text`, `toolUse`, `complete`, `error` events
- Text events contain raw Claude output including any CYCLIST markers
- 228 lines, no Reflector integration currently

### Chat Participant (chat-participant.ts)
- Registers `@pennyfarthing` in VS Code native chat
- `streamClaudeResponse()` handles text events at lines 149-159
- Currently writes raw text directly to response stream
- 226 lines, no marker detection/stripping

### Old Reflector (on feature branch - not on develop)
- Had `detectMarkers()`, `stripMarkers()`, `processMarker()`
- Was designed for WheelHub WebSocket messages
- Tests exist at `packages/vscode-extension/tests/MSSCI-12049-reflector-adapter.test.ts`

## Technical Approach

### Integration Point
Modify `chat-participant.ts` `streamClaudeResponse()` to:
1. Intercept text chunks from ClaudeService
2. Run through Reflector `detectMarkers()` to find CYCLIST comments
3. Strip markers via `stripMarkers()` before writing to response stream
4. Execute marker actions (notifications, quick picks, commands)

### Reflector Module Design
Create `packages/vscode-extension/src/adapters/reflector.ts`:

```typescript
// Marker detection
interface CyclistMarker {
  type: 'HANDOFF' | 'CONTEXT_CLEAR' | 'QUESTION' | 'CHOICES';
  value: string;
}

function detectMarkers(text: string): CyclistMarker[];
function stripMarkers(text: string): string;
async function processMarker(marker: CyclistMarker): Promise<void>;
```

### VS Code Integration
- HANDOFF → `vscode.window.showInformationMessage()` with action button
- CONTEXT_CLEAR → Execute `pennyfarthing.contextClear` command
- QUESTION/CHOICES → `vscode.window.showQuickPick()`

## Files to Modify

| File | Changes |
|------|---------|
| `packages/vscode-extension/src/adapters/reflector.ts` | NEW - Marker detection and processing |
| `packages/vscode-extension/src/providers/chat-participant.ts` | Wire Reflector into text stream |
| `packages/vscode-extension/tests/MSSCI-12049-reflector-adapter.test.ts` | Update tests for new integration |

## Acceptance Criteria

- [ ] AC1: `detectMarkers()` parses CYCLIST markers from text
- [ ] AC2: `stripMarkers()` removes markers before display
- [ ] AC3: HANDOFF shows VS Code notification with action button
- [ ] AC4: CONTEXT_CLEAR executes `pennyfarthing.contextClear` command
- [ ] AC5: QUESTION/yesno shows Yes/No quick pick
- [ ] AC6: CHOICES shows quick pick with parsed options
- [ ] AC7: Integrates with chat-participant `onText` handler

## Testing Strategy

- Unit tests for `detectMarkers()` with various marker formats
- Unit tests for `stripMarkers()` preserving non-marker content
- Integration tests mocking VS Code APIs for UI actions
- Existing test file can be adapted from WheelHub approach

## Dependencies & Risks

| Dependency | Status |
|------------|--------|
| ClaudeService | ✅ Complete (claude-service.ts) |
| Chat Participant | ✅ Complete (chat-participant.ts) |
| VS Code Chat API | ✅ Available |

| Risk | Mitigation |
|------|------------|
| Marker detection edge cases | Comprehensive regex tests |
| Async quick pick timing | Fire-and-forget with error handling |

---

*Context created by Lord Varys, 2026-01-21*

## TEA Assessment

**Tests Required:** Yes
**Reason:** Feature implementation with 7 acceptance criteria requiring functional validation

**Test Files:**
- `packages/vscode-extension/tests/MSSCI-12049-reflector-adapter.test.ts` - 42 tests covering all 7 ACs

**Test Coverage by AC:**

| AC | Description | Tests |
|----|-------------|-------|
| AC1 | detectMarkers() parses CYCLIST markers | 10 tests |
| AC2 | stripMarkers() removes markers before display | 7 tests |
| AC3 | HANDOFF shows notification with action | 4 tests |
| AC4 | CONTEXT_CLEAR executes command | 2 tests |
| AC5 | QUESTION/yesno shows quick pick | 3 tests |
| AC6 | CHOICES shows quick pick with options | 4 tests |
| AC7 | Integration with chat-participant | 7 tests |
| Edge | Split markers, unknown types, rapid processing | 3 tests |

**Tests Written:** 42 tests covering 7 ACs
**Status:** RED (all failing - implementation does not exist)

**Implementation Required:**
1. Create `src/adapters/reflector.ts` with:
   - `detectMarkers(text: string): CyclistMarker[]`
   - `stripMarkers(text: string): string`
   - `processMarker(marker: CyclistMarker): Promise<any>`
   - `ReflectorAdapter` class with `processText()` method

2. Wire into `chat-participant.ts`:
   - Import ReflectorAdapter
   - Use processText in onText handler
   - Display stripped text, process markers for VS Code UI

**Handoff:** To Dev (Tyrion Lannister) for GREEN phase

## Workflow Tracking

| Phase | Agent | Gate | Status | Timestamp |
|-------|-------|------|--------|-----------|
| red | TEA | tests_fail | PASSED | 2026-01-21 |
| green | Dev | tests_pass | PASSED | 2026-01-21 |
| review | Reviewer | approval | PASSED | 2026-01-21 |
| finish | SM | manual | PENDING | - |

## Handoff History

| From | To | Gate Type | Result | Time | Context |
|------|-----|-----------|--------|------|---------|
| TEA | Dev | tests_fail | PASSED | 2026-01-21 | 42% |
| Dev | Reviewer | tests_pass | PASSED | 2026-01-21 | 45% |
| Reviewer | SM | approval | PASSED | 2026-01-21 | 40% |

**Gate Check Summary:**
- Tests committed: YES (MSSCI-12049-reflector-adapter.test.ts)
- Tests RED: YES (42 failing tests confirmed)
- Assessment exists: YES (TEA Assessment section complete)

**Next Agent:** Dev (Green Phase - Implementation)

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/vscode-extension/src/adapters/reflector.ts` - NEW: Marker detection, stripping, and VS Code UI processing (287 lines)
- `packages/vscode-extension/src/providers/chat-participant.ts` - Wire ReflectorAdapter into text stream (+16 lines)

**Implementation Details:**
1. Created `reflector.ts` with:
   - `detectMarkers(text)` - Regex-based CYCLIST marker detection
   - `stripMarkers(text)` - Remove markers before display
   - `processMarker(marker)` - Trigger VS Code UI actions
   - `ReflectorAdapter` class with buffer handling for split markers

2. Wired into `chat-participant.ts`:
   - Import and instantiate ReflectorAdapter (line 14, 43)
   - Process text through `processText()` in onText handler (line 155)
   - Display stripped text with `displayText` property
   - Reset adapter between conversations, flush on completion

**Tests:** 42/42 passing (GREEN)
**PR:** #396 - feat(vscode): implement Reflector protocol adapter (MSSCI-12049)
**Branch:** feat/MSSCI-12049-reflector-chat (pushed)

**Handoff:** To Reviewer for code review

## Reviewer Assessment

**PR:** #396
**Verdict:** APPROVED

**Code Review Evidence:**

**Data Flow Traced:**
- Text chunks from ClaudeService `text` event → `chat-participant.ts:154` `onText` handler → `reflectorAdapter.processText()` at line 155 → markers extracted and processed via `processMarker()` → stripped text output to `response.markdown()` at line 158
- SAFE: Markers are parsed via regex, values passed to VS Code API commands which are sandboxed

**Pattern Observed:**
- Good: Fire-and-forget pattern for marker processing at `reflector.ts:246-250` - doesn't block text streaming
- Good: Buffer handling for split markers at `reflector.ts:224-236` - correctly accumulates incomplete comments
- Good: Try-catch wrapper in `processMarker()` at line 115-137 - graceful error handling

**Wiring Verified:**
- ReflectorAdapter instantiated at `chat-participant.ts:43`
- `reset()` called at start of conversation at line 127
- `processText()` called in onText handler at line 155
- `flush()` called on completion at line 173
- All components properly connected end-to-end

**Security:** VS Code commands `pennyfarthing.switchAgent` and `pennyfarthing.contextClear` are registered extension commands, not shell execution. No injection risk.

**Non-Blocking Observations:**

| Severity | Issue | Location | Note |
|----------|-------|----------|------|
| [LOW] | Regex `[^-]*?` prevents matching values with dashes | `reflector.ts:48` | Current protocol doesn't use dashed values - latent bug, not blocking |
| [MEDIUM] | Async `onText` handler doesn't wrap `response.markdown()` in try-catch | `chat-participant.ts:154-160` | Potential unhandled rejection if VS Code API throws - recommend adding try-catch in future |

**What Passed:**
- All 42 feature tests GREEN
- No code smells detected (no console.log, no TODOs, no skipped tests)
- Complete test coverage for all 7 acceptance criteria
- Clean integration with minimal changes to chat-participant.ts (+18 lines)
- Proper buffer handling for split markers across text chunks

**Handoff:** To SM (Lord Varys) for finish-story workflow
