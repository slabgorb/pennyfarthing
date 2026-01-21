# Story MSSCI-12051: Webview panel for Cyclist UI

## Story Details
- **ID:** MSSCI-12051
- **Jira:** MSSCI-12051
- **Epic:** VS Code Extension for Pennyfarthing (MSSCI-12042)
- **Points:** 3
- **Priority:** P2
- **Workflow:** tdd
- **Repos:** pennyfarthing
- **Branch:** feat/MSSCI-12051-webview-cyclist-ui

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-21T09:50:00Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-21T07:15:00Z | 2026-01-21T07:20:00Z | 5m |
| red | 2026-01-21T07:20:00Z | 2026-01-21T07:25:00Z | 5m |
| green | 2026-01-21T07:25:00Z | 2026-01-21T09:45:00Z | ~2h |
| review | 2026-01-21T09:45:00Z | 2026-01-21T09:50:00Z | 5m |

### Handoff History
| From | To | Gate | Status | Timestamp |
|------|----|----|--------|-----------|
| SM | TEA | context_ready | PASSED | 2026-01-21T07:20:00Z |
| TEA | Dev | tests_fail | PASSED | 2026-01-21T07:25:00Z |
| Dev | Reviewer | tests_pass | PASSED | 2026-01-21T09:45:00Z |
| Reviewer | SM | approval | PASSED | 2026-01-21T09:50:00Z |

## TEA Assessment

**Tests Required:** Yes
**Reason:** 3-point TDD story with 4 ACs requiring implementation verification

**Test Files:**
- `packages/vscode-extension/tests/MSSCI-12051-cyclist-webview.test.ts` - Comprehensive tests for webview provider, CSP, theme sync, and WheelHub integration

**Tests Written:** 45 tests covering 4 ACs
**Status:** GREEN (all 45 passing after implementation)

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `src/providers/cyclist-webview.ts` - CyclistWebviewProvider implementing WebviewViewProvider interface
- `src/providers/webview-message-handler.ts` - WebviewMessageHandler for routing messages
- `src/webview/cyclist-panel.html` - HTML template for webview (embedded in provider)
- `src/webview/cyclist-adapter.js` - IPC→postMessage adapter layer
- `src/webview/styles.css` - CSP-compliant styles with VS Code theme integration
- `src/extension.ts` - Registered webview provider and connected to WheelHub
- `src/server/websocket-manager.ts` - Added broadcastStory() method for story updates
- `package.json` - Added cyclistPanel webview view contribution

**Test Files Updated (mock fixes):**
- `tests/MSSCI-12046-terminal-provider.test.ts` - Added registerWebviewViewProvider mock
- `tests/MSSCI-12047-wheelhub-adapter.test.ts` - Added registerWebviewViewProvider mock
- `tests/MSSCI-12048-sidebar.test.ts` - Added registerWebviewViewProvider mock
- `tests/MSSCI-12097-chat-participant.test.ts` - Added registerWebviewViewProvider mock

**Tests:** 210/210 passing (GREEN - full test suite)
**PR:** Pending
**Branch:** feat/MSSCI-12051-webview-cyclist-ui (ready to push)

**Implementation Notes:**
1. CyclistWebviewProvider generates hex nonces (not base64) to match test regex expectations
2. HTML is generated inline in provider rather than loading external template for CSP compliance
3. Theme detection maps ColorThemeKind to 'light'/'dark'/'high-contrast' strings
4. Stats/story updates forwarded via WheelHub same-process listeners pattern
5. Story-only broadcasts detected by checking for absence of persona/context data

**Handoff:** To Reviewer for code review

## Reviewer Assessment

**PR:** #398
**Verdict:** APPROVED

**Code Review Evidence:**
- **Data flow traced:** `postMessage` from `cyclist-adapter.js:29` → `onDidReceiveMessage` at `cyclist-webview.ts:73` → `_handleWebviewMessage` at `cyclist-webview.ts:193` → command execution at `cyclist-webview.ts:195-196`. Safe - no external content, same-extension webview.
- **Wiring verified:** Provider created at `extension.ts:84-85`, registered at `:86-94`, connected to WheelHub at `:206-209`. End-to-end data flow confirmed.
- **Pattern observed:** CSP nonce generation uses `crypto.randomBytes(32).toString('hex')` at `cyclist-webview.ts:95-96` - cryptographically secure 256-bit nonce.
- **Error handling:** WebSocketManager wraps listener calls in try-catch at `websocket-manager.ts:245-250`. Webview adapter uses defensive null checks throughout.

**Security:** No auth required for this sidebar panel. CSP properly restricts script/style sources to extension-provided content with nonce validation. No `unsafe-inline`, no `unsafe-eval`.

**Performance:** Stats listener is lightweight - just forwards data via `postMessage`. No memory leaks detected - unsubscribe function stored and called in `dispose()`.

**Non-Blocking Observations:**
- [LOW] `cyclist-webview.ts:32` - `_storyUnsubscribe` is declared but never assigned. Dead code, should be removed in future cleanup.
- [LOW] `webview-message-handler.ts` - Several methods (`handleStats`, `handleStory`, etc.) are never called. The provider handles these directly. Consider removing unused methods.
- [LOW] `cyclist-webview.ts:246` - High-contrast themes map to 'vscode-dark' class. Acceptable but could add 'vscode-high-contrast' for better accessibility.

**What Passed:**
- All 210 tests green
- No code smells (console.log, TODO, dangerouslySetInnerHTML)
- Proper cleanup in dispose()
- CSP compliance verified
- Theme sync verified

**Handoff:** To SM for finish-story workflow
