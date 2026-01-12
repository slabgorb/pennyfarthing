# Story 24-6: Theme Preview Panel - Technical Context

**Created:** 2026-01-12
**Author:** Camina Drummer (SM)
**Sprint:** 9

---

## Story Overview

| Field | Value |
|-------|-------|
| **Story ID** | 24-6 |
| **Title** | Theme Preview Panel |
| **Points** | 3 |
| **Priority** | P2 |
| **Epic** | 24 - Configuration & Theme Switcher Panels |
| **Repos** | cyclist |
| **Depends On** | 24-5 (Theme Browser with Search) ✓ |

**Description:** Add a preview panel to the theme browser that shows detailed information about the currently hovered/selected theme without leaving the browser. Users can see all agent character mappings, quotes, and personality traits before committing to a theme.

---

## Current State

### Theme Browser (24-5) - Already Built

The theme browser exists with:
- Grid-based UI showing all 101 themes
- Search with fuzzy matching (AND logic for multiple terms)
- Category filter dropdown
- Theme cards showing: name, description (truncated), category, tier
- Keyboard navigation (arrow keys, Enter to select)
- Selected state visual feedback

**What's Missing:** When you select a theme, you only see the card info. You can't see:
- Which characters map to which agents
- Character quotes and personality traits
- Full description (cards truncate)

### Key Files

| File | Purpose |
|------|---------|
| `packages/cyclist/src/public/js/components/ThemeBrowser.js` | Main component (508 lines) |
| `packages/cyclist/src/public/css/theme-browser.css` | Styling (300 lines) |
| `packages/cyclist/src/public/js/settings-ui.js` | Form integration (347 lines) |
| `packages/cyclist/src/settings.ts` | Backend persistence (432 lines) |

### Theme Data Structure

From persona YAML files (e.g., `the-expanse.yaml`):

```yaml
theme:
  name: "The Expanse"
  description: "Characters from The Expanse series..."
  tier: "F"
  category: "TV"

agents:
  sm:
    character: "Camina Drummer"
    visual: "Belter woman with short dark hair..."
    traits:
      openness: 3
      conscientiousness: 5
      extraversion: 3
      agreeableness: 2
      neuroticism: 2
    style: "Direct, decisive, leads from the front..."
    quote: "To the gates, and through."

  tea:
    character: "Amos Burton"
    # ... similar structure
```

---

## Technical Approach

### Option A: Side Panel (Recommended)

Add a fixed-width preview panel to the right of the theme grid:

```
┌──────────────────────────────────────────────────────────┐
│ [Search...] [Category ▼]                                 │
├─────────────────────────────────┬────────────────────────┤
│                                 │   THE EXPANSE          │
│  ┌─────┐ ┌─────┐ ┌─────┐      │   TV • Tier F          │
│  │Card │ │Card │ │Card │      │                        │
│  └─────┘ └─────┘ └─────┘      │   Full description...  │
│  ┌─────┐ ┌─────┐ ┌─────┐      │                        │
│  │Card │ │Card │ │*Sel*│◄─────│   AGENTS               │
│  └─────┘ └─────┘ └─────┘      │   SM: Camina Drummer   │
│                                 │   TEA: Amos Burton     │
│                                 │   Dev: Naomi Nagata    │
│                                 │   ...                  │
│                                 │                        │
│                                 │   "To the gates..."    │
├─────────────────────────────────┴────────────────────────┤
│ [Cancel]                                        [Apply]  │
└──────────────────────────────────────────────────────────┘
```

**Pros:**
- Preview always visible without covering grid
- Natural left-to-right flow (browse → preview)
- Doesn't require modal or overlay

**Cons:**
- Settings window may need to be wider
- Less grid space

### Option B: Expandable Card

When a card is selected, it expands in place to show details.

**Pros:** No width change needed
**Cons:** Disrupts grid layout, harder to implement

### Recommendation: Option A (Side Panel)

The settings window is already modal and can be sized appropriately. Side panel provides better UX.

---

## Files to Modify

| File | Changes |
|------|---------|
| `ThemeBrowser.js` | Add preview panel rendering, update state for selected theme details |
| `theme-browser.css` | Add preview panel styles, adjust grid layout for side panel |
| `settings-ui.js` | Pass full theme data (including agents) to browser |
| `settings.ts` | Ensure theme metadata includes agent mappings |
| `main.ts` | Update `getThemeMetadata` IPC to include agent data |

---

## Implementation Details

### 1. Expand Theme Metadata

Currently `getThemeMetadata` returns basic info. Need to include agents:

```typescript
// In main.ts or theme-loader
interface ThemeMetadata {
  id: string;
  name: string;
  description: string;
  category: string;
  tier: string;
  // NEW: Add agent mappings
  agents: {
    sm: { character: string; quote: string; traits?: OCEAN };
    tea: { character: string; quote: string; traits?: OCEAN };
    dev: { character: string; quote: string; traits?: OCEAN };
    reviewer: { character: string; quote: string; traits?: OCEAN };
    // ... other agents
  };
}
```

### 2. Preview Panel Component

In `ThemeBrowser.js`, add new render function:

```javascript
function renderPreviewPanel(container, theme) {
  if (!theme) {
    // Show placeholder when no theme selected
    return `<div class="theme-preview-empty">Select a theme to preview</div>`;
  }

  const agentList = Object.entries(theme.agents || {})
    .map(([role, agent]) => `
      <div class="preview-agent">
        <span class="preview-agent-role">${role.toUpperCase()}</span>
        <span class="preview-agent-character">${agent.character}</span>
      </div>
    `).join('');

  return `
    <div class="theme-preview-panel">
      <h3 class="preview-title">${theme.name}</h3>
      <div class="preview-meta">${theme.category} • Tier ${theme.tier}</div>
      <p class="preview-description">${theme.description}</p>
      <div class="preview-agents">
        <h4>Agent Characters</h4>
        ${agentList}
      </div>
      <blockquote class="preview-quote">"${theme.agents?.sm?.quote || ''}"</blockquote>
    </div>
  `;
}
```

### 3. CSS Layout Changes

```css
.theme-browser-content {
  display: flex;
  gap: 16px;
}

.theme-grid {
  flex: 1;
  /* existing grid styles */
}

.theme-preview-panel {
  width: 280px;
  flex-shrink: 0;
  border-left: 1px solid var(--border-color);
  padding: 16px;
  overflow-y: auto;
}
```

### 4. State Update

Track selected theme's full data (not just ID):

```javascript
// In themeBrowserState
let themeBrowserState = {
  themes: [],
  filteredThemes: [],
  searchQuery: '',
  selectedCategory: 'All',
  selectedThemeId: null,
  selectedThemeData: null,  // NEW: Full theme object for preview
  isLoading: true,
};
```

---

## Acceptance Criteria

- [ ] Hovering/selecting a theme shows detailed preview panel
- [ ] Preview lists all agent character mappings (SM, TEA, Dev, Reviewer, etc.)
- [ ] Character quotes visible in preview
- [ ] Theme category and tier prominently displayed
- [ ] Preview updates instantly on selection change

---

## Testing Strategy

### Unit Tests
- `ThemeBrowser.js`: Test preview panel render with various theme data
- Test empty state when no theme selected
- Test agent list rendering with partial agent data

### Integration Tests
- Verify IPC returns full theme metadata including agents
- Verify preview updates on theme selection
- Verify keyboard navigation still works with panel present

### Manual Testing
- Select different themes, verify preview updates
- Check dark mode styling
- Verify scrolling works in preview panel for themes with many agents
- Test with themes that have missing agent data (graceful fallback)

---

## Out of Scope

- "Try it" button for temporary theme application (future story)
- OCEAN personality bar visualization (24-8)
- Theme favorites (24-7)
- Hover preview (selection-only for MVP)

---

## Dependencies & Risks

### Dependencies
- 24-5 Theme Browser ✓ (done)
- Theme YAML files must have agent mappings (they do)

### Risks
| Risk | Mitigation |
|------|------------|
| Settings window too narrow | Make window resizable or set minimum width |
| Missing agent data in some themes | Graceful fallback - show "No data" |
| Performance with 101 themes | Already handled by existing browser |

---

## Reference

- **ThemeBrowser.js:** L196-235 (card creation), L291-425 (main render)
- **theme-browser.css:** L79-83 (grid layout), L89-119 (card styles)
- **Persona example:** `pennyfarthing-dist/personas/themes/the-expanse.yaml`
