# Story 11-11: Tweak spider chart design

## Story Info
- **ID:** 11-11
- **Title:** Tweak spider chart design
- **Points:** 1
- **Epic:** epic-11 (OCEAN Personality Visualization)
- **Status:** in_progress
- **Phase:** dev
- **Started:** 2026-01-01

## Description
Follow-up to refine spider chart visual design based on review.

## Design Spec (from UX review with Basnaaid)

### 1. Black Background
Add explicit black background to all SVGs for consistent rendering:
```svg
<rect width="200" height="200" fill="#000000" />
```

### 2. Updated Color Palette (for black background)

| Element | Current | New |
|---------|---------|-----|
| Background | none | `#000000` |
| Labels (O/C/E/A/N) | `#374151` | `#e5e7eb` |
| Grid lines | `#e5e7eb` | `#374151` |
| Axis lines | `#9ca3af` | `#4b5563` |
| Data stroke | `#2563eb` | Keep (works on black) |

### 3. Vertical Index Layout
Change markdown index files from horizontal grid to vertical list for easier visual comparison:
- One chart per row
- Aligned for easy shape comparison
- Theme/agent/character info alongside

### 4. Regenerate All Charts
After style changes, regenerate all 630 spider charts.

## Acceptance Criteria
- [ ] Design tweaks applied to generate-spider.ts
- [ ] All 630 spider charts regenerated
- [ ] Visual improvements validated in markdown indices
- [ ] No test regressions

## Files to Modify
- `src/scripts/generate-spider.ts` - color constants, add background rect
- `src/scripts/generate-all-spiders.ts` - regenerate all
- `pennyfarthing-dist/personas/spiders/team-spiders.md` - vertical layout
- `pennyfarthing-dist/personas/spiders/role-spiders.md` - vertical layout

## Technical Notes
- dist/ is versioned (serve from git repo)
- Overlay colors verified for black background contrast
- Stacking will be done in SVG, not external composition

## Workflow
- [x] SM: Story setup
- [x] UX: Design review (Basnaaid)
- [x] Dev: Implementation
- [ ] Reviewer: Code review

---
## Session Log

### 2026-01-01 - SM (Breq)
- Story claimed from backlog
- UX review conducted with Basnaaid
- Design spec finalized: black background, light labels, vertical layout
- Handoff to Dev (1-point story, skipping TEA)

### 2026-01-01 - Dev (Lieutenant Tisarwat)
Implementation complete (with refinements):

**Files Modified:**
- `src/scripts/generate-spider.ts` - Black background, role colors, team overlay function
- `src/scripts/generate-all-spiders.ts` - Vertical layout, team overlays, role color legend
- `src/scripts/generate-all-faces.ts` - Vertical layout for consistency

**Spider Chart Changes:**
1. Added `BACKGROUND_COLOR = '#000000'` and `<rect>` to all SVGs
2. Updated `LABEL_COLOR` to `#e5e7eb` (visible on black)
3. Updated `GRID_COLOR` to `#374151` (subtle on black)
4. Updated `AXIS_COLOR` to `#4b5563`
5. Added `ROLE_COLORS` - 10 distinct colors for each agent role
6. Individual charts now use role-specific colors
7. Added `generateTeamOverlay()` - stacks all 10 roles per theme
8. Team markdown shows overlay at top of each theme section
9. Role color legend in markdown header
10. Vertical layout for easy visual comparison

**Role Color Palette:**
| Role | Color |
|------|-------|
| Orchestrator | `#f59e0b` (amber) |
| SM | `#10b981` (emerald) |
| TEA | `#ef4444` (red) |
| Dev | `#3b82f6` (blue) |
| Reviewer | `#8b5cf6` (purple) |
| Architect | `#06b6d4` (cyan) |
| PM | `#ec4899` (pink) |
| Tech Writer | `#84cc16` (lime) |
| UX Designer | `#f97316` (orange) |
| DevOps | `#6366f1` (indigo) |

**Faces Changes:**
- Updated team-photos.md to vertical layout
- Updated role-gallery.md to vertical layout

**Generated Output:**
- 630 individual spider charts (role-colored)
- 63 team overlay charts
- 630 Chernoff faces (unchanged, layout updated)
- 4 markdown indices (all vertical)

**Test Results:** 455 tests pass, 0 failures

Ready for review.
