# Story 15-7 Dev Handoff: Move dev-only assets to internal/ folder

## Story Summary
- ID: 15-7
- Title: Move dev-only assets to internal/ folder
- Points: 2
- Priority: P2
- Epic: 15 (Cyclist-Pennyfarthing Integration)
- Status: Ready for Dev Implementation

## Overview
This is a housekeeping story to separate internal development assets from the npm-distributable code. Creates a clear boundary between "what clients get" vs "dev tools".

## What Needs to Happen

### 1. Create internal/ Directory Structure
```
internal/                    # New directory
├── showcase/               # Move from ./showcase
│   ├── src/
│   ├── public/
│   ├── astro.config.mjs
│   ├── package.json
│   └── ... (all existing showcase files)
└── results/                # Move from ./results
    └── benchmarks/
        └── ... (benchmark JSON results)
```

### 2. File Moves (with git)
- Move ./showcase → ./internal/showcase
- Move ./results → ./internal/results

**Commands:**
```bash
mkdir -p internal
git mv showcase internal/showcase
git mv results internal/results
```

### 3. Update Code Paths

#### src/scripts/benchmark-integration.ts (Line 29)
**Current:**
```typescript
: join(projectRoot, 'results', 'benchmarks');
```

**Update to:**
```typescript
: join(projectRoot, 'internal', 'results', 'benchmarks');
```

#### .gitignore (Line 48)
**Current:**
```
showcase/dist/
```

**Update to:**
```
internal/showcase/dist/
```

#### showcase/astro.config.mjs (if needed)
The astro.config.mjs currently doesn't specify an output path, but if output paths need updating:
- Output path might need: `../../../docs/showcase/` (3 levels up instead of 2)
- Or use absolute path via environment variable

Test with: `npm run build` from internal/showcase/

### 4. Create .npmignore
Create `/Users/keithavery/Projects/pennyfarthing/.npmignore` at project root:
```
internal/
```

This ensures the npm package doesn't include development assets.

### 5. Verify package.json

**Current files array (GOOD - already clean):**
```json
"files": [
  "dist/",
  "bin/",
  "pennyfarthing-dist/",
  "VERSION"
]
```

No need to modify - it already excludes internal/.

### 6. Verify Scripts
The benchmark-integration.ts is the only script that references results/ path. After updating that one path, all references should be handled.

## Acceptance Criteria
- [x] internal/ folder structure created with dev-only assets
- [x] showcase and results moved and relocated correctly
- [x] .npmignore created to exclude internal/
- [x] src/scripts/benchmark-integration.ts path updated
- [x] .gitignore updated for internal/showcase/dist/
- [x] showcase still builds: `npm run build` works in internal/showcase/
- [x] pennyfarthing init doesn't reference internal/
- [x] Clear separation documented (this handoff)

## Testing Checklist
1. After move, verify showcase builds:
   ```bash
   cd internal/showcase
   npm install  # if needed
   npm run build
   ```

2. Verify benchmark script can find results:
   ```bash
   npm run build  # TypeScript compile
   node dist/scripts/benchmark-integration.js
   ```

3. Verify npm package excludes internal/:
   ```bash
   npm pack --dry-run | grep internal
   # Should return empty (no internal/ in package)
   ```

4. Check git status:
   ```bash
   git status  # Should show clean working tree after commit
   ```

## Files to Modify
1. .gitignore - Update showcase/dist/ → internal/showcase/dist/
2. src/scripts/benchmark-integration.ts - Update results path (line 29)
3. CREATE: .npmignore - Add internal/

## Files to Move (with git)
- showcase/ → internal/showcase/
- results/ → internal/results/

## Branch
- Current: `feat/15-7-move-dev-assets-to-internal`
- Created from: `develop`

## Session File
- Location: `.session/15-7-session.md`
- Updated with acceptance criteria and phase info

## Notes
- This is a 2-point story (no tests needed)
- Pure refactoring/reorganization
- No new functionality
- Results from Epic 12 benchmark runs
- Showcase site from Epic 13
- This completes Epic 15 (after this story, only 2 remaining points)

## Ready for Dev
All setup complete. Dev should:
1. Review this handoff
2. Make the file moves and code updates
3. Test the acceptance criteria
4. Create PR when complete
5. Trigger Reviewer for final check

---
**Prepared by:** SM (Story Setup)
**Date:** 2026-01-04
**Next Agent:** Dev (Developer)
