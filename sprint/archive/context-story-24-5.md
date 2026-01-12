# Story 24-5: Theme Browser with Search - Technical Context

**Created:** 2026-01-12
**Author:** The Mad Hatter (SM)
**Points:** 5
**Epic:** 24 (Configuration & Theme Switcher Panels)

---

## Story Overview

| Field | Value |
|-------|-------|
| **Story ID** | 24-5 |
| **Title** | Theme Browser with Search |
| **Points** | 5 |
| **Priority** | P1 |
| **Repos** | cyclist |
| **Depends On** | None (independent of settings panel) |
| **Unlocks** | 24-6 (Theme Preview), 24-7 (Theme Favorites) |

**Description:** Replace the simple theme dropdown in settings with a rich theme browser panel. Users can search themes by name, filter by category (TV, Film, Literature, etc.), and see theme metadata before selecting.

---

## Current State

### Theme Dropdown (Story 24-2)

Currently themes are presented as a simple `<select>` dropdown:
- Located in `packages/cyclist/src/public/settings.html`
- Populated via `loadThemeOptions()` in `settings-ui.js`
- IPC channel `settings:getAvailableThemes` returns array of theme names
- 101 themes loaded from `pennyfarthing-dist/personas/themes/*.yaml`

**Limitations:**
- Hard to find themes in a 101-item dropdown
- No search/filter capability
- No preview of what the theme contains
- No categorization (TV shows, films, literature, etc.)

### Theme File Structure

Each theme YAML contains rich metadata:
```yaml
theme:
  name: Alice in Wonderland           # Display name
  description: Characters from...      # Short description
  source: Alice's Adventures...        # Source material
  tier: U                              # Quality tier (S/A/B/U)
  portrait_style: ", John Tenniel..."  # Image generation style
  user_title: my Dear                  # How agents address user
agents:
  sm:
    character: The Mad Hatter
    visual: "A wild-eyed hatter..."    # Portrait description
    ocean: {O: 5, C: 2, E: 5, A: 3, N: 3}
    style: Unconventional coordinator...
    # ... more agent details
```

---

## Technical Approach

### Architecture

The Theme Browser will be a **new UI component** that can be:
1. Embedded in the Settings panel (replacing dropdown)
2. Opened as a standalone panel/modal from main UI

```
┌─────────────────────────────────────────────────────────────┐
│                     Theme Browser                            │
├─────────────────────────────────────────────────────────────┤
│ [Search: _______________] [Filter: All ▼]                   │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│ │ Alice in    │ │ Star Trek   │ │ Discworld   │            │
│ │ Wonderland  │ │ TNG         │ │             │            │
│ │ ★★★★★      │ │ ★★★★☆      │ │ ★★★★★      │            │
│ │ Literature  │ │ TV Series   │ │ Literature  │            │
│ └─────────────┘ └─────────────┘ └─────────────┘            │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│ │ Breaking    │ │ The Office  │ │ ...         │            │
│ ...                                                         │
├─────────────────────────────────────────────────────────────┤
│ Selected: alice-in-wonderland              [Apply] [Cancel] │
└─────────────────────────────────────────────────────────────┘
```

### New Files to Create

| File | Purpose |
|------|---------|
| `packages/cyclist/src/public/js/components/ThemeBrowser.js` | Main browser component |
| `packages/cyclist/src/public/css/theme-browser.css` | Browser styling |

### Files to Modify

| File | Change |
|------|--------|
| `packages/cyclist/src/main.ts` | Add IPC handler for theme metadata |
| `packages/cyclist/src/preload.ts` | Expose theme metadata IPC |
| `packages/cyclist/src/public/settings.html` | Replace dropdown with browser container |
| `packages/cyclist/src/public/js/settings-ui.js` | Initialize browser, handle selection |

### IPC Changes

**New channel:** `settings:getThemeMetadata`
- Returns full metadata for all themes (not just names)
- Cached on main process to avoid repeated YAML parsing

```typescript
interface ThemeMetadata {
  id: string;           // kebab-case filename (e.g., "alice-in-wonderland")
  name: string;         // Display name (e.g., "Alice in Wonderland")
  description: string;  // Short description
  source: string;       // Source material
  tier: 'S' | 'A' | 'B' | 'U';  // Quality tier
  category: string;     // Derived from source (TV, Film, Literature, etc.)
  agentCount: number;   // Number of agents defined
}
```

### Category Derivation

Categories will be derived from theme source/name patterns:
- **TV Series:** Contains "TV", episode references, or known TV show patterns
- **Film:** Contains "film", movie references, or known film patterns
- **Literature:** Books, novels, classic works
- **Games:** Video games, tabletop
- **History:** Historical figures, periods
- **Mythology:** Greek, Norse, etc.
- **Music:** Composers, musicians
- **Other:** Everything else

Initial implementation can use a simple mapping table:
```javascript
const CATEGORY_MAP = {
  'star-trek-tos': 'TV Series',
  'star-trek-tng': 'TV Series',
  'breaking-bad': 'TV Series',
  'lord-of-the-rings': 'Literature',
  'alice-in-wonderland': 'Literature',
  // ... etc
};
```

---

## Acceptance Criteria

- [ ] Theme browser displays all 101 themes in a grid/list view
- [ ] Search box filters themes by name (fuzzy match)
- [ ] Category filter dropdown narrows results
- [ ] Each theme card shows: name, description, category, tier
- [ ] Clicking a theme selects it (visual highlight)
- [ ] Apply button saves selection and closes browser
- [ ] Browser integrates with existing settings panel
- [ ] Keyboard navigation works (arrow keys, Enter to select)

---

## Testing Strategy

### Unit Tests
- `ThemeBrowser.js`: Test filtering, search, selection state
- `getThemeMetadata` IPC: Test YAML parsing, caching, category derivation

### Integration Tests
- Browser opens from settings panel
- Selection persists after Apply
- Search + filter combination works

### Manual Testing
- Visual appearance of grid layout
- Responsive behavior at different sizes
- Performance with 101 themes loaded

---

## Dependencies & Risks

### Dependencies
- `yaml` package (already in use)
- Theme files in `pennyfarthing-dist/personas/themes/`

### Risks

| Risk | Mitigation |
|------|------------|
| YAML parsing slow for 101 files | Cache metadata on first load |
| Category derivation inaccurate | Start with manual mapping, iterate |
| Grid layout breaks at edge cases | Use CSS Grid with minmax() |

---

## Reference Materials

- **Story 24-2 Summary:** `sprint/context/story-24-2-summary.md` (dual-write pattern)
- **Settings UI:** `packages/cyclist/src/public/js/settings-ui.js`
- **Theme Example:** `pennyfarthing-dist/personas/themes/alice-in-wonderland.yaml`
- **Existing Modals:** `packages/cyclist/src/public/js/components/ApprovalModal.js` (pattern reference)

---

## Out of Scope (Future Stories)

- **24-6:** Theme Preview with Portraits (agent cards with generated images)
- **24-7:** Theme Favorites (star themes, persist favorites list)
- **24-8:** Quick Theme Switcher (Cmd+Shift+T hotkey)

---

*"Would you tell me, please, which theme I ought to choose from here?" — Alice*
