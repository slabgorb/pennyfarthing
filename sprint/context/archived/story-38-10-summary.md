# Story 38-10: SM Gate for Epic Technical Context - Completion Summary

## What Was Built

Implemented an epic context gate in the SM workflow that checks for `sprint/context/context-epic-{N}.md` before story setup. When missing, the gate provides clear messaging and SM can create the context file from a structured template. This ensures every story starts with proper understanding of its epic's technical landscape.

## Key Technical Decisions

1. **Gate placement:** Added to `generic-sm-setup.ts` as exported functions rather than embedded in sm.md prose, making it testable and reusable
2. **Non-blocking design:** Gate returns structured results (`exists: boolean`, `message: string`) rather than throwing, allowing SM to decide next action
3. **Check-before-write:** `createEpicContext()` refuses to overwrite existing files, preventing accidental context loss
4. **Interface extension:** Added `CheckEpicContextParams`/`CheckEpicContextResult` and `CreateEpicContextParams`/`CreateEpicContextResult` following existing pattern from `ResearchParams`/`SetupParams`

## Implementation Patterns

- **Structured results:** All functions return typed result objects with success/failure states and human-readable messages
- **Path construction:** Uses `path.join(contextDir, \`context-epic-${epicId}.md\`)` for safe path building
- **Template-based generation:** Epic context follows documented template structure (overview, technical landscape, key files, patterns, dependencies)
- **Synchronous file ops:** Acceptable for setup-phase single-file operations, not on hot path

## Files Modified

| File | Changes |
|------|---------|
| `packages/core/src/workflow/generic-sm-setup.ts` | Added `checkEpicContext()`, `createEpicContext()` functions; extended interfaces |
| `packages/core/src/workflow/sm-subagents.test.ts` | Added 8 tests covering all testable ACs |
| `pennyfarthing-dist/agents/sm.md` | Documented Epic Context Gate in critical-gates section |
| `sprint/current-sprint.yaml` | Story tracking updates |

## Lessons for Future Work

1. **Documentation drift:** sm.md mentions `MODE=epic-context` which isn't implemented yet - keep docs in sync with actual capabilities
2. **Error stringification:** Could improve error message clarity with `error instanceof Error ? error.message : String(error)` pattern
3. **Edge case:** No test for when `contextDir` doesn't exist (would throw ENOENT) - consider adding defensive directory creation
4. **Gate adoption:** Currently advisory - future stories could make this a hard requirement once all active epics have context

## Metrics

- **Points:** 2
- **Phase durations:** Setup 18h, Red 7m, Green 5h 27m, Review 2h 46m
- **Tests added:** 8
- **PR:** #285
