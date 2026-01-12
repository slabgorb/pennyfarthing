# Story 25-5: Structured Output Markers - Completion Summary

## What Was Built

Story 25-5 introduced **structured output markers** - HTML comment annotations that Pennyfarthing agents emit to signal their intent explicitly. This replaces the ~80% accuracy of regex heuristics with 100% reliable detection for quick-action buttons in Cyclist. The feature is backward-compatible: existing pattern detection remains as a fallback when no markers are present.

## Key Technical Decisions

1. **Marker Format:** `<!-- CYCLIST:TYPE:value -->` chosen because HTML comments are invisible when rendered but parseable by the detection layer. Case-insensitive for TYPE, case-preserving for value.

2. **Priority Architecture:** Markers are checked FIRST in `processMessageForQuickActions()`, before any pattern-based heuristics. This ensures explicit agent intent always wins over ambiguous natural language.

3. **Code Block Exclusion:** Markers inside triple-backtick code blocks are ignored, preventing false positives when documenting the marker format in examples.

4. **No `stripMarkers()` Export:** The implementation uses `detectStructuredMarkers()` directly rather than a separate strip function. Markers are already invisible as HTML comments - no stripping needed for display.

## Implementation Patterns

- **Non-greedy Regex:** `/<!--\s*CYCLIST:(\w+):([^>]+?)\s*-->/gi` uses `+?` to prevent ReDoS vulnerabilities
- **Null Safety Chain:** Early returns at each processing step (null input → empty text → no matches → unknown type)
- **Source Attribution:** Results include `source: 'structured_marker'` to distinguish from pattern-detected results

## Files Modified

| File | Purpose |
|------|---------|
| `quick-actions.js` | Added `detectStructuredMarkers()`, `processStructuredMarkers()`, priority integration |
| `index.js` (message-view) | Re-exported `detectStructuredMarkers` |
| `B-9.6-suggested-prompts.test.ts` | 35 tests covering all marker types and edge cases |
| `sm.md`, `tea.md`, `dev.md`, `reviewer.md` | Added handoff marker guidance to each agent |
| `shared-agent-behavior.md` | Documented marker specification with examples |

## Lessons for Future Work

1. **Cross-Repo Coordination:** Story touched both Cyclist (detection) and Pennyfarthing (emission). Session file format worked well for tracking changes across repos.

2. **Test Count Evolution:** Started with 25 tests in TEA phase, ended with 35 - Dev added integration tests discovered during implementation. Session file should track final test count, not initial.

3. **HTML Comments as Control Channel:** The `<!-- CYCLIST:TYPE:value -->` pattern could extend to other structured data (context hints, progress markers) without user-visible changes.

## Metrics

- **Points:** 3 (Standard)
- **TDD Flow:** SM → TEA → Dev → Reviewer → SM
- **PR:** #177 (merged)
- **Tests:** 35 (all GREEN)
- **Files:** 8 modified
