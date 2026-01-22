# Story 35-1: Contextual Settings Placement - Summary

## What Was Built

Relocated frequently-used Cyclist settings from the buried Settings dialog to contextual locations where users interact with them. Theme selection now lives in the persona area (one click to change themes), and the auto-handoff toggle moved to the editor toolbar for instant access during agent work.

## Key Technical Decisions

1. **Lightweight ThemePicker vs full ThemeBrowser** - Created a minimal dropdown component (`ThemePicker.js`) showing recent themes + "Browse all" link. Full browser stays in settings for deep exploration. This keeps the persona click interaction fast.

2. **Dual-write pattern for themes** - Theme changes write to both `~/.cyclist/settings.yaml` AND `.claude/persona-config.local.yaml`. Maintains compatibility with Pennyfarthing theme system while Cyclist manages its own settings.

3. **HTTP fallback for IPC** - Both new components check for `window.electronAPI` first (Electron environment), fall back to HTTP API calls. Enables web-based testing and potential future browser UI.

4. **Settings API router** - Added `PATCH /api/settings` endpoint for partial updates. Previously settings were GET-only; now individual settings can be updated without full replacement.

## Implementation Patterns

- **Contextual controls pattern**: Put settings where the action happens. Theme in persona area (where theme is displayed), handoff toggle in toolbar (where agent work happens).
- **Component isolation**: New `ThemePicker.js` is self-contained, doesn't modify existing `ThemeBrowser.js`. Avoids coupling.
- **Data attribute signaling**: Toggle button uses `data-handoff-mode` attribute for CSS styling and test assertions.

## Files Modified

| File | Change |
|------|--------|
| `packages/cyclist/src/public/js/components/ThemePicker.js` | New - lightweight theme selector |
| `packages/cyclist/src/public/js/persona.js` | Theme picker integration (init, show, hide, update) |
| `packages/cyclist/src/public/js/editor/toolbar.js` | Handoff toggle functions |
| `packages/cyclist/src/public/index.html` | Theme picker container, handoff toggle button |
| `packages/cyclist/src/public/settings.html` | Removed workflow + pennyfarthing sections |
| `packages/cyclist/src/api/settings.ts` | New settings router with PATCH |
| `packages/cyclist/src/api/index.ts` | Export settings router |
| `packages/cyclist/src/server.ts` | Mount settings router |

## Test Coverage

40 tests in `packages/cyclist/tests/35-1-contextual-settings.test.ts`:
- AC1: 9 tests - Theme picker rendering and selection
- AC2: 9 tests - Toolbar handoff toggle
- AC3: 10 tests - Settings dialog simplification
- AC4: 9 tests - Settings API and persistence
- Integration: 6 tests - End-to-end workflows

## Lessons for Future Work

1. **Settings can have multiple homes** - The dual-write pattern works. A setting can appear in both a quick-access location AND the full settings dialog without conflict.

2. **Repo-wide test impact** - Changing settings UI broke tests in other stories (31-13, B-24-5) that expected the old settings structure. When removing UI elements, grep for dependent tests.

3. **HTTP fallback is cheap insurance** - Adding fallback HTTP calls when IPC isn't available took ~5 extra lines per component but enables web testing and future flexibility.
