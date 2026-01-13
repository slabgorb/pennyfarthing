# Story 24-7: Theme Favorites - Technical Context

**Created:** 2026-01-13
**Author:** Camina Drummer (SM)
**Sprint:** 9

---

## Story Overview

| Field | Value |
|-------|-------|
| **Story ID** | 24-7 |
| **Title** | Theme Favorites |
| **Points** | 2 |
| **Priority** | P2 |
| **Epic** | 24 - Configuration & Theme Switcher Panels |
| **Repos** | cyclist |
| **Routing** | SM → Dev (trivial, skip TEA) |

**Description:** Allow users to mark themes as favorites for quick access. Favorites appear at the top of the theme browser and persist across sessions.

---

## Current State

### ThemeBrowser.js (628 lines)
- Grid-based theme browser with search and category filtering
- `renderPreviewPanel()` shows selected theme details (L532-627)
- Card rendering in `createThemeCard()` (L199-238) - tier badge, name, description
- State management: `{ themes, filteredThemes, searchQuery, selectedCategory, selectedTheme }`
- No favorites functionality exists yet

### settings.ts (432 lines)
- YAML-based persistence: `~/.cyclist/settings.yaml` + project overrides
- Current schema has no `favorites` field
- Deep merge logic in `mergeSettings()` handles nested objects
- Validation in `validateSettings()` checks all nested structures

### settings-ui.js (347 lines)
- Bridges ThemeBrowser to Electron IPC
- `initThemeBrowser()` manages component lifecycle
- Form submission saves via `window.electronAPI.settings.save()`

---

## Technical Approach

### 1. Settings Schema Extension

Add `favorites` array to pennyfarthing settings:

```typescript
// settings.ts
interface PennyfarthingSettings {
  theme: string;
  favorites: string[];  // Array of theme IDs
}
```

Default: `favorites: []`

### 2. ThemeBrowser State Extension

Add favorites to browser state:

```javascript
// ThemeBrowser.js state
{
  themes: [],
  filteredThemes: [],
  favorites: [],        // NEW: Theme IDs
  searchQuery: '',
  selectedCategory: 'All',
  selectedTheme: null
}
```

### 3. UI Changes

**Theme Card (createThemeCard):**
- Add heart/star icon in top-right corner
- Toggle fills on click
- Stop propagation so card selection still works

**Theme Grid (renderThemeGrid):**
- If favorites exist, render "Favorites" section at top
- Collapsible header with count badge
- Then render remaining themes below

**Favorites Section:**
```
┌─────────────────────────────────────────┐
│ ★ Favorites (3)                    [▼]  │
├─────────────────────────────────────────┤
│ [Card] [Card] [Card]                    │
├─────────────────────────────────────────┤
│ All Themes                              │
├─────────────────────────────────────────┤
│ [Card] [Card] [Card] ...                │
└─────────────────────────────────────────┘
```

### 4. Persistence Flow

1. User clicks favorite icon on card
2. ThemeBrowser updates local state
3. Calls `onFavoriteToggle(themeId, isFavorite)` callback
4. settings-ui.js receives callback, updates settings via IPC
5. settings.ts saves to `~/.cyclist/settings.yaml`

### 5. Load Flow

1. `initThemeBrowser()` loads settings including favorites
2. Passes favorites array to ThemeBrowser config
3. ThemeBrowser initializes state with favorites
4. Grid renders favorites section if any exist

---

## Files to Modify

| File | Changes |
|------|---------|
| `packages/cyclist/src/settings.ts` | Add `favorites: string[]` to schema, defaults, validation, merge |
| `packages/cyclist/src/public/js/components/ThemeBrowser.js` | Favorite icon on cards, favorites section, toggle logic |
| `packages/cyclist/src/public/js/settings-ui.js` | Pass favorites to browser, handle toggle callback, save via IPC |

---

## Acceptance Criteria

- [ ] Each theme card has a favorite toggle icon (heart or star)
- [ ] Clicking icon adds/removes from favorites
- [ ] Favorites section appears at top of browser when favorites exist
- [ ] Favorites persist across app restarts
- [ ] Favorites stored in settings YAML under `pennyfarthing.favorites`

---

## Testing Strategy

### Manual Testing
1. Open theme browser, click favorite icon on 2-3 themes
2. Verify favorites section appears at top
3. Close and reopen settings - favorites should persist
4. Check `~/.cyclist/settings.yaml` has favorites array
5. Remove favorites, verify section disappears
6. Verify favorite icon state matches actual favorites

### Edge Cases
- Empty favorites (no section shown)
- All themes favorited (all in top section)
- Favorite a theme then search - should still appear in results if matches
- Category filter + favorites interaction

---

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| Settings migration (existing users) | Default to empty array, graceful handling |
| Click target overlap (icon vs card) | stopPropagation on icon click |
| Performance with many favorites | Unlikely issue with ~100 themes |

---

## Reference

- **Epic Context:** `.session/context-epic-24.md`
- **ThemeBrowser:** `packages/cyclist/src/public/js/components/ThemeBrowser.js`
- **Settings:** `packages/cyclist/src/settings.ts`
- **Predecessor:** Story 24-6 (Theme Preview Panel) - merged PR #198
