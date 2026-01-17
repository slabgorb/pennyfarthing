# Story 35-12: Skill Invocations Panel - Summary

**Completed:** 2026-01-16
**Points:** 3
**Workflow:** BDD (Behavior-Driven Development)
**Jira:** MSSCI-11727

## What Was Built

A dedicated right-side panel in Cyclist for monitoring skill invocations during agent sessions. Users can now see which skills (/commit, /review-pr, /workflow, etc.) were called, when they were invoked, and their execution status in real-time.

The panel displays skill entries with name, timestamp, and status indicators (running spinner, checkmark, error icon). Rows are expandable to show function arguments, result summaries, duration, and error details. The panel supports collapse/expand via mouse and keyboard, with state persistence to localStorage.

## Key Technical Decisions

1. **Pattern Compliance:** Followed the existing tool-panel.js pattern exactly, ensuring consistency with the Cyclist panel system (file-panel, diff-panel, tool-panel).

2. **IPC Architecture:** Created `IPC_SKILL_CHANNELS` constant with five channels (skill:start, skill:complete, skill:error, skill:get, skill:clear) for main↔renderer communication.

3. **XSS Prevention:** Added `escapeHtml()` function for user-controlled fields (args, result, error) - more defensive than existing ToolLogViewer.

4. **Accessibility First:** Semantic HTML with role="region", aria-label, aria-expanded, and full keyboard navigation support.

## Implementation Patterns

- **Panel State Persistence:** localStorage with try/catch fallbacks (identical to tool-panel.js)
- **Entry Lifecycle:** Skill events tracked from SDK messages, updated via IPC, rendered with DOM diffing for expanded state preservation
- **Resize-to-Collapse UX:** 50px threshold for drag-to-collapse, consistent with other panels
- **PanelManager Integration:** Keyboard shortcut "4", badge count notifications

## Files Modified

| File | Lines Changed | Purpose |
|------|--------------|---------|
| `packages/cyclist/src/public/js/skill-panel.js` | +529 | Panel implementation |
| `packages/cyclist/src/public/index.html` | +34 | Panel HTML structure |
| `packages/cyclist/src/public/styles.css` | +243 | Panel CSS styling |
| `packages/cyclist/src/ipc-channels.ts` | +12 | IPC channel constants |
| `packages/cyclist/src/main.ts` | +129 | IPC handlers, skill event tracking |
| `packages/cyclist/src/preload.ts` | +65 | Preload API exposure |
| `packages/cyclist/tests/35-12-skill-panel.test.ts` | +700 | Test suite (76 tests) |

## Lessons for Future Work

1. **BDD Workflow:** This was the first story using the BDD workflow (UX-Designer → TEA → Dev → Reviewer). The UX spec with Gherkin scenarios proved valuable for test-first development.

2. **Panel Pattern Extraction:** The tool-panel.js pattern is mature and well-tested. Future panels should continue to follow this pattern until it warrants extraction into a base class.

3. **Defense in Depth:** Even for trusted data (SDK messages), adding XSS prevention provides security-in-depth. The Reviewer noted this was more defensive than existing patterns.

4. **Minor Debt:** No MAX_ENTRIES limit on the skill log - could grow unbounded in very long sessions. This is consistent with ToolLogViewer but should be addressed in a future cleanup story.
