# ADR-0021: shadcn/ui Component Adoption for BikeRack GUI

## Status

Accepted

## Context

BikeRack GUI's React UI contained 41 hand-built components implementing common patterns: modals, command palettes, toggles, dropdowns, tooltips, progress bars, and more. Each reimplemented behavior that battle-tested libraries handle better -- focus trapping, keyboard navigation, ARIA semantics, click-outside dismissal, scroll management, and portal rendering.

### Problems with Hand-Rolled Components

| Component | Custom Code | What It Reimplemented |
|-----------|-------------|----------------------|
| CommandPalette | 658 lines | Fuzzy search, keyboard nav, category groups, scroll-into-view |
| ApprovalModal | 570 lines | Focus trap, overlay, escape handling, portal |
| ThemePalette | 393 lines | Dropdown positioning, click-outside, keyboard nav |
| ModeSwitch | 390 lines | Roving tabindex, ARIA radiogroup, sliding highlight |
| ContextIndicator | 300 lines | Progress bar, title-attribute tooltips |
| ConfirmDialog | 229 lines | Focus trap, escape, backdrop click, Promise-based flow |
| FontPicker | ~200 lines | Dropdown, search filtering, keyboard nav, focus mgmt |

**Total:** ~2,700+ lines of UI infrastructure code duplicating what Radix UI provides for free.

**Specific pain points:**
1. **Accessibility gaps** - Hand-rolled ARIA was incomplete (missing live regions, wrong roles)
2. **Inconsistent keyboard nav** - Each component reimplemented arrow keys, escape, enter differently
3. **No focus trapping** - Modals could leak focus to background elements
4. **Browser-default tooltips** - `title` attributes render as ugly, inconsistent OS tooltips
5. **Inconsistent styling** - Each component had its own button/badge/toggle patterns
6. **Cross-project divergence** - conductor-ui already uses shadcn; BikeRack GUI had its own patterns

### Why shadcn/ui

shadcn is not a component library -- it's a collection of copy-paste components built on Radix UI primitives and Tailwind CSS. Components are owned by the project, not imported from `node_modules`.

**Key properties:**
- **Headless behavior from Radix** - Focus traps, keyboard nav, ARIA, portals, scroll lock
- **Styled via Tailwind** - Integrates with BikeRack GUI's existing Tailwind v4 setup
- **Copy-paste ownership** - Components live in `src/public/components/ui/`, fully customizable
- **CSS variable theming** - Maps cleanly to BikeRack GUI's runtime theme system (30+ presets)
- **Consistent API** - All components follow the same composition patterns
- **Conductor alignment** - conductor-ui uses the same shadcn new-york style

## Decision

Adopt shadcn/ui (new-york style) across BikeRack GUI's entire React UI in three tiers:

1. **Tier 1 (High Impact):** Replace 6 complex custom components with shadcn equivalents
2. **Tier 2 (Consistency):** Adopt Button, Badge, Tooltip, Switch, Select, Collapsible, ScrollArea across all components
3. **Tier 3 (Polish):** Add Separator, Skeleton loading states

### What We Did NOT Replace

| Component | Reason |
|-----------|--------|
| DockviewWorkspace | dockview-react is purpose-built for panel management (ADR-0019) |
| MessageView / MessageList | Complex scroll management, streaming UI -- too domain-specific |
| ToolCallBlock / ToolStack | Domain-specific tool visualization |
| Editor | Custom textarea with command history, tab completion |
| DiffViewer | Specialized diff rendering |
| StreamingContent | Custom markdown streaming |
| StatsStrip layout | Custom layout (children use Badge/Tooltip) |
| AgentPopup modal | Full-screen dialog pattern, not a popover |

## Implementation

### Setup: CSS Variable Bridge

The critical enabler is a CSS variable bridge in `tailwind.config.js` that maps BikeRack GUI's runtime theme variables to shadcn's expected tokens:

```javascript
// tailwind.config.js
colors: {
  // shadcn tokens → BikeRack GUI CSS variables
  background: 'var(--bg-primary)',
  foreground: 'var(--text-primary)',
  primary: { DEFAULT: 'var(--bg-primary)', foreground: 'var(--text-primary)' },
  card: { DEFAULT: 'var(--bg-secondary)', foreground: 'var(--text-primary)' },
  popover: { DEFAULT: 'var(--bg-secondary)', foreground: 'var(--text-primary)' },
  muted: { DEFAULT: 'var(--bg-tertiary)', foreground: 'var(--text-muted)' },
  destructive: { DEFAULT: 'var(--status-error)', foreground: '#fafafa' },
  input: 'var(--border)',
  ring: 'var(--accent)',
}
```

This means all 30+ BikeRack GUI theme presets automatically work with shadcn components -- no per-theme overrides needed.

### Infrastructure Created

| File | Purpose |
|------|---------|
| `components.json` | shadcn config (new-york, no RSC, `@/` alias) |
| `src/public/lib/utils.ts` | `cn()` utility (clsx + tailwind-merge) |
| `src/public/components/ui/*.tsx` | 17 shadcn component files |
| `vite.config.ts` (modified) | `@/` → `src/public/` resolve alias |
| `vitest.config.ts` (modified) | `@/` alias for tests |
| `tailwind.config.js` (modified) | CSS variable bridge |

### Tier 1 Replacements

| Component | Replaced With | Lines Removed | Key Benefit |
|-----------|--------------|---------------|-------------|
| CommandPalette | Command + Dialog | ~100 | cmdk fuzzy search, keyboard nav |
| ConfirmDialog | AlertDialog | ~60 | Focus trap, escape, backdrop |
| ApprovalModal | Dialog + Checkbox + Button | ~100 | Focus trap, overlay, scroll lock |
| ThemePalette | Popover + Command | ~200 | Search capability added, positioning |
| ModeSwitch | ToggleGroup + Tooltip | ~100 | ARIA radiogroup, roving tabindex |
| ContextIndicator | Progress + Tooltip | ~50 | Accessible progress bar, styled tooltips |

### Tier 2 Adoption

| shadcn Component | Scope | Files Modified |
|------------------|-------|----------------|
| Button | Every raw `<button>` in 19 component files | 19 |
| Badge | Status indicators in AgentPopup, BikeLanePanel, WorkflowPanel, DebugPanel | 5 |
| Tooltip | All `title` attributes across StatsStrip, PersonaHeader, GitPanel, etc. | 10+ |
| Switch | SettingsPanel checkbox toggles (6 switches) | 1 |
| Select | FontPicker custom dropdown | 1 |
| Collapsible | FileTree directory expand/collapse | 1 |
| ScrollArea | AuditLogPanel scrollable entries | 1 |

### Tier 3 Polish

| shadcn Component | Scope |
|------------------|-------|
| Separator | Section dividers in 5 panel components |
| Skeleton | Loading states in 11 components (replaced spinner text) |

### Dependencies Added

```
@radix-ui/react-alert-dialog, react-checkbox, react-collapsible,
react-dialog, react-popover, react-progress, react-scroll-area,
react-select, react-separator, react-slot, react-switch, react-tabs,
react-toggle, react-toggle-group, react-tooltip
cmdk@1.1.1, class-variance-authority@0.7.1, clsx@2.1.1,
tailwind-merge@3.4.0, lucide-react@0.563.0
```

## Test Impact

12 test files required updates to match new DOM structure:

| Pattern Change | Test Fix |
|----------------|----------|
| `title` attr → Tooltip | Check `data-state` on TooltipTrigger instead of `getAttribute('title')` |
| `aria-pressed` → `aria-checked` | ToggleGroup uses `role="radio"` + `aria-checked` |
| CSS class assertions | Source-level checks for shadcn imports instead of CSS rule checks |
| Button name queries | Updated selectors for shadcn Button structure |
| Collapsed content gone | Radix Collapsible removes DOM nodes (vs hiding) |
| Select interaction | Use `role="combobox"` trigger + `role="option"` items |

**Final test results:** 1610 passing, 118 skipped, 2 pre-existing failures (unrelated).

## Consequences

### Positive

- **~600+ lines of custom UI infrastructure removed** across Tier 1 components
- **Consistent accessibility** - Radix provides correct ARIA roles, keyboard nav, focus trapping across all components
- **Theme-compatible** - All 30+ BikeRack GUI theme presets work via CSS variable bridge
- **Cross-project alignment** - Same shadcn patterns as conductor-ui
- **Better UX** - Styled tooltips replace browser `title` attrs, skeleton loading replaces "Loading..." text, proper focus management in modals
- **New capabilities** - ThemePalette gained search, CommandPalette got better fuzzy matching via cmdk
- **Reduced maintenance** - Radix community maintains accessibility compliance

### Negative

- **19 new Radix dependencies** - Bundle increased ~1KB gzipped (1019→1020 KB)
- **Test maintenance** - 12 test files updated; future component tests must account for Radix DOM patterns
- **CSS `!important` overrides** - ModeSwitch needed `!important` to override shadcn's Tailwind utility classes for the custom sliding highlight animation
- **Learning curve** - Contributors need familiarity with Radix patterns (portals, `asChild`, `data-state`)

### Gotchas for Future Development

1. **Radix Tooltip renders in a portal** - Can't test tooltip content via `title` attr; use `data-state` on trigger
2. **Radix Collapsible removes DOM** - Collapsed content is unmounted, not hidden
3. **ToggleGroup uses radio semantics** - `role="radio"` + `aria-checked`, not `aria-pressed`
4. **Progress needs `indicatorClassName`** - Custom prop added to shadcn Progress for fill color customization
5. **`@/` alias** - Must be configured in both `vite.config.ts` AND `vitest.config.ts`
6. **MessageList scroll** - Do NOT wrap with ScrollArea; complex programmatic scroll management
7. **Fetching components** - `https://ui.shadcn.com/r/styles/new-york/{component}.json`

## References

- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Radix UI Primitives](https://www.radix-ui.com/primitives)
- [cmdk (Command Menu)](https://cmdk.paco.me)
- ADR-0019: Dockview Migration (prior panel infrastructure decision)
- `packages/cyclist/components.json` - shadcn configuration
- `packages/cyclist/tailwind.config.js` - CSS variable bridge
- `packages/cyclist/src/public/components/ui/` - 17 shadcn component files
