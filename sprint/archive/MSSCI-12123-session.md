# Story 53-1: Welcome view with onboarding flow

## Story Details

| Field | Value |
|-------|-------|
| **ID** | 53-1 |
| **Jira** | MSSCI-12123 |
| **Epic** | 53 - VS Code Extension UX/UI Pass |
| **Points** | 2 |
| **Priority** | P0 |
| **Repos** | pennyfarthing |
| **Workflow** | tdd |
| **Phase** | setup |

## Description

Create VS Code welcome view that appears on first activation:
- Explain what Pennyfarthing is and how to use it
- Show available agents with descriptions
- Quick-start buttons for common workflows
- Link to full documentation

## Technical Context

### Implementation Approach

Create a new webview that displays on first extension activation. The welcome view should:

1. **First-run detection**: Check if user has seen the welcome view before (use `globalState.get/update`)
2. **Welcome webview**: New `WelcomeWebviewProvider` implementing `WebviewViewProvider`
3. **Content**: HTML/CSS/JS following existing Cyclist webview patterns

### Architecture Decision

**Option A: Webview panel (modal/tab)** - Opens as a new editor tab
**Option B: Webview view (sidebar)** - Embedded in the Pennyfarthing sidebar

Recommend **Option B** with a "Welcome" view at the top of the sidebar that shows on first activation and can be dismissed. This keeps the onboarding contextual and doesn't interrupt workflow.

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/providers/welcome-webview.ts` | Create | Welcome webview provider |
| `src/webview/welcome-adapter.js` | Create | Webview frontend JavaScript |
| `src/webview/welcome-styles.css` | Create | Welcome view styles |
| `package.json` | Modify | Add welcome view to contributes.views |
| `src/extension.ts` | Modify | Register welcome provider, first-run check |

### Key Implementation Details

**First-run detection:**
```typescript
const hasSeenWelcome = context.globalState.get('hasSeenWelcome', false);
if (!hasSeenWelcome) {
  // Show welcome view
  await context.globalState.update('hasSeenWelcome', true);
}
```

**Welcome content to display:**
1. "What is Pennyfarthing?" - Brief explanation
2. Agent roster with icons and one-line descriptions:
   - SM (Scrum Master) - Story coordination
   - TEA (Test Engineer) - Test-first development
   - Dev (Developer) - Implementation
   - Reviewer - Code review
3. Quick-start buttons:
   - "Start Work" → `/sprint work`
   - "View Backlog" → `/sprint backlog`
   - "Switch Theme" → `/theme`
4. Links:
   - Documentation
   - GitHub repo
   - "Don't show again" option

**CSP compliance (same as Cyclist):**
- Nonce-based script/style security
- External JS/CSS files only
- `webview.asWebviewUri()` for resources

## Acceptance Criteria

- [ ] AC1: Welcome view appears automatically on first extension activation
- [ ] AC2: Welcome view displays Pennyfarthing description and agent roster
- [ ] AC3: Quick-start buttons invoke correct commands when clicked
- [ ] AC4: "Don't show again" persists preference in globalState
- [ ] AC5: Welcome view follows existing webview CSP patterns

## Testing Strategy

- Unit tests for `WelcomeWebviewProvider` (HTML generation, message handling)
- Test first-run detection logic
- Test "don't show again" persistence
- Test quick-start button command invocation

## Feature Branch

`feat/MSSCI-12123-welcome-view`

---

## Workflow Tracking

**Workflow:** tdd
**Phase:** green
**Phase Started:** 2026-01-21T12:29:30Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-21T12:16:30Z | 2026-01-21T12:17:10Z | 40s |
| red | 2026-01-21T12:17:10Z | 2026-01-21T12:17:45Z | 35s |
| green | 2026-01-21T12:17:45Z | 2026-01-21T12:28:55Z | 11m 10s |
| review | 2026-01-21T12:28:55Z | 2026-01-21T12:29:30Z | 35s |

### Handoff History
| From | To | Gate | Status | Timestamp |
|------|-----|------|--------|-----------|
| TEA | Dev | tests_fail | PASSED | 2026-01-21T12:17:45Z |
| Dev | Reviewer | tests_pass | PASSED | 2026-01-21T12:28:55Z |
| Reviewer | Dev | approval | PASSED (REJECTED) | 2026-01-21T12:29:30Z |
| Dev | Reviewer | tests_pass | PASSED | 2026-01-21T12:29:40Z |
| Reviewer | SM | approval | PASSED (APPROVED) | 2026-01-21T12:29:50Z |

## TEA Assessment

**Tests Required:** Yes
**Reason:** New webview feature with UI, message handling, and state persistence

**Test Files:**
- `packages/vscode-extension/tests/MSSCI-12123-welcome-webview.test.ts` - 42 BDD tests

**Tests Written:** 42 tests covering 5 ACs
**Status:** RED (failing - ready for Dev)

**Test Coverage by AC:**
| AC | Tests | Description |
|----|-------|-------------|
| AC1 | 6 | First activation detection, provider registration |
| AC2 | 7 | Description, agent roster display |
| AC3 | 7 | Quick-start buttons, command invocation |
| AC4 | 4 | "Don't show again" globalState persistence |
| AC5 | 8 | CSP patterns, nonce, webview options |
| Other | 10 | Package.json, adapter files, message handling, disposal |

**Handoff:** To Dev (Tyrion Lannister) for implementation

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/vscode-extension/package.json` - Added welcomePanel view contribution at index 0
- `packages/vscode-extension/src/extension.ts` - Register WelcomeWebviewProvider
- `packages/vscode-extension/src/providers/welcome-webview.ts` - WelcomeWebviewProvider class
- `packages/vscode-extension/src/webview/welcome-adapter.js` - Webview frontend JavaScript
- `packages/vscode-extension/src/webview/welcome-styles.css` - Webview styles
- `packages/vscode-extension/tests/MSSCI-12123-welcome-webview.test.ts` - Added Uri.parse mock

**Tests:** 42/42 passing (GREEN)
**PR:** #404 - feat(vscode): implement welcome view with onboarding flow (MSSCI-12123)
**Branch:** feat/53-1-welcome-view (pushed)

**Handoff:** To Reviewer for code review

## Dev Assessment (Fix Round 2)

**Reviewer Feedback Addressed:** HIGH - AC1 first-run detection not wired

**Fix Applied:**
- `packages/vscode-extension/src/extension.ts` - Added hasUserSeenWelcome() check after provider registration; programmatically reveals sidebar on first run via `vscode.commands.executeCommand('workbench.view.extension.pennyfarthing')`
- `packages/vscode-extension/tests/MSSCI-12123-welcome-webview.test.ts` - Added 2 integration tests verifying sidebar reveal logic
- `packages/vscode-extension/tests/MSSCI-12046-terminal-provider.test.ts` - Added executeCommand mock
- `packages/vscode-extension/tests/MSSCI-12047-wheelhub-adapter.test.ts` - Added executeCommand mock
- `packages/core/src/jira/jira-sprint-sync.ts` - Fixed 4 unused variable lint warnings

**Tests:** 44/44 passing (GREEN) - includes 2 new integration tests
**Commit:** 357300983 - fix(vscode): wire first-run detection to sidebar reveal
**Branch:** feat/53-1-welcome-view (pushed)

**Handoff:** To Reviewer for re-review

## Workflow Progress

| Phase | Agent | Status |
|-------|-------|--------|
| setup | SM | ✅ Complete |
| red | TEA | ✅ Complete |
| green | Dev | ✅ Complete |
| review | Reviewer | ⏳ Pending |

## Reviewer Assessment

**PR:** #404
**Verdict:** REJECTED

**Code Review Evidence:**

- **Data flow traced:** Button click → `welcome-adapter.js:46` → `postMessage()` → `welcome-webview.ts:86` → `_handleWebviewMessage()` → `vscode.commands.executeCommand()` at line 100. Safe - CSP prevents code injection.
- **Pattern observed:** Follows existing Cyclist webview pattern at `welcome-webview.ts:129-233` with nonce-based CSP, external resources, proper message handling.
- **Error handling:** Switch/case with default fallback at `welcome-webview.ts:96-117`. No thrown errors from message handler. Null checks on `message.command` and `message.url`.

**Security:** CSP at line 143 is well-configured: `default-src 'none'`, nonce-required scripts/styles, no `unsafe-inline`. Command execution at line 100 accepts any command from webview, but webview origin isolation prevents external manipulation.

**Performance:** No N+1 concerns - single render, event listeners attached once in `init()`.

**Issues Found:**

| Severity | Issue | Location | Fix Required |
|----------|-------|----------|--------------|
| [HIGH] | AC1 incomplete: First-run detection not wired in extension.ts | `extension.ts:114-124` | Add `hasUserSeenWelcome()` check and programmatic sidebar reveal during activation |
| [MEDIUM] | Unused method: `hasUserSeenWelcome()` is defined but never called | `welcome-webview.ts:39-41` | Wire to extension.ts activation logic |

**Blocking Issues:** 0 Critical, 1 High
**Non-Blocking Issues:** 1 Medium, 0 Low

**Details on HIGH Issue:**

AC1 requires "Welcome view appears automatically on first extension activation." The technical spec (session file lines 53-60) shows first-run detection code that should be in extension.ts:

```typescript
const hasSeenWelcome = context.globalState.get('hasSeenWelcome', false);
if (!hasSeenWelcome) {
  // Show welcome view
  await context.globalState.update('hasSeenWelcome', true);
}
```

This pattern is NOT implemented. The `WelcomeWebviewProvider.hasUserSeenWelcome()` method exists but is never called during activation. The welcome panel is registered but not revealed programmatically on first run.

Tests pass because they verify the method works in isolation (`hasUserSeenWelcome()` returns correct values), but there is no integration test verifying the end-to-end flow: "new user activates extension → sidebar reveals → welcome view shown."

**Required Fix:**
1. In `extension.ts`, after registering the welcome provider, check `welcomeWebviewProvider.hasUserSeenWelcome()`
2. If false, programmatically reveal the sidebar: `vscode.commands.executeCommand('workbench.view.extension.pennyfarthing')`
3. Add integration test verifying the wiring

**What Passed:**
- Clean CSP implementation following Cyclist patterns
- Proper TypeScript typing with `WebviewMessage` interface
- DOM initialization handles both sync and async DOMContentLoaded
- Message handler has proper validation with null checks
- Webview options include `retainContextWhenHidden: true` for state preservation

**Handoff:** Back to Dev (Tyrion Lannister) for fixes

## Reviewer Assessment (Re-Review)

**PR:** #404
**Verdict:** APPROVED

**Fix Verification:**

The HIGH issue has been properly addressed:

1. **First-run detection wired:** `extension.ts:126-131` now calls `welcomeWebviewProvider.hasUserSeenWelcome()` immediately after provider registration
2. **Sidebar reveal on first run:** If `hasUserSeenWelcome()` returns false, executes `vscode.commands.executeCommand('workbench.view.extension.pennyfarthing')`
3. **Integration tests added:** Two new tests verify:
   - Sidebar reveals when `hasSeenWelcome` is false (first run)
   - Sidebar does NOT reveal when `hasSeenWelcome` is true (returning user)

**Data Flow Traced (Fixed):**
- Extension activate → WelcomeWebviewProvider created → Provider registered → **First-run check** → Sidebar revealed → User sees welcome → Dismiss sets `hasSeenWelcome: true` → Next activation skips reveal

**Tests:** 44/44 passing (GREEN) - includes 2 new integration tests

**All ACs Now Met:**
- [x] AC1: Welcome view appears automatically on first extension activation (NOW WIRED)
- [x] AC2: Welcome view displays Pennyfarthing description and agent roster
- [x] AC3: Quick-start buttons invoke correct commands when clicked
- [x] AC4: "Don't show again" persists preference in globalState
- [x] AC5: Welcome view follows existing webview CSP patterns

**Non-Blocking Observations:**
- None - all previous issues resolved

**Handoff:** To SM (Lord Varys) for finish-story workflow
