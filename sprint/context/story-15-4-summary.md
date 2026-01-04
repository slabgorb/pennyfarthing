# Story 15-4: Set up sprite symlink and end-to-end test

## Story Summary

Final integration setup and testing for Cyclist-Pennyfarthing sprite display.

## Work Completed

### Terminology Update: Sprites → Portraits

During development, all references to "sprites" were updated to "portraits" throughout the Pennyfarthing codebase. This reflects the reality that we're using individual portrait images rather than sprite sheets.

### Pennyfarthing Repository Changes

All sprite references systematically renamed to portrait references:

**Directory Structure:**
- `showcase/public/sprites/` → `showcase/public/portraits/` (993 portrait files)
- `showcase/src/data/sprite-prompts/` → `showcase/src/data/portrait-prompts/`

**Component Updates (6 files):**
- `showcase/src/components/CharacterCard.tsx` - spritePath → portraitPath
- `showcase/src/components/ThemeCard.astro` - spritePath → portraitPath
- `showcase/src/components/ProfileCard.astro` - sprite path → portrait path
- `showcase/src/components/PortraitTooltip.astro` - spritePath → portraitPath
- `showcase/src/components/QueryBuilder.tsx` - ChipPortrait spritePath → portraitPath
- `showcase/src/pages/characters/[theme]/[role].astro` - sprite path → portrait path

**Script Renames (3 files):**
- `showcase/src/data/portrait-prompts/generate-sprites.py` → `generate-portraits.py` (updated output directory)
- `showcase/src/data/portrait-prompts/queue-sprites.sh` → `queue-portraits.sh`
- `showcase/src/data/portrait-prompts/generate-prompts.js` - removed "sprite sheet" terminology

**PR:** https://github.com/keithavery/pennyfarthing/pull/71 (APPROVED)

### Cyclist Integration

**Integration Setup:**
- Replaced `images` symlink with `portraits` symlink pointing to `pennyfarthing/showcase/public/portraits`
- Updated `src/public/js/persona.js` to use `/portraits/${persona.theme}/${persona.role}.png`
- Updated `src/pennyfarthing.ts` Persona interface to include `theme` property
- Updated `getCurrentPersona()` to return theme in API response

**Key Implementation:**
```
Data flow: persona.theme from getCurrentPersona() → persona.js portrait path construction
Path: /portraits/{theme}/{role}.png with graceful fallback to discworld theme
```

**PR:** https://github.com/keithavery/cyclist/pull/8 (APPROVED)

## Acceptance Criteria - All Met

- [x] Sprite symlink works correctly (renamed to portraits with proper path)
- [x] Full integration flow tested and working
- [x] Agent changes reflected in sidebar (theme and role-based portraits)
- [x] Documentation updated with portrait terminology

## Code Review Evidence

**Data Flow Traced:** `persona.theme` from `pennyfarthing.ts:319` through to portrait path construction at `persona.js:40`. Theme value originates from `persona-config.yaml` (trusted local file) - no injection risk.

**Patterns Observed:**
- Null check on `persona.role && persona.theme` before constructing path
- Graceful fallback to discworld theme when portrait not found
- Consistent use of `portraitPath` variable naming in all components
- All paths use template literals - no string concatenation bugs

**Security:** No auth changes. All paths are static file references with validated theme/role values.

## Test Results

Manual E2E testing completed successfully:
- Cyclist sidebar displays correct persona portrait
- Portrait loading works with theme-aware paths
- Agent switching updates portrait correctly
- Fallback handling works as expected

**Note:** 2-point trivial story - no automated test suite required. Manual E2E verification was the focus.

## Files Changed Summary

**Pennyfarthing:**
- 8 component/page files updated
- 3 scripts renamed/updated
- 2 directories renamed (993 portrait files maintained)

**Cyclist:**
- 3 files modified (persona.js, pennyfarthing.ts, public structure)
- 1 symlink replaced

## Related Stories

- Depends on: 15-3 (Enhance Cyclist sidebar) ✓
- Epic: 15 (Cyclist-Pennyfarthing Integration)
- Sprint: 6

## Reviewer Assessment

**Status:** APPROVED
**Reviewer:** Josh Lyman (Code Reviewer)

All acceptance criteria verified. Implementation complete and ready for merge.

## Next Steps

- Both PRs ready for merge when approved by maintainers
- Portrait-based sprite system now live in integrated Cyclist+Pennyfarthing workflow
- Story points: 2/2 complete
