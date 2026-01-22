# Story 31-13: Context-aware handoffs with auto-compaction - Summary

## What Was Built

Replaced Cyclist's dual-checkbox handoff settings (auto_handoff + handoff_confirm) with a single radio button group offering "Auto handoff" and "Manual handoff (ask first)" modes. The generic-handoff module now reads this setting and returns appropriate behavior (immediate vs. prompt). Legacy settings are automatically migrated.

## Key Technical Decisions

1. **Radio vs checkboxes:** Two booleans were confusing (what if auto=true but confirm=true?). Single radio group with mutually exclusive options is clearer UX.

2. **Default to manual:** Conservative choice - users must explicitly opt-in to auto behavior.

3. **Custom YAML parser:** Rather than adding a full YAML library dependency to generic-handoff (which runs in subagent context), implemented a simple line-by-line parser that only needs to find one field. Pragmatic over perfect.

4. **MVP scope:** Deferred context percentage detection (AC1-5) and auto-compaction (AC6) because Claude Code doesn't expose context usage programmatically. Settings infrastructure ships now; behavior extension follows.

## Implementation Patterns

- **Settings pattern:** Follows Story 24-1 architecture - `settings.ts` (types + validation), `settings-ui.js` (form binding), `main.ts` (IPC handlers)
- **Migration pattern:** Check for new format first, fall back to legacy conversion
- **Safe defaults:** All parsing functions return 'manual' on any error

## Files Modified

| File | Change |
|------|--------|
| `packages/cyclist/src/public/settings.html` | Radio button group with fieldset/legend |
| `packages/cyclist/src/settings.ts` | `HandoffMode` type, migration function, validation |
| `packages/cyclist/src/public/js/settings-ui.js` | Radio button form handlers |
| `packages/cyclist/src/main.ts` | `handleSettingsSave` return type to `{ success, settings }` |
| `packages/core/src/workflow/generic-handoff.ts` | `readHandoffMode`, `getHandoffBehavior`, `formatHandoffHistory` |
| `packages/cyclist/tests/24-1-settings-panel.test.ts` | Updated 7 legacy tests |
| `packages/cyclist/tests/31-13-handoff-mode.test.ts` | 37 new tests |

## Lessons for Future Work

1. **Context detection:** If Claude Code ever exposes context usage, implement AC1-5 in a follow-up story. The settings infrastructure is ready.

2. **YAML parsing:** The custom parser in generic-handoff.ts is fragile for complex YAML. If we need to parse more fields, consider bundling a lightweight YAML library.

3. **IPC return types:** The `handleSettingsSave` return type change is a breaking change pattern. Document and test all callers when changing return types.

## PR

- **Number:** #240
- **Title:** feat(31-13): Context-aware handoffs with handoff mode settings
- **URL:** https://github.com/1898andCo/pennyfarthing/pull/240

## Metrics

- **Points:** 3
- **Duration:** ~45 minutes (setup to approval)
- **Tests added:** 37
- **Tests total:** 2185 (all passing)
