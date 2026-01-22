# Story 11-4: Generate Anchor Theme Faces + Markdown Report

**Epic:** 11 - OCEAN Personality Visualization with Chernoff Faces
**Points:** 2 | **Priority:** P1
**Status:** In Progress
**Dependencies:** 11-1 (spec), 11-2 (OCEAN data), 11-3 (generator) - all complete

## Objective

Generate SVG Chernoff faces for all 100 anchor theme characters (10 themes x 10 agents) and create markdown reports for easy viewing.

## Acceptance Criteria

- [ ] 100 SVG faces generated in `pennyfarthing-dist/personas/faces/`
- [ ] Markdown index with all faces viewable
- [ ] Team photo view (10 agents per theme)
- [ ] Role comparison view (1 role across 10 themes)

## Technical Context

### Available Generator

Story 11-3 delivered `src/scripts/generate-face.ts` with these exports:

```typescript
// Load OCEAN from theme YAML
loadThemeOcean(theme: string, agent: string): OceanScores

// Map OCEAN to face parameters
oceanToParams(ocean: OceanScores): FaceParams

// Generate SVG from parameters
generateSvgFromParams(params: FaceParams): string

// Main entry - combines above
generateFace(theme: string, agent: string): string
```

### Anchor Themes (10)

1. deadwood
2. firefly
3. breaking-bad
4. the-good-place
5. star-trek-tng
6. discworld
7. fargo
8. succession
9. mass-effect
10. software-pioneers

### Agents (10 per theme)

1. orchestrator
2. sm
3. tea
4. dev
5. reviewer
6. architect
7. pm
8. tech-writer
9. ux-designer
10. devops

### Output Structure

```
pennyfarthing-dist/personas/faces/
├── by-theme/
│   ├── deadwood/
│   │   ├── orchestrator.svg
│   │   ├── sm.svg
│   │   └── ... (10 SVGs)
│   └── ... (10 theme directories)
├── by-role/
│   ├── sm/
│   │   ├── deadwood.svg
│   │   ├── firefly.svg
│   │   └── ... (10 SVGs)
│   └── ... (10 role directories)
├── team-photos.md      # All themes with their 10 agents
└── role-gallery.md     # Each role across all 10 themes
```

### Markdown Report Format

**Team Photos (by theme):**
```markdown
## Deadwood Team

| orchestrator | sm | tea | dev | reviewer |
|:---:|:---:|:---:|:---:|:---:|
| ![](by-theme/deadwood/orchestrator.svg) | ![](by-theme/deadwood/sm.svg) | ... |

| architect | pm | tech-writer | ux-designer | devops |
|:---:|:---:|:---:|:---:|:---:|
| ![](by-theme/deadwood/architect.svg) | ... |
```

**Role Gallery (by role):**
```markdown
## Scrum Masters Across Themes

| deadwood | firefly | breaking-bad | ... |
|:---:|:---:|:---:|:---:|
| ![](by-role/sm/deadwood.svg) | ![](by-role/sm/firefly.svg) | ... |
```

## Implementation Approach

### Batch Script

Create a Node.js batch script that:
1. Iterates themes and agents
2. Calls `generateFace(theme, agent)` for each
3. Writes SVG files to appropriate directories
4. Generates markdown index files

```typescript
// scripts/generate-all-faces.ts
import { generateFace } from './generate-face.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const themes = ['deadwood', 'firefly', ...];
const agents = ['orchestrator', 'sm', 'tea', ...];

for (const theme of themes) {
  for (const agent of agents) {
    const svg = generateFace(theme, agent);
    // Write to by-theme and by-role directories
  }
}
// Generate markdown indices
```

## Key Files

| File | Purpose |
|------|---------|
| `src/scripts/generate-face.ts` | Existing face generator |
| `src/scripts/generate-all-faces.ts` | NEW - Batch generation script |
| `pennyfarthing-dist/personas/faces/` | NEW - Output directory |
| `pennyfarthing-dist/personas/faces/team-photos.md` | NEW - Team view index |
| `pennyfarthing-dist/personas/faces/role-gallery.md` | NEW - Role view index |

## Testing Strategy

1. **Verify file generation** - All 100 SVGs created in correct locations
2. **Validate SVG structure** - Each file contains valid SVG content
3. **Check markdown rendering** - Images load correctly in preview
4. **Cross-reference** - by-theme and by-role contain same faces

## Risks

| Risk | Mitigation |
|------|------------|
| Missing OCEAN data | All 10 anchor themes verified in 11-2 |
| Generator failures | 11-3 tests cover all edge cases |
| Large PR | Keep script minimal, output is generated content |

## Notes

- At 2 points, this story goes directly to Dev (skips TEA)
- The work is primarily scripting - the generator already exists
- Focus on file organization and clean markdown output
