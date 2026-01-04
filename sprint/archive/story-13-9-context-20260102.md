# Story 13-9: Build Comparison View with Overlay Spiders - Technical Context

## Story Overview
- **Epic:** 13 - Pennyfarthing Showcase Website
- **Points:** 3 | **Priority:** P1
- **Repos:** pennyfarthing (showcase/)
- **Branch:** feat/13-9-comparison-view
- **Jira:** MSSCI-11303

## Current State

### What Exists
- **compare.astro** (79 lines): Page loads all 640 characters at build time, renders QueryBuilder island, has placeholder results container
- **QueryBuilder.tsx** (401 lines): Full filtering UI with OCEAN ranges, role checkboxes, theme multi-select, expression parser. Emits `onResults` callback with filtered Character[]
- **SpiderChart.astro** (184 lines): Static build-time spider for team averages. Has geometry helpers but no overlay support
- **types.ts**: OceanScores, Agent, Character interfaces defined
- **loader.ts**: Build-time pipeline generating themes.json with all persona data

### What's Missing (Story 13-9 Deliverables)
1. `CompareGrid.tsx` - React island to display filtered results as selectable cards
2. Multi-select mechanism for choosing 2-4 characters to compare
3. Overlay spider chart generator (client-side, dynamic)
4. Export functionality (markdown/image)

## Technical Approach

### Architecture
```
QueryBuilder.tsx ─onResults─→ CompareGrid.tsx
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
              CharacterCard   SelectionPanel  OverlaySpider
              (grid item)     (2-4 selected)  (SVG overlay)
```

### Key Design Decisions

1. **Client-side spider generation**: Must be dynamic (user selects characters at runtime), so use React + inline SVG rather than Astro build-time component

2. **Multi-select pattern**: Track `selectedIds: Set<string>` in CompareGrid state. Enforce 2-4 limit with UI feedback

3. **Color differentiation**: Use fixed color palette for overlay (4 distinct colors). Legend shows character name + color

4. **Export options**:
   - Markdown: Generate comparison table with OCEAN scores
   - Image: Use SVG-to-canvas conversion or direct SVG download

### Data Flow
```typescript
// Input from QueryBuilder
interface Character {
  theme: string;
  role: string;
  name: string;
  ocean: { O: number; C: number; E: number; A: number; N: number };
}

// CompareGrid props
interface CompareGridProps {
  characters: Character[];
  onCompare?: (selected: Character[]) => void;
}
```

### Spider Overlay Algorithm
Port geometry from SpiderChart.astro to client-side:
1. `oceanToPolygonPoints(ocean, size)` - map 1-5 scores to pentagon vertices
2. Render multiple polygons with different fill colors + transparency
3. Add legend mapping color → character name

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `showcase/src/components/CompareGrid.tsx` | CREATE | Main results grid with selection |
| `showcase/src/components/OverlaySpider.tsx` | CREATE | Client-side multi-character spider |
| `showcase/src/components/CharacterCard.tsx` | CREATE | Individual card with select toggle |
| `showcase/src/pages/compare.astro` | MODIFY | Wire QueryBuilder → CompareGrid |
| `showcase/src/lib/spider-utils.ts` | CREATE | Shared geometry functions |

## Acceptance Criteria

- [ ] AC1: CompareGrid displays filtered characters as clickable cards in responsive grid
- [ ] AC2: Users can select 2-4 characters; UI prevents selecting more than 4
- [ ] AC3: Overlay spider chart renders selected characters with distinct colors
- [ ] AC4: Legend identifies which color belongs to which character
- [ ] AC5: Export comparison as markdown table or downloadable SVG image

## Testing Strategy

### Unit Tests
- `spider-utils.ts`: Test geometry calculations (polygon points, grid lines)
- `CompareGrid.tsx`: Test selection state management (add/remove, 4-limit enforcement)
- Export functions: Test markdown generation, SVG output

### Integration Tests
- QueryBuilder → CompareGrid data flow
- Full selection → overlay → export workflow

### Manual Verification
- Visual review of spider overlays with 2, 3, and 4 characters
- Mobile responsiveness of grid layout
- Export file quality

## Dependencies & Risks

### Dependencies (All Complete)
- Story 13-7: QueryBuilder UI ✓
- Story 13-8: OCEAN expression parser ✓
- Story 11-10: Spider chart patterns (reference) ✓

### Risks
| Risk | Mitigation |
|------|------------|
| SVG export browser compatibility | Use established svg-to-canvas library or direct SVG download |
| Overlay readability with 4 characters | Use transparency + distinct hues; test with high-contrast themes |
| Mobile touch selection UX | Large touch targets, clear selected state |

## Reference Files
- Spider geometry: `showcase/src/components/SpiderChart.astro:48-87`
- QueryBuilder output: `showcase/src/components/QueryBuilder.tsx:179-219`
- Character interface: `showcase/src/components/QueryBuilder.tsx:36-58`
- Page structure: `showcase/src/pages/compare.astro:40-60`
