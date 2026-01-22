# Story 22-7: Token Count Accuracy & UI Improvements - Summary

**Completed:** 2026-01-10
**Points:** 3
**Epic:** 22 - Verbose Mode - Tool Visibility & Intervention

## What Was Built

Enhanced Cyclist's UI with three major improvements:
1. **Dual Token Display** - Separated cumulative session tokens (OTLP) from current context window tokens (transcript), clearly labeling each with "Session:" and "Context:" prefixes
2. **Portrait Panel Redesign** - Restructured sidebar with character name above portrait, role/OCEAN beside it, theme below, and removed the quote element for cleaner layout
3. **Diff Panel Horizontal Scroll** - Fixed CSS to enable horizontal scrolling for long code lines without text wrapping

## Key Technical Decisions

- **Token Disambiguation**: Rather than trying to reconcile two fundamentally different metrics (cumulative vs. current), we display both with clear labels so users understand what each represents
- **Context Meter as Truth**: The transcript-based context meter remains the source of truth for context window usage, while OTLP tokens show session totals
- **Minimal CSS Fix**: The diff panel scroll fix used `flex: none` + `white-space: pre` to match existing patterns in parent elements, requiring only 3 lines of CSS change

## Implementation Patterns

- **Stats Strip Pattern**: Token counts use `.stats-label` class with arrow indicators (↓ for input, ↑ for output)
- **Flex Layout Escape**: When content needs to expand beyond flex container constraints, use `flex: none` to opt out of flex sizing
- **Consistent Whitespace**: Diff viewer uses `white-space: pre` at multiple levels (`.diff-line`, `.diff-line-content`) for consistent code formatting

## Files Modified

**Portrait Panel:**
- `packages/cyclist/src/public/index.html` - Restructured persona section
- `packages/cyclist/src/public/styles.css` - Layout styles, sidebar width 220→300px
- `packages/cyclist/src/public/js/persona.js` - Full character name, removed quote

**Token Display:**
- `packages/cyclist/src/public/index.html` - Stats labels, context-tokens display
- `packages/cyclist/src/public/styles.css` - Stats label styles
- `packages/cyclist/src/public/js/stats-strip.js` - Updated context meter

**Diff Panel Scroll:**
- `packages/cyclist/src/public/styles.css` - `.diff-line-content { flex: none; white-space: pre; }`

**Tests Updated:**
- `packages/cyclist/tests/portrait.test.ts` - 128px expectations
- `packages/cyclist/tests/sidebar.test.ts` - 128px expectations

## Lessons for Future Work

1. **Dual Metric Display**: When two data sources measure related but different things, display both with clear labels rather than trying to reconcile them
2. **CSS Flex Gotcha**: `flex: 1` in a child can override `white-space: pre` in the parent - use `flex: none` when content must not shrink
3. **Theme Skill**: The `/theme` skill now provides centralized documentation for theme management - reference it from CLAUDE.md rather than duplicating theme lists
