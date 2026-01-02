# Story 13-3: Theme Data Loader - Technical Context

## Story Overview
- **Epic:** 13 (Pennyfarthing Showcase Website)
- **Points:** 3
- **Priority:** P1
- **Repos:** pennyfarthing
- **Worktree:** /Users/keithavery/Projects/pennyfarthing-wt-13-1

## Current State

### What Exists
The core loader infrastructure is already in place:

1. **`showcase/src/lib/types.ts`** (101 lines)
   - `OceanScores` interface - Big Five model (O/C/E/A/N, 1-5 range)
   - `Agent` interface - 14 fields including role, character, OCEAN scores
   - `Theme` interface - Complete theme with id, metadata, agents array
   - `RawThemeYaml` interface - Mirrors YAML structure for parsing

2. **`showcase/src/lib/loader.ts`** (100 lines)
   - `loadThemes()` - Reads all YAML files from `pennyfarthing-dist/personas/themes/`
   - `transformTheme()` / `transformAgent()` - YAML to typed object conversion
   - `generateThemesJson()` - Returns JSON string but does NOT write to disk

3. **Theme YAML files** - 63 themes in `pennyfarthing-dist/personas/themes/`
   - Each defines 10 agent roles with OCEAN scores, character info, helpers
   - Already being consumed by Astro pages at build time

### What's Missing (AC3)
The `generateThemesJson()` function exists but nothing calls it to write `public/themes.json`:
- No build script to generate the static JSON file
- No Astro integration to generate at build time
- `public/` directory only contains `favicon.svg`

## Technical Approach

### Option A: Build Script (Recommended)
Create `showcase/scripts/generate-themes.ts`:
```typescript
import { writeFileSync } from 'fs';
import { generateThemesJson } from '../src/lib/loader';

async function main() {
  const json = await generateThemesJson();
  writeFileSync('public/themes.json', json);
  console.log(`Generated themes.json (${json.length} bytes)`);
}
main();
```

Add to `package.json`:
```json
"prebuild": "npx tsx scripts/generate-themes.ts"
```

### Option B: Astro Integration
Create an Astro integration that generates `themes.json` during build. More complex, but fully integrated.

### Recommendation
**Option A** - Simple, explicit, easy to test. The prebuild hook ensures JSON is ready before Astro builds.

## Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `showcase/scripts/generate-themes.ts` | CREATE | Script to generate themes.json |
| `showcase/package.json` | MODIFY | Add prebuild script |
| `showcase/src/lib/loader.ts` | VERIFY | Ensure all 64 themes load without error |

## Acceptance Criteria

- [ ] AC1: All 64 themes loaded at build time
- [ ] AC2: TypeScript types for Theme, Agent, OceanScores (DONE - exists)
- [ ] AC3: themes.json generated in public/ for client queries
- [ ] AC4: Build completes in < 30 seconds

## Testing Strategy

1. **Unit test:** Verify `loadThemes()` returns 64 themes with correct structure
2. **Build test:** Run `npm run build` and verify `public/themes.json` exists
3. **Timing test:** Measure build time < 30 seconds
4. **Integration test:** Verify client-side code can fetch and parse themes.json

## Dependencies & Risks

- **Dependency:** `tsx` or `ts-node` for running TypeScript scripts (or use Astro's built-in)
- **Risk:** Path resolution for `pennyfarthing-dist/` may differ in CI vs local
- **Mitigation:** Use `import.meta.url` or environment-aware path resolution

## Notes

This story is partially complete - the loader infrastructure was built during 13-1/13-5 work. The remaining work is wiring up the JSON generation to the build pipeline.
