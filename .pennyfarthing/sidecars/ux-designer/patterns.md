# UX Designer Agent Patterns

> Pennyfarthing-specific design patterns

## Design Specification Format

### Component Spec for Pennyfarthing
```markdown
## [Component Name]

### Purpose
[What problem does this solve?]

### Variants
- Default, Active, Disabled, Error

### States
- Idle, Hover, Focus, Loading

### Accessibility
- Keyboard: [interactions]
- Screen reader: [announcements]
```

---

## Collapsible Panel with Rotated Label

**Problem:** When panels collapse, users need a clear, space-efficient way to expand them. The expand button should be in the same location as the collapse button to minimize mouse travel.

**Solution:** Vertical rotated text label on a slim expand button.

### Design Specs
- **Button:** 20px wide × 60px tall (fits 5-6 char label)
- **Position:** Same vertical position as collapse button (top: 8px)
- **Text:** 10px, 600 weight, 1px letter-spacing
- **Rotation:** Reads top-to-bottom (not bottom-to-top)

### CSS Pattern
```css
.panel-expand-btn .expand-label {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  transform: rotate(180deg);
}
```

### States
- **Idle:** Muted background, secondary text color
- **Hover:** Accent background, primary text color
- **Hidden:** `opacity: 0; pointer-events: none;` when panel expanded

### Example Usage
File panel in Cyclist: "FILES" label appears when panel collapses.

---

*Add design patterns discovered during UX work below*

---

## Cyclist Layout Architecture

**Key files:**
- `packages/cyclist/src/public/index.html` - Main HTML structure
- `packages/cyclist/src/public/styles.css` - All styling (2400+ lines)

### Main Layout Structure
```
#app-container (flex row)
├── #file-panel.file-panel (.collapsed when hidden)
├── .resize-handle#file-panel-resize
├── #diff-panel.diff-panel (.collapsed when hidden)
├── .resize-handle#diff-panel-resize
├── .file-panel-expand-btn (position: absolute, left: 0, top: 50px)
├── .diff-panel-expand-btn (position: absolute, left: 0, top: 118px)
├── #main-content (flex: 1, flex-direction: column)
│   ├── #message-view (flex: 1, padding: 1rem)
│   ├── #tool-activity-bar
│   ├── #quick-actions
│   ├── #image-preview
│   └── #editor-wrapper
└── #sidebar (right panel with persona, story info)
```

### Key CSS Locations
| Element | Line | Notes |
|---------|------|-------|
| `.file-panel` | ~45 | Left file tree panel |
| `.file-panel.collapsed` | ~58 | width: 0, opacity: 0 |
| `.file-panel-expand-btn` | ~131 | Absolute positioned expand button |
| `#main-content` | ~235 | flex: 1, min-width: var(--sidebar-width) |
| `#message-view` | ~1010 | flex: 1, padding: 1rem, overflow-y: auto |
| `.message-assistant p` | ~1081 | max-width: 72ch (reading width constraint) |
| `.diff-panel` | ~2235 | Left diff panel (below file panel) |
| `.diff-panel-expand-btn` | ~2319 | Absolute positioned expand button |

### Panel Collapse Behavior
- Expand buttons use `position: absolute; left: 0`
- When panels collapse, buttons become visible via `opacity: 1`
- Badge counts on expand buttons: `.panel-count-badge`

### Message Width Constraint
- `.message-assistant p { max-width: 72ch }` limits paragraph width
- Good for readability but wastes space when panels collapsed
- Solution: Use `max-width: min(72ch, 100%)` for responsive behavior

---

## VS Code TreeView Sidebar Design

**Story:** MSSCI-12048 (VS Code Extension Sidebar)

### Information Hierarchy for Agent Status

```
Activity Bar Icon
└── Tree View
    ├── Agent Section (expanded by default)
    │   └── Character, role, context %
    ├── Sprint Section (collapsed by default)
    │   └── Points, in-progress count
    ├── Story Section (expanded by default)
    │   └── ID, phase, branch, points
    └── Quick Actions (leaf nodes with commands)
```

### VS Code TreeItem Best Practices

1. **Use `description` for secondary info** - appears grayed after label
2. **Use `tooltip` for full context** - shows on hover
3. **Use `contextValue` for menu targeting** - enables context menus
4. **Use `command` for click actions** - single-click behavior

### Data Sources for Sidebar

| Data | Source | Update Mechanism |
|------|--------|------------------|
| Agent/Persona | OTEL spans | WebSocket `/ws/stats` |
| Context % | Claude API polling | WebSocket `/ws/stats` |
| Sprint | `sprint/current-sprint.yaml` | File watcher |
| Story | `.session/{story-id}-session.md` | File watcher |

### Reusable Logic from Cyclist

- `persona.js:humanize()` - Converts slug to title case
- `stats-strip.js:updateContextLevel()` - Context % thresholds
- `stats-strip.js:formatTokenCount()` - Token display formatting

### VS Code Codicon Reference

Common icons for tree items:
- `$(account)` - Agent/persona
- `$(tasklist)` - Sprint
- `$(book)` - Story
- `$(play)` - Start work
- `$(sync)` - Switch/refresh
- `$(list-unordered)` - Backlog
