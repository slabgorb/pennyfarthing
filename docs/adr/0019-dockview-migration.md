# ADR-0019: Migration to Dockview for Panel Management

## Status
Accepted

## Context

BikeRack GUI's panel system was originally intended to use [Dockview](https://dockview.dev/), a mature React docking library. The dependency `dockview-react@4.13.1` has been installed since early development. However, during implementation, a custom hand-rolled panel system was built instead.

### Current State (Hand-Rolled System)

**Location:** `packages/cyclist/src/public/components/DockingWorkspace.tsx` (1,042 lines)

**What We Built:**
- Three-region layout (left sidebar, center sacred, right sidebar)
- 9 panels across 3 regions
- Custom drag-and-drop using native HTML5 API
- Tab reordering within sidebars
- Panel movement between sidebars
- Custom resize handles
- Responsive breakpoints with auto-collapse
- Layout persistence via REST API
- Component registry pattern

**Pain Points with Hand-Rolled:**
1. **No floating panels** - Users cannot pop out panels to separate windows
2. **No split views** - Cannot split a region to show multiple panels simultaneously
3. **No panel maximization** - Cannot maximize a single panel to fill workspace
4. **Limited layout flexibility** - Locked to left/center/right regions only
5. **Edge cases in drag-drop** - Subtle bugs in reordering logic
6. **Maintenance burden** - 1,042 lines of custom docking code to maintain
7. **No serialization format** - Custom persistence, not Dockview's proven format
8. **Active bugs** - Current panel system has known issues

### What Dockview Provides (Already Paid For)

Since we already have the dependency, we're carrying the bundle size cost without the benefits:

| Feature | Hand-Rolled | Dockview |
|---------|------------|----------|
| Tabbed panels | ✅ | ✅ |
| Drag between groups | ✅ (buggy) | ✅ |
| Resize handles | ✅ | ✅ |
| Floating panels | ❌ | ✅ |
| Split views (horizontal/vertical) | ❌ | ✅ |
| Panel maximization | ❌ | ✅ |
| Layout serialization | Custom | ✅ Built-in |
| Waterfall layouts | ❌ | ✅ |
| Lock/unlock panels | Partial | ✅ |
| Accessibility | Partial | ✅ Full ARIA |
| Documentation | None | ✅ Extensive |

## Decision

Replace hand-rolled panel management with Dockview in a single story. No phased approach - the current implementation has bugs and the migration is straightforward since all panel components remain unchanged.

## Implementation Plan

### Single Story: Replace DockingWorkspace with Dockview

**Scope:**
1. Replace `DockingWorkspace.tsx` with Dockview-based implementation
2. Adapt existing panel components (no changes to panels themselves)
3. Migrate layout persistence to Dockview serialization
4. Update App.tsx to use new workspace
5. Delete old implementation
6. Update/fix tests

### Files to Delete
```
components/DockingWorkspace.tsx  (~1,042 lines)
```

### Files to Create
```
components/DockviewWorkspace.tsx      # New Dockview-based workspace
styles/dockview-theme.css             # Theme customization
```

### Files to Modify
```
App.tsx                               # Switch to DockviewWorkspace
hooks/useLayoutPersistence.ts         # Adapt for Dockview format
```

### Files Unchanged
```
components/panels/*.tsx               # All 9 panel components preserved
components/ErrorBoundary.tsx          # Reused
hooks/useResponsiveLayout.ts          # Reused for breakpoint detection
```

## Technical Approach

### Panel Adapter Pattern

Existing panels work unchanged - just wrap them for Dockview:

```typescript
import { IDockviewPanelProps } from 'dockview-react';

// Registry of existing panel components
const panelComponents: Record<string, ComponentType> = {
  message: MessagePanel,
  sprint: SprintPanel,
  progress: ProgressPanel,
  // ... etc
};

// Single adapter renders any panel by ID
function PanelAdapter({ params }: IDockviewPanelProps<{ panelId: string }>) {
  const Component = panelComponents[params.panelId];
  return Component ? (
    <ErrorBoundary panelName={params.panelId}>
      <Component />
    </ErrorBoundary>
  ) : null;
}
```

### Sacred Center (MessagePanel)

```typescript
// MessagePanel cannot be closed or moved
api.addPanel({
  id: 'message',
  component: 'PanelAdapter',
  params: { panelId: 'message' },
});

// Get the group and lock it
const messagePanel = api.getPanel('message');
messagePanel?.group?.locked = true;
```

### Default Layout

```typescript
function createDefaultLayout(api: DockviewApi) {
  // Left sidebar group
  const leftGroup = api.addGroup();
  api.addPanel({ id: 'changed', component: 'PanelAdapter', params: { panelId: 'changed' } });
  api.addPanel({ id: 'diffs', component: 'PanelAdapter', params: { panelId: 'diffs' } });
  api.addPanel({ id: 'debug', component: 'PanelAdapter', params: { panelId: 'debug' } });

  // Center (sacred)
  api.addPanel({
    id: 'message',
    component: 'PanelAdapter',
    params: { panelId: 'message' },
    position: { direction: 'right', referenceGroup: leftGroup }
  });

  // Right sidebar group
  api.addPanel({ id: 'sprint', ... position: { direction: 'right' } });
  api.addPanel({ id: 'progress', ... });
  api.addPanel({ id: 'background', ... });
  api.addPanel({ id: 'git', ... });
  api.addPanel({ id: 'settings', ... });
}
```

### Layout Persistence

Dockview has built-in serialization:

```typescript
// Save
const serialized = api.toJSON();
await fetch('/api/settings/layout', {
  method: 'PATCH',
  body: JSON.stringify({ dockview: serialized })
});

// Load
const response = await fetch('/api/settings/layout');
const { dockview } = await response.json();
if (dockview) {
  api.fromJSON(dockview);
} else {
  createDefaultLayout(api);
}
```

### Theme Integration

```css
/* dockview-theme.css */
.cyclist-dockview {
  --dv-group-view-background-color: var(--bg-secondary);
  --dv-tabs-and-actions-container-background-color: var(--bg-tertiary);
  --dv-activegroup-visiblepanel-tab-background-color: var(--accent-color);
  --dv-activegroup-visiblepanel-tab-color: var(--text-primary);
  --dv-separator-border: var(--border-color);
  --dv-paneview-header-border-color: var(--border-color);
}
```

### Responsive Behavior

Keep `useResponsiveLayout` hook, apply to Dockview:

```typescript
const { isSmall } = useResponsiveLayout();

useEffect(() => {
  if (isSmall) {
    // Collapse side groups
    api.getGroup('left')?.api.setSize({ width: 0 });
    api.getGroup('right')?.api.setSize({ width: 0 });
  }
}, [isSmall]);
```

## Acceptance Criteria

- [ ] DockingWorkspace.tsx deleted (1,042 lines removed)
- [ ] DockviewWorkspace.tsx renders all 9 panels
- [ ] MessagePanel locked in center (cannot close/move)
- [ ] Panels draggable between sidebars
- [ ] Layout persists to config.local.yaml
- [ ] Responsive collapse at <1024px works
- [ ] Theme matches current BikeRack GUI design
- [ ] All existing panel functionality preserved
- [ ] Tests pass (update as needed for new DOM structure)

## New Capabilities (Enabled by Default)

Once migrated, users automatically get:
- **Floating panels** - Pop out any panel to separate window
- **Split views** - Show multiple panels side-by-side in a region
- **Panel maximization** - Double-click tab to maximize
- **Better drag UX** - Dockview's polished drag-drop behavior

## Tab Overflow Handling

When multiple tabs exist in a sidebar group and they exceed the visible width, Dockview provides built-in overflow handling via two mechanisms:

### 1. Scrollable Tabs (Primary)

The tabs container (`.dv-tabs-container`) uses horizontal scrolling with a visible scrollbar:

```css
.cyclist-dockview .dv-tabs-container {
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--text-muted) transparent;
}
```

Users can scroll horizontally through tabs using:
- Mouse wheel (horizontal scroll)
- Trackpad gestures
- Dragging the scrollbar

### 2. Overflow Dropdown (Secondary)

When Dockview detects tab overflow, it can render an overflow dropdown (`.dv-tabs-overflow-dropdown-default`) that shows hidden tabs in a dropdown menu. The dropdown is styled to match the BikeRack GUI theme:

```css
.cyclist-dockview .dv-tabs-overflow-dropdown-default {
  background-color: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}
```

### Keyboard Navigation

All tabs remain keyboard accessible:
- `Tab` key navigates between tabs
- `Enter`/`Space` activates the focused tab
- Arrow keys navigate within the tab list

### CSS Location

All tab overflow styling is in `src/public/styles/dockview-theme.css` under the "Tab Overflow Handling" section (added in MSSCI-14187).

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| CSS conflicts | Scoped overrides, test thoroughly |
| Layout migration | Fallback to default if old format detected |
| Test breakage | Update selectors for Dockview DOM |

## Consequences

### Positive
- **Net deletion of ~800+ lines** of buggy custom code
- **Fix current panel bugs** by replacing with proven library
- **New features for free** - floating, split, maximize
- **Better accessibility** - Dockview has full ARIA
- **Reduced maintenance** - community maintains docking

### Negative
- **5-8 point story** - significant but bounded work
- **Test updates** - DOM structure changes

## References

- [Dockview Documentation](https://dockview.dev/)
- [Dockview React Guide](https://dockview.dev/docs/components/dockview)
- [Dockview GitHub](https://github.com/mathuo/dockview)
