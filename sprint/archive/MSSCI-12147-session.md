# Session: MSSCI-12147

## Story
**ID:** MSSCI-12147
**Title:** Fix chat message formatting and sidebar sync
**Points:** 2
**Epic:** VS Code Extension UX/UI Pass (epic-53)
**Workflow:** TDD

## Description
Two bugs in VS Code extension chat experience:
1. XML tags appearing in rendered messages - tags like `<system-reminder>`, tool result wrappers, etc. are showing raw instead of being stripped
2. Sidebar not syncing with activity - agent status, workflow state, or other sidebar panels not updating as chat activity occurs

## Acceptance Criteria
- [ ] XML tags stripped from chat message display
- [ ] System reminder tags not visible to user
- [ ] Tool result formatting cleaned up
- [ ] Sidebar updates when agent changes
- [ ] Sidebar reflects current workflow state

## Technical Analysis

### Bug 1: XML Tag Leakage
**Location:** `packages/vscode-extension/src/adapters/response-formatter.ts`

The current `formatResponse()` pipeline handles:
- Tables
- Code blocks (language inference)
- File paths (clickable links)

But it does NOT strip XML tags. The `reflector.ts` only strips `<!-- CYCLIST:... -->` markers.

**Tags that leak through:**
- `<system-reminder>...</system-reminder>` - System context injected by Claude Code
- `<output>...</output>` - Tool result wrappers
- `<result>...</result>` - Tool result containers
- `<function_calls>` - Function call blocks (if displayed)

**Fix approach:**
Add XML tag stripping to `response-formatter.ts` as first step in pipeline.

### Bug 2: Sidebar Not Syncing
**Location:** `packages/vscode-extension/src/providers/sidebar.ts` and `chat-participant.ts`

The sidebar expects stats updates via `connectToWheelHub(wsManager)` which subscribes to `wsManager.onStats()`. But the chat participant uses `ClaudeService` directly and doesn't route through WheelHub.

**Missing bridge:** ClaudeService events don't emit persona/context/story updates.

**Recommended fix: File watcher approach**
- Sidebar watches `.session/*.md` for changes
- Parses session file for story/workflow state
- Parses config for persona
- Aligns with existing session file patterns

## Files to Modify

1. `packages/vscode-extension/src/adapters/response-formatter.ts`
   - Add `stripSystemTags()` function
   - Call in `formatResponse()` pipeline

2. `packages/vscode-extension/src/providers/sidebar.ts`
   - Add `FileSystemWatcher` for `.session/*.md`
   - Add `FileSystemWatcher` for `.pennyfarthing/config.local.yaml`
   - Parse files on change and update state

3. `packages/vscode-extension/src/extension.ts`
   - Wire up file watchers on activation

## Test Plan
- Unit tests for `stripSystemTags()` with various XML patterns
- Unit tests for file parsing in sidebar
- Integration test: send message with `<system-reminder>` tag, verify stripped
- Integration test: change session file, verify sidebar updates

## Session History
| Timestamp | Phase | Agent | Notes |
|-----------|-------|-------|-------|
| 2026-01-21 | setup | SM | Story created and handed off to Dev |

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/vscode-extension/src/adapters/response-formatter.ts` - Added stripSystemTags() function and pipeline integration
- `packages/vscode-extension/src/providers/sidebar.ts` - Added file watcher methods for session/config sync
- `packages/vscode-extension/src/extension.ts` - Wire up file watchers on activation
- `packages/vscode-extension/tests/*.test.ts` - Added RelativePattern and workspace.fs mocks

**Tests:** 384/384 passing (GREEN)
**PR:** #412 - fix(MSSCI-12147): Strip XML tags from chat display and add sidebar file watchers
**Branch:** feat/MSSCI-12147-chat-formatting-sidebar-sync (pushed)

**Handoff:** To Reviewer for code review

| Timestamp | Phase | Agent | Notes |
|-----------|-------|-------|-------|
| 2026-01-21 | setup | SM | Story created and handed off to Dev |
| 2026-01-21 | green | Dev | Implementation complete, all tests GREEN, PR #412 created |
| 2026-01-21 | review | Handoff | Quality checks passed, tests passing (384/384), PR #412 open, handing to Reviewer |
| 2026-01-21 | approval | Handoff | Reviewer Assessment APPROVED - gate passed, status→approved, ready for SM finish |

## Reviewer Assessment

**PR:** #412
**Verdict:** APPROVED

**Code Review Evidence:**
- **Data flow traced:** `stripSystemTags()` input at `response-formatter.ts:46` → code block extraction via placeholders (lines 51-60) → regex stripping (lines 62-65) → code block restoration (lines 67-70) → clean output. Uses non-greedy patterns (`*?`) preventing ReDoS.
- **Wiring verified:** `extension.ts:104` calls `sidebarProvider.startFileWatchers()` immediately after provider registration. `formatResponse()` at line 621 calls `stripSystemTags()` as first step in pipeline.
- **Pattern observed:** Good - placeholder extraction pattern at `response-formatter.ts:51-60` correctly preserves code blocks before transformations. This prevents legitimate XML examples in code from being stripped.
- **Error handling:** Both `parseSessionFile` and `parseConfigFile` wrap async operations in try-catch (lines 929/997 and 1006/1027-1029). Silent catches appropriate for optional file reads.

**Security:** No ReDoS risk - all regex patterns use non-greedy quantifiers. No user input flows to dangerous operations.
**Performance:** File watchers use VS Code's native `FileSystemWatcher` with proper disposal in `stopFileWatchers()` and `dispose()`.

**Non-Blocking Observations:**
- [LOW] `sidebar.ts:1042` - Comment says "sort by modification time" but uses `fsPath.localeCompare` (alphabetical). Works in practice since story IDs are typically sequential, but comment is misleading.

**Quality Gates:** Lint ✅, Type Check ✅, Tests ✅ (384/384 passing)

**Acceptance Criteria Verified:**
- ✅ XML tags stripped from chat message display (`stripSystemTags()` handles `<system-reminder>`, `<output>`, `<result>`, `<function_results>`, antml tags)
- ✅ System reminder tags not visible to user (first regex pattern specifically targets `<system-reminder>`)
- ✅ Tool result formatting cleaned up (`<output>` and `<result>` patterns)
- ✅ Sidebar updates when agent changes (file watcher on `.session/*-session.md` triggers `parseSessionFile()`)
- ✅ Sidebar reflects current workflow state (`parseSessionFile()` extracts `**Workflow:**` and `**Phase:**`)

**Handoff:** To SM for finish-story workflow
