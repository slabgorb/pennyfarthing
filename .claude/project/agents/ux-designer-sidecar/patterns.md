# UX Designer Agent Patterns

> Pennyfarthing-specific design patterns

## Design Specification Format

### Component Spec for Conductor
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
