# Session: MSSCI-12474 - Persona section: Tighten layout

## Story Details

**Story ID:** MSSCI-12474
**Jira Key:** MSSCI-12474
**Title:** Persona section: Tighten layout
**Description:** Reduce vertical sprawl in persona section for more compact display.

**Points:** 1
**Priority:** P1
**Status:** backlog (moving to in_progress)
**Workflow:** trivial
**Repos:** pennyfarthing

## Epic Context

**Epic:** epic-64 - Cyclist UX Polish
**Epic Jira Key:** MSSCI-12465

**Epic Description:** Improve Cyclist terminal UX based on UX Overview PRD - fix bugs, polish existing features, and add missing visibility. Covers DIFFS panel, stats strip, sidebar sections, tab bar, and fresh start state management.

**Epic Status:** backlog
**Epic Priority:** P1

## Acceptance Criteria

- [x] Persona section more compact
- [x] All essential info still visible

## Branch Details

**Feature Branch:** feat/MSSCI-12474-persona-tighten-layout

## Workflow Information

**Workflow Type:** trivial
**Workflow Phase:** finish
**Status:** Ready for finish

## Session Timeline

**Session Started:** 2026-01-27
**Assignee:** me

---

## Work Summary

This is a trivial story (1 point) focused on reducing vertical sprawl in the Cyclist persona section for a more compact display. The goal is to tighten the layout while keeping all essential information visible.

This story is part of epic-64 (Cyclist UX Polish), which addresses UX improvements based on the UX Overview PRD.

---

## SM Assessment

Setup phase complete. Feature branch `feat/MSSCI-12474-persona-tighten-layout` created and ready. Story MSSCI-12474 claimed in Jira. Handoff to Dev for implementation phase.

---

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/cyclist/src/public/index.html` - Removed OCEAN scores HTML, added portrait thumbnail in header
- `packages/cyclist/src/public/js/persona.js` - Removed OCEAN scores update function and call
- `packages/cyclist/src/public/js/sidebar/portrait.js` - Added thumbnail portrait sync when main portrait loads
- `packages/cyclist/src/public/styles.css` - Removed OCEAN CSS, added portrait thumbnail styles for collapsed state

**Changes:**
1. Removed OCEAN personality scores from persona section (saves ~5 rows of vertical space)
2. Added small 32x32 portrait thumbnail that appears in header when section is collapsed
3. Thumbnail uses small portrait size (64x64 source) for efficiency

**Tests:** All persona display tests pass. Pre-existing portrait alt text test failures are unrelated to these changes.
**PR:** #513 - feat(cyclist): tighten persona section layout (MSSCI-12474)
**Branch:** feat/MSSCI-12474-persona-tighten-layout (pushed)

**Handoff:** To Reviewer for code review

---

## Reviewer Assessment

**Verdict:** APPROVED

**Data flow traced:** `loadPortraitWithTheme(slug, theme)` → builds thumbPath → sets `thumbImg.src` → browser loads → `handleThumbLoad()` shows image. On error, falls back to discworld theme, then to placeholder SVG. Clean flow that mirrors main portrait behavior.

**Observations:**

| Severity | Issue | Location | Action |
|----------|-------|----------|--------|
| [VERIFIED] | OCEAN removal is clean - HTML, JS, CSS all removed | Multiple files | None |
| [VERIFIED] | Thumbnail wiring correct - init queries DOM, attaches handlers, destroy cleans up | portrait.js:243-260 | None |
| [VERIFIED] | CSS collapse logic correct - display:none by default, display:block when .collapsed | styles.css:2215-2224 | None |
| [VERIFIED] | Error handling matches main portrait pattern | portrait.js:160-165 | None |
| [LOW] | Empty alt text on thumbnail | index.html:203 | Could add alt text for a11y, not blocking |
| [LOW] | Minor race in fallback theme check | portrait.js:161 | Benign - worst case shows placeholder |

**Security analysis:** No user input, no DOM injection, no sensitive data. Safe.

**Hard questions:**
- Null/empty slug? → Returns early at portrait.js:130, safe
- No portrait file? → Fallback chain handles gracefully
- Theme change during load? → May show wrong fallback, minor

**Acceptance Criteria:**
- [x] Persona section more compact - OCEAN scores removed (saves ~5 rows)
- [x] All essential info still visible - character name, role, theme, quote, benchmark all retained

**Handoff:** To SM for finish-story
