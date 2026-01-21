# Story MSSCI-12046: Terminal provider for Claude Code sessions

**Epic:** MSSCI-12042 (VS Code Extension for Pennyfarthing)
**Points:** 3 | **Priority:** P0
**Repos:** pennyfarthing
**Branch:** feat/MSSCI-12046-terminal-provider
**Phase:** sm
**Status:** setup
**Workflow:** tdd
**Jira:** MSSCI-12046

## Story Description

Create custom terminal profile that:
- Launches Claude Code with Pennyfarthing context
- Sets PROJECT_ROOT and other env vars
- Hooks into session-start.sh flow
- Provides terminal link detection for file paths

## Technical Context

### Current State

The extension scaffolding (MSSCI-12045) provides:
- `packages/vscode-extension/` package with TypeScript setup
- Basic `extension.ts` with activate/deactivate lifecycle
- esbuild bundling configured
- Activation on `.pennyfarthing` or `.claude` directories

### Technical Approach

**VS Code Terminal Profile Provider:**
1. Register a `TerminalProfileProvider` for "Pennyfarthing Claude"
2. Create terminal with custom environment variables:
   - `PROJECT_ROOT` - workspace folder path
   - `CLAUDE_PROJECT_DIR` - same as PROJECT_ROOT
   - `PENNYFARTHING_ACTIVE` - flag for scripts to detect VS Code context
3. Use `TerminalOptions.shellPath` to launch `claude` command
4. Implement `TerminalLinkProvider` for file:line detection

**Key VS Code APIs:**
- `vscode.window.registerTerminalProfileProvider()`
- `vscode.window.createTerminal(TerminalOptions)`
- `vscode.window.registerTerminalLinkProvider()`
- `vscode.TerminalLink` for clickable file paths

**File Structure:**
```
src/
├── extension.ts          # Updated to register providers
├── providers/
│   └── terminal.ts       # TerminalProfileProvider + TerminalLinkProvider
```

### Files to Modify

| File | Change |
|------|--------|
| `packages/vscode-extension/src/extension.ts` | Register terminal providers |
| `packages/vscode-extension/src/providers/terminal.ts` | NEW: Terminal profile and link providers |
| `packages/vscode-extension/package.json` | Add terminal profile contribution |
| `packages/vscode-extension/tests/B-terminal-provider.test.ts` | NEW: Unit tests |

## Acceptance Criteria

- [ ] AC1: Custom terminal profile "Pennyfarthing Claude" appears in terminal dropdown
- [ ] AC2: Terminal launches with PROJECT_ROOT and CLAUDE_PROJECT_DIR env vars set
- [ ] AC3: File paths in terminal output (e.g., `src/foo.ts:42`) are clickable links
- [ ] AC4: Clicking file link opens file at correct line in VS Code editor

## Testing Strategy

1. **Unit tests:** Mock VS Code APIs, verify provider registration
2. **Link parsing:** Test regex for file:line pattern extraction
3. **Integration:** Manual test in VS Code Extension Development Host

## Dependencies & Risks

- Depends on `claude` CLI being installed and available in PATH
- Terminal profile requires VS Code 1.85+ (already in engines constraint)
- No external service dependencies

## Workflow Tracking

**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-20T16:32:00Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-20T15:35:00Z | 2026-01-20T15:38:00Z | 3m |
| red | 2026-01-20T15:38:00Z | 2026-01-20T15:39:00Z | 1m |
| green | 2026-01-20T15:39:00Z | 2026-01-20T16:31:00Z | 52m |
| review | 2026-01-20T16:31:00Z | 2026-01-20T16:32:00Z | 1m |

### Handoff History
| From | To | Gate | Result | Timestamp |
|------|-----|------|--------|-----------|
| tea | dev | tests_fail | PASSED | 2026-01-20T15:39:00Z |
| dev | reviewer | tests_pass | PASSED | 2026-01-20T16:31:00Z |
| reviewer | sm | approval | PASSED | 2026-01-20T16:32:00Z |

## TEA Assessment

**Tests Required:** Yes
**Reason:** Feature implementation with 4 acceptance criteria requiring validation

**Test Files:**
- `packages/vscode-extension/tests/MSSCI-12046-terminal-provider.test.ts` - Terminal profile provider and link detection tests

**Tests Written:** 15 tests covering 4 ACs
- AC1: 3 tests (terminal profile contribution, registration, profile title)
- AC2: 3 tests (PROJECT_ROOT, CLAUDE_PROJECT_DIR, PENNYFARTHING_ACTIVE env vars)
- AC3: 3 tests (link provider registration, file:line detection, various path formats)
- AC4: 3 tests (handleTerminalLink method, document opening, line navigation)
- Structure: 3 tests (providers/terminal.ts file, class exports)

**Status:** RED (15 failing - ready for Dev)

**Handoff:** To Dev (Yog-Sothoth) for implementation

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/vscode-extension/src/providers/terminal.ts` - NEW: PennyfarthingTerminalProfileProvider and PennyfarthingTerminalLinkProvider classes
- `packages/vscode-extension/src/extension.ts` - Register terminal profile and link providers on activation
- `packages/vscode-extension/package.json` - Add terminal profile contribution for linux/osx/windows
- `packages/vscode-extension/tests/MSSCI-12046-terminal-provider.test.ts` - Enhanced VS Code API mocks

**Tests:** 15/15 passing (GREEN)
**PR:** #378 - feat(vscode): Terminal provider for Claude Code sessions [MSSCI-12046]
**Branch:** feat/MSSCI-12046-terminal-provider (pushed)

**Handoff:** To Reviewer (Abdul Alhazred) for code review

## Reviewer Assessment

**PR:** #378
**Verdict:** APPROVED

**Code Review Evidence:**
- **Data flow traced:** Terminal link text from terminal output at `terminal.ts:64` → regex parsing at `terminal.ts:55` → path resolution at `terminal.ts:117` → `vscode.Uri.file()` and `openTextDocument` at `terminal.ts:103-104`. No injection vectors - VS Code APIs handle paths safely.
- **Pattern observed:** Clean provider implementation following VS Code `TerminalProfileProvider` interface at `terminal.ts:22-40`. Proper disposable pattern with `context.subscriptions.push()` at `extension.ts:37-42`.
- **Error handling:** Missing try-catch in `handleTerminalLink` at `terminal.ts:100-112` - if file doesn't exist, VS Code extension host handles gracefully (not a crash risk).

**Security:** No auth changes, no user input beyond terminal output. File path operations use VS Code's safe `Uri.file()` API. Low risk surface.

**Performance:** Single regex pass per terminal line. No N+1 patterns, no memory accumulation. Appropriate for VS Code extension context.

**Non-Blocking Observations:**
- [MEDIUM] `handleTerminalLink` at `terminal.ts:100-112` lacks error handling for missing files. User experience could be improved with a friendly error message, but VS Code handles it gracefully. Not blocking.
- [LOW] Regex at `terminal.ts:55` doesn't handle paths with spaces. Rare in practice, not worth the complexity. Not blocking.

**What Passed:**
- All 15 tests GREEN covering 4 acceptance criteria
- No console.log, no TODO/FIXME, no skipped tests
- Clean provider pattern following VS Code conventions
- Proper cleanup via subscriptions
- Cross-platform terminal profile declaration (linux/osx/windows)

**Handoff:** To SM (Camina Drummer) for finish-story workflow

## Workflow

- [x] SM: Story setup
- [x] TEA: Write failing tests (RED)
- [x] Dev: Implement to GREEN
- [x] Reviewer: Code review
- [ ] SM: Finish story
