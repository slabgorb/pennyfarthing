# Story 57-1: Persona Card Webview

## Session Info
- **Story:** 57-1
- **Jira:** MSSCI-12191
- **Epic:** 57 - Agent Identity & Emotional Connection
- **Branch:** feat/MSSCI-12191-persona-card-webview
- **Started:** 2026-01-22

## Status
Story complete. PR merged. Ready for archival.

## Current Phase
**PHASE: finish**

## Story Context
Enhance the existing `agent-portrait-webview.ts` to create a proper persona card with:
- Agent portrait image (180px)
- Character name prominently displayed (larger font, styled)
- Theme name/badge showing current theme
- Populates within 2 seconds of activation

## Technical Approach
The VS Code extension already has `agent-portrait-webview.ts` (731 lines) that displays portraits.
This story enhances it with better UI for character name and theme badge.

### Files to Modify
- `packages/vscode-extension/src/providers/agent-portrait-webview.ts` - Main webview provider
- `packages/vscode-extension/src/webview/persona-card-styles.css` (new) - Extracted styles

### Existing Patterns
- Webview HTML with nonce-based CSP
- File watchers on `.pennyfarthing/config.local.yaml`
- Theme YAML parsing for character name extraction
- Portrait URI generation via `webview.asWebviewUri()`

### Key Code Locations
- Portrait resolution: `agent-portrait-webview.ts:319-330`
- HTML generation: `agent-portrait-webview.ts:_getHtmlContent()`
- Theme parsing: `agent-portrait-webview.ts:_parseThemeYaml()`

## Acceptance Criteria
- [x] AC1: Sidebar webview displays agent portrait image (180px)
- [x] AC2: Character name prominently displayed below portrait
- [x] AC3: Theme name/badge visible below character name
- [x] AC4: Card populates within 2 seconds of extension activation

## Testing Strategy
Test file: `packages/vscode-extension/tests/MSSCI-12191-persona-card-webview.test.ts`

### Test Cases
1. HTML structure contains portrait img, character name h2, theme badge
2. Character name extracted from theme YAML
3. Theme badge shows correct theme name
4. Activation timing < 2000ms

## TEA Assessment

**Tests Required:** Yes
**Reason:** UI enhancement story with 4 testable acceptance criteria

**Test Files:**
- `packages/vscode-extension/tests/MSSCI-12191-persona-card-webview.test.ts` - 20 tests covering all 4 ACs

**Tests Written:** 20 tests covering 4 ACs
**Status:** RED (11 failing, 9 passing - ready for Dev)

**Key Failures:**
1. AC2: Character name should use `<h2>` element (currently `<div>`)
2. AC2: Font size should be >= 18px (currently 14px)
3. AC3: `theme-badge` element missing entirely
4. AC3: Theme badge pill styling missing
5. Integration: theme-badge not in HTML structure

**Implementation Notes for Dev:**
- Modify `_getHtmlForWebview()` method in `agent-portrait-webview.ts`
- Change character-name from `<div>` to `<h2>`, increase font to 18px
- Add `<span class="theme-badge">` after character-role
- Add CSS for `.theme-badge` with pill styling (border-radius, background, padding)
- Add `formatThemeName()` function to display "Greek Mythology" instead of "greek-mythology"

**Handoff:** To Dev for implementation

## Dev Assessment

**Implementation Complete:** Yes
**PR:** #450

**Changes Made:**
- Modified `_getHtmlForWebview()` in `agent-portrait-webview.ts`
- Changed character-name from `<div>` to `<h2>` element
- Updated CSS: font-size 14px → 18px, font-weight 600 → bold
- Added `<span class="theme-badge">` after character-role
- Added `.theme-badge` CSS with pill styling (border-radius: 10px, padding, background)
- Added `_formatThemeName()` method to convert "greek-mythology" → "Greek Mythology"
- Updated inline JavaScript with `formatThemeName()` function and theme badge DOM handling

**Tests Status:** GREEN
- All 20 new tests passing (MSSCI-12191)
- All 50 original portrait tests passing (MSSCI-12148)
- Full VS Code extension suite passing (598 tests)

**Handoff:** To Reviewer for code review

## Reviewer Assessment

**Verdict:** APPROVE

**Files Reviewed:**
- `packages/vscode-extension/src/providers/agent-portrait-webview.ts` (+38/-4)
- `packages/vscode-extension/tests/MSSCI-12191-persona-card-webview.test.ts` (+549 new)

**Security Analysis:**
- CSP with nonce already in place
- `textContent` used (not innerHTML) - no XSS vectors
- Theme data from trusted local config
- Portrait URIs use proper `asWebviewUri()` pattern

**Edge Cases:**
- Empty/null theme handled correctly
- Themes without hyphens work (returns single-element array)

**Performance:**
- Simple O(n) string manipulation
- No DOM thrashing - single textContent updates
- No memory leaks

**Code Quality:**
- Follows existing patterns in the file
- Uses VS Code CSS variables for theming
- Tests comprehensive (20 tests covering all ACs)

**Minor Observations:**
- `formatThemeName` duplicated in TypeScript and inline JS (necessary for webview isolation)
- `text-transform: capitalize` + JS capitalization is redundant but harmless

**Findings:** None critical or major

**Handoff:** APPROVED - ready for SM to finish

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-23T06:37:50Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-23T06:15:36Z | 2026-01-23T06:16:24Z | 0m |
| test | 2026-01-23T06:16:24Z | 2026-01-23T06:20:57Z | 4m |
| red | 2026-01-23T06:20:57Z | 2026-01-23T06:21:00Z | 0m |
| green | 2026-01-23T06:21:00Z | 2026-01-23T06:26:00Z | 5m |
| review | 2026-01-23T06:26:00Z | 2026-01-23T06:37:50Z | 11m |

### Handoff History
| From | To | Gate | Status | Timestamp |
|------|-----|------|--------|-----------|
| red (TEA) | green (Dev) | tests_fail | PASSED | 2026-01-23T06:20:57Z |
| green (Dev) | review (Reviewer) | tests_pass | PASSED | 2026-01-23T06:26:00Z |
| review (Reviewer) | finish (SM) | approval | PASSED | 2026-01-23T06:37:50Z |
