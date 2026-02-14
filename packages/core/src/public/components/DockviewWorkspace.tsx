/**
 * DockviewWorkspace - Dockview-based panel management for Cyclist
 *
 * Story MSSCI-14001: Replace DockingWorkspace with Dockview
 * Epic: epic-76 (Dockview Panel Migration)
 *
 * Features:
 * - Three-region layout (left sidebar, center sacred, right sidebar)
 * - Message view is sacred (fixed center, cannot be closed or moved)
 * - Tabbed panels in sidebars with drag-and-drop
 * - Responsive breakpoints (auto-collapse at <1024px)
 * - Layout persistence via native Dockview toJSON/fromJSON
 * - Theme integration via CSS custom properties
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
  DockviewApi,
  IDockviewPanel,
  SerializedDockview,
  DockviewDefaultTab,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { ErrorBoundary } from './ErrorBoundary';
import { panelRegistry, type PanelComponent } from './panel-registry';
import { useResponsiveLayout, MIN_DIMENSIONS, SIDEBAR_WIDTHS } from '../hooks/useResponsiveLayout';
import { useFocusPanel } from '../hooks/useFocusPanel.js';
import '../styles/dockview-theme.css';

// =============================================================================
// Panel Inventory - All available panels in Cyclist
// =============================================================================

export const PANEL_INVENTORY = {
  // Left sidebar panels
  CHANGED: 'changed',
  DIFFS: 'diffs',
  DEBUG: 'debug',
  AUDIT_LOG: 'audit-log',
  // Center panel (sacred)
  MESSAGE: 'message',
  // Right sidebar panels
  SPRINT: 'sprint',
  WORKFLOW: 'workflow',
  AC: 'ac',
  TODO: 'todo',
  BACKGROUND: 'background',
  GIT: 'git',
  SETTINGS: 'settings',
} as const;

export type PanelId = typeof PANEL_INVENTORY[keyof typeof PANEL_INVENTORY];

// =============================================================================
// Panel Component Registry
// =============================================================================

/**
 * Register a panel component by ID
 */
export function registerPanelComponent(id: string, component: PanelComponent): void {
  panelRegistry.set(id, component);
}

// =============================================================================
// Global API Reference
// =============================================================================

let dockviewApiRef: DockviewApi | null = null;

/**
 * Get the Dockview API instance for external access
 */
export function getDockviewApi(): DockviewApi | null {
  return dockviewApiRef;
}

// Panel group definitions (needed for restore logic)
// Exported so layout persistence can merge missing panels
export const LEFT_SIDEBAR_PANELS = [PANEL_INVENTORY.CHANGED, PANEL_INVENTORY.DIFFS, PANEL_INVENTORY.DEBUG, PANEL_INVENTORY.AUDIT_LOG] as const;
export const RIGHT_SIDEBAR_PANELS = [
  PANEL_INVENTORY.SPRINT,
  PANEL_INVENTORY.WORKFLOW,
  PANEL_INVENTORY.AC,
  PANEL_INVENTORY.TODO,
  PANEL_INVENTORY.BACKGROUND,
  PANEL_INVENTORY.GIT,
  PANEL_INVENTORY.SETTINGS,
] as const;

// Title Case display names for tab headers (AC4: Story 75-5)
const PANEL_TITLES: Record<string, string> = {
  changed: 'Changed',
  diffs: 'Diffs',
  debug: 'Debug',
  'audit-log': 'Audit Log',
  message: 'Message',
  sprint: 'Sprint',
  workflow: 'Workflow',
  ac: 'AC',
  todo: 'Todo',
  background: 'Subagents',
  git: 'Git',
  settings: 'Settings',
};

// Track closed panels for restoration
const closedPanels: Set<string> = new Set();

/**
 * Get list of closed panels that can be restored
 */
export function getClosedPanels(): string[] {
  return Array.from(closedPanels);
}

/**
 * Restore a previously closed panel
 */
export function restorePanel(panelId: string): boolean {
  const api = dockviewApiRef;
  if (!api) return false;

  // If panel already exists in Dockview, nothing to restore
  if (api.getPanel(panelId)) return false;

  // Determine which group to add it to
  const isLeftPanel = LEFT_SIDEBAR_PANELS.includes(panelId as any);
  const isRightPanel = RIGHT_SIDEBAR_PANELS.includes(panelId as any);

  // Find a reference panel in the appropriate group
  let referencePanel: IDockviewPanel | undefined;

  if (isLeftPanel) {
    for (const id of LEFT_SIDEBAR_PANELS) {
      const panel = api.getPanel(id);
      if (panel) {
        referencePanel = panel;
        break;
      }
    }
  } else if (isRightPanel) {
    for (const id of RIGHT_SIDEBAR_PANELS) {
      const panel = api.getPanel(id);
      if (panel) {
        referencePanel = panel;
        break;
      }
    }
  }

  // Add the panel back
  api.addPanel({
    id: panelId,
    component: 'PanelAdapter',
    params: { panelId },
    position: referencePanel ? { referencePanel: referencePanel.id } : undefined,
    title: PANEL_TITLES[panelId] || panelId,
  });

  closedPanels.delete(panelId);
  return true;
}

// =============================================================================
// Panel Adapter - Wraps existing panels for Dockview
// =============================================================================

interface PanelAdapterParams {
  panelId: string;
}

export function PanelAdapter({ params }: IDockviewPanelProps<PanelAdapterParams>): React.ReactElement | null {
  const Component = panelRegistry.get(params.panelId);

  if (!Component) {
    console.warn(`[DockviewWorkspace] No component registered for panel: ${params.panelId}`);
    return null;
  }

  return (
    <div data-testid={`panel-${params.panelId}`} className="dockview-panel-content">
      <ErrorBoundary panelName={params.panelId}>
        <div className="error-boundary-wrapper">
          <Component />
        </div>
      </ErrorBoundary>
    </div>
  );
}

// =============================================================================
// Types for Layout Persistence
// =============================================================================

// Re-export SerializedDockview for external use
export type { SerializedDockview };

/**
 * @deprecated Use SerializedDockview from dockview-react instead
 * Kept for backward compatibility during migration
 */
export interface WorkspaceLayoutConfig {
  leftSidebar: {
    panels: string[];
    width: number;
    collapsed: boolean;
    activePanel?: string;
  };
  center: {
    panels: string[];
    locked: boolean;
  };
  rightSidebar: {
    panels: string[];
    width: number;
    collapsed: boolean;
    activePanel?: string;
  };
}

/**
 * Create default workspace layout using native Dockview format
 * This builds the initial three-region layout programmatically
 */
export function createDefaultDockviewLayout(): SerializedDockview {
  // Build the default layout structure that matches what toJSON() produces
  // This creates: [left sidebar] | [center message] | [right sidebar]
  return {
    grid: {
      root: {
        type: 'branch',
        data: [
          // Left sidebar group
          {
            type: 'leaf',
            data: {
              views: LEFT_SIDEBAR_PANELS.map(id => id),
              activeView: LEFT_SIDEBAR_PANELS[0],
              id: 'left-sidebar',
            },
            size: SIDEBAR_WIDTHS.medium,
          },
          // Center (message) group
          {
            type: 'leaf',
            data: {
              views: [PANEL_INVENTORY.MESSAGE],
              activeView: PANEL_INVENTORY.MESSAGE,
              id: 'center',
              hideHeader: true,
            },
            size: 600, // Center takes remaining space
          },
          // Right sidebar group
          {
            type: 'leaf',
            data: {
              views: [...RIGHT_SIDEBAR_PANELS],
              activeView: RIGHT_SIDEBAR_PANELS[0],
              id: 'right-sidebar',
            },
            size: SIDEBAR_WIDTHS.medium,
          },
        ],
        size: 800, // Will be overridden by actual container height
      },
      width: 1200,
      height: 800,
      orientation: 'HORIZONTAL',
    },
    panels: {
      // Left sidebar panels
      ...Object.fromEntries(LEFT_SIDEBAR_PANELS.map(id => [id, {
        id,
        contentComponent: 'PanelAdapter',
        title: PANEL_TITLES[id] || id,
        params: { panelId: id },
      }])),
      // Center panel
      [PANEL_INVENTORY.MESSAGE]: {
        id: PANEL_INVENTORY.MESSAGE,
        contentComponent: 'PanelAdapter',
        title: PANEL_TITLES[PANEL_INVENTORY.MESSAGE],
        params: { panelId: PANEL_INVENTORY.MESSAGE },
      },
      // Right sidebar panels
      ...Object.fromEntries(RIGHT_SIDEBAR_PANELS.map(id => [id, {
        id,
        contentComponent: 'PanelAdapter',
        title: PANEL_TITLES[id] || id,
        params: { panelId: id },
      }])),
    },
    activeGroup: 'center',
  };
}

/**
 * @deprecated Use createDefaultDockviewLayout instead
 * Kept for backward compatibility
 */
export function createWorkspaceLayout(): WorkspaceLayoutConfig {
  return {
    leftSidebar: {
      panels: [...LEFT_SIDEBAR_PANELS],
      width: SIDEBAR_WIDTHS.medium,
      collapsed: false,
    },
    center: {
      panels: [PANEL_INVENTORY.MESSAGE],
      locked: true,
    },
    rightSidebar: {
      panels: [...RIGHT_SIDEBAR_PANELS],
      width: SIDEBAR_WIDTHS.medium,
      collapsed: false,
    },
  };
}

// =============================================================================
// Layout Migration (MSSCI-14188)
// =============================================================================

interface SimplifiedLayoutPanel {
  id: string;
  position?: string;
}

interface SimplifiedLayout {
  panels: SimplifiedLayoutPanel[];
}

/**
 * Migrate old layout format that had "progress" panel to new format with
 * separate workflow, ac, and todo panels.
 *
 * Story: MSSCI-14188 - Split Progress panel into Workflow, AC, and Todo panels
 */
export function migrateLayout(layout: SimplifiedLayout | null | undefined): SimplifiedLayout {
  // Handle null/undefined gracefully
  if (!layout || !layout.panels) {
    return { panels: [] };
  }

  // Check if layout already has new panels (no migration needed)
  const hasNewPanels = layout.panels.some(
    (p) => p.id === 'workflow' || p.id === 'ac' || p.id === 'todo'
  );
  if (hasNewPanels) {
    // Already migrated, just filter out any stale 'progress' panel
    return {
      panels: layout.panels.filter((p) => p.id !== 'progress'),
    };
  }

  // Check if layout has old 'progress' panel that needs migration
  const progressIndex = layout.panels.findIndex((p) => p.id === 'progress');
  if (progressIndex === -1) {
    // No progress panel to migrate
    return layout;
  }

  // Get the position of the old progress panel
  const progressPanel = layout.panels[progressIndex];
  const position = progressPanel.position || 'right';

  // Build new panels array with progress replaced by workflow, ac, todo
  const newPanels: SimplifiedLayoutPanel[] = [];

  for (let i = 0; i < layout.panels.length; i++) {
    if (i === progressIndex) {
      // Replace progress with three new panels at the same position
      newPanels.push({ id: 'workflow', position });
      newPanels.push({ id: 'ac', position });
      newPanels.push({ id: 'todo', position });
    } else {
      newPanels.push(layout.panels[i]);
    }
  }

  return { panels: newPanels };
}

// =============================================================================
// DockviewWorkspace Component
// =============================================================================

export interface DockviewWorkspaceProps {
  /** Native Dockview serialized layout (preferred) */
  initialLayout?: SerializedDockview;
  /** Callback when layout changes - receives native Dockview format */
  onLayoutChange?: (layout: SerializedDockview) => void;
}

export function DockviewWorkspace({
  initialLayout,
  onLayoutChange,
}: DockviewWorkspaceProps): React.ReactElement {
  const apiRef = useRef<DockviewApi | null>(null);
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
  const { isSmall, isBelowMinimum, sidebarWidth } = useResponsiveLayout();
  const [isReady, setIsReady] = useState(false);
  const [closedPanelsList, setClosedPanelsList] = useState<string[]>([]);
  const [showRestoreMenu, setShowRestoreMenu] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Panel focus mode — stash/restore layout on /bc CLI events
  useFocusPanel(dockviewApi);

  // Track if responsive effect should apply - skip on initial load to respect saved collapsed state
  const hasAppliedInitialLayout = useRef(false);
  const previousIsSmall = useRef<boolean | null>(null);

  // Update closed panels list when panels change
  const updateClosedPanelsList = useCallback(() => {
    setClosedPanelsList(Array.from(closedPanels));
  }, []);

  // Handle Dockview ready event
  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;
    apiRef.current = api;
    dockviewApiRef = api;
    setDockviewApi(api);

    // Use native fromJSON if we have a saved layout, otherwise build default
    if (initialLayout && initialLayout.grid && initialLayout.panels) {
      // Restore from native Dockview serialized format
      try {
        api.fromJSON(initialLayout);

        // After restoring, lock the message panel's group and hide its tab bar
        const messagePanel = api.getPanel(PANEL_INVENTORY.MESSAGE);
        if (messagePanel?.group) {
          messagePanel.group.locked = 'no-drop-target';
          messagePanel.group.model.header.hidden = true;
        }

        setIsReady(true);
        return;
      } catch (err) {
        console.warn('[DockviewWorkspace] Failed to restore layout from JSON, building default:', err);
        // Fall through to build default layout
      }
    }

    // Build default layout programmatically (for first-time users or failed restore)
    // Add first panel to left sidebar (creates the first group)
    const leftFirstPanel = api.addPanel({
      id: LEFT_SIDEBAR_PANELS[0],
      component: 'PanelAdapter',
      params: { panelId: LEFT_SIDEBAR_PANELS[0] },
      title: PANEL_TITLES[LEFT_SIDEBAR_PANELS[0]],
    });

    // Add remaining left sidebar panels to the same group
    for (let i = 1; i < LEFT_SIDEBAR_PANELS.length; i++) {
      const panelId = LEFT_SIDEBAR_PANELS[i];
      if (panelRegistry.has(panelId)) {
        api.addPanel({
          id: panelId,
          component: 'PanelAdapter',
          params: { panelId },
          position: { referencePanel: leftFirstPanel.id },
          title: PANEL_TITLES[panelId],
        });
      }
    }

    // Add message panel to center (creates new group to the right)
    const messagePanel = api.addPanel({
      id: PANEL_INVENTORY.MESSAGE,
      component: 'PanelAdapter',
      params: { panelId: PANEL_INVENTORY.MESSAGE },
      position: { referencePanel: leftFirstPanel.id, direction: 'right' },
      title: PANEL_TITLES[PANEL_INVENTORY.MESSAGE],
    });

    // Add first right sidebar panel (creates new group to the right of center)
    const rightFirstPanel = api.addPanel({
      id: RIGHT_SIDEBAR_PANELS[0],
      component: 'PanelAdapter',
      params: { panelId: RIGHT_SIDEBAR_PANELS[0] },
      position: { referencePanel: messagePanel.id, direction: 'right' },
      title: PANEL_TITLES[RIGHT_SIDEBAR_PANELS[0]],
    });

    // Add remaining right sidebar panels to the same group
    for (let i = 1; i < RIGHT_SIDEBAR_PANELS.length; i++) {
      const panelId = RIGHT_SIDEBAR_PANELS[i];
      if (panelRegistry.has(panelId)) {
        api.addPanel({
          id: panelId,
          component: 'PanelAdapter',
          params: { panelId },
          position: { referencePanel: rightFirstPanel.id },
          title: PANEL_TITLES[panelId],
        });
      }
    }

    // Lock the center group - MessagePanel cannot be closed or moved
    // Hide the tab bar so users can't accidentally close the message tab
    if (messagePanel?.group) {
      messagePanel.group.locked = 'no-drop-target';
      messagePanel.group.model.header.hidden = true;
    }

    // Set initial sidebar sizes
    const leftGroup = leftFirstPanel.group;
    const rightGroup = rightFirstPanel.group;

    if (leftGroup) {
      leftGroup.api.setSize({ width: SIDEBAR_WIDTHS.medium });
    }
    if (rightGroup) {
      rightGroup.api.setSize({ width: SIDEBAR_WIDTHS.medium });
    }

    setIsReady(true);
  }, [initialLayout]);

  // Handle layout changes for persistence using native toJSON
  const handleLayoutChange = useCallback(() => {
    const api = apiRef.current;
    if (!api || !onLayoutChange) return;

    // Never save empty layouts — prevents corruption loop
    if (api.panels.length === 0) return;

    // Debounce saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      // Use native Dockview toJSON for complete layout serialization
      const serializedLayout = api.toJSON();
      // Double-check: don't persist if serialization produced empty panels
      if (serializedLayout.panels && Object.keys(serializedLayout.panels).length > 0) {
        onLayoutChange(serializedLayout);
      }
    }, 300);
  }, [onLayoutChange]);

  // Subscribe to layout changes and track closed panels
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !isReady) return;

    const disposables = [
      api.onDidLayoutChange(() => handleLayoutChange()),
      api.onDidAddPanel((e) => {
        // Panel restored, remove from closed set
        const panelId = e?.panel?.id;
        if (panelId) {
          closedPanels.delete(panelId);
        }
        updateClosedPanelsList();
        handleLayoutChange();
      }),
      api.onDidRemovePanel((e) => {
        // Track closed panels for restoration
        const panelId = e?.panel?.id;
        if (panelId) {
          closedPanels.add(panelId);
          updateClosedPanelsList();
        }
        handleLayoutChange();
      }),
    ];

    return () => {
      disposables.forEach(d => d.dispose());
    };
  }, [isReady, handleLayoutChange]);

  // Handle responsive breakpoints - only on viewport changes, not initial load
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !isReady) return;

    // On first run after layout is ready, just record current state without changing anything
    // This preserves the saved collapsed state from initialLayout
    if (!hasAppliedInitialLayout.current) {
      hasAppliedInitialLayout.current = true;
      previousIsSmall.current = isSmall;
      return;
    }

    // Only apply responsive changes when isSmall actually changes
    if (previousIsSmall.current === isSmall) {
      return;
    }
    previousIsSmall.current = isSmall;

    // Find groups by their panels (groups don't have fixed names)
    const changedPanel = api.getPanel(PANEL_INVENTORY.CHANGED);
    const sprintPanel = api.getPanel(PANEL_INVENTORY.SPRINT);
    const leftGroup = changedPanel?.group;
    const rightGroup = sprintPanel?.group;

    if (isSmall) {
      // Collapse sidebars at small viewport
      leftGroup?.api.setSize({ width: 0 });
      rightGroup?.api.setSize({ width: 0 });
    } else {
      // Restore sidebars to configured width when viewport expands
      leftGroup?.api.setSize({ width: sidebarWidth });
      rightGroup?.api.setSize({ width: sidebarWidth });
    }
  }, [isSmall, sidebarWidth, isReady]);

  // Handle restoring a closed panel
  const handleRestorePanel = useCallback((panelId: string) => {
    restorePanel(panelId);
    setShowRestoreMenu(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      dockviewApiRef = null;
    };
  }, []);

  // Listen for panel toggle commands via WebSocket (View menu integration)
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/settings`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'panel:toggle' && data.panelId) {
          const api = dockviewApiRef;
          if (!api) return;
          const existing = api.getPanel(data.panelId);
          if (existing) {
            existing.api.close();
          } else {
            restorePanel(data.panelId);
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => ws.close();
  }, []);

  // Component map for Dockview
  const components = {
    PanelAdapter,
  };

  // Panel display names for the restore menu
  const panelDisplayNames: Record<string, string> = {
    changed: 'Changed Files',
    diffs: 'Diffs',
    debug: 'Debug',
    'audit-log': 'Audit Log',
    sprint: 'Sprint',
    workflow: 'Workflow',
    ac: 'AC',
    todo: 'Todo',
    background: 'Subagents',
    git: 'Git',
    hotspots: 'Hotspots',
    settings: 'Settings',
  };

  return (
    <div className="cyclist-dockview" data-dockview-group="container">
      {/* Minimum dimension warning */}
      {isBelowMinimum && (
        <div
          data-testid="min-dimension-warning"
          className="min-dimension-warning"
          role="alert"
        >
          Window is below minimum size ({MIN_DIMENSIONS.width}x{MIN_DIMENSIONS.height})
        </div>
      )}

      {/* Panel restore button - shown when panels are closed */}
      {closedPanelsList.length > 0 && (
        <div className="panel-restore-container">
          <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="panel-restore-button"
            onClick={() => setShowRestoreMenu(!showRestoreMenu)}
            aria-expanded={showRestoreMenu}
            aria-haspopup="menu"
          >
            <span className="panel-restore-icon">+</span>
            <span className="panel-restore-count">{closedPanelsList.length}</span>
          </Button>
            </TooltipTrigger>
            <TooltipContent>Restore closed panels</TooltipContent>
          </Tooltip>
          </TooltipProvider>

          {showRestoreMenu && (
            <div className="panel-restore-menu" role="menu">
              <div className="panel-restore-header">Restore Panel</div>
              {closedPanelsList.map((panelId) => (
                <Button
                  variant="ghost"
                  key={panelId}
                  className="panel-restore-item"
                  onClick={() => handleRestorePanel(panelId)}
                  role="menuitem"
                >
                  {panelDisplayNames[panelId] || panelId}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      <DockviewReact
        className="dockview-container"
        onReady={onReady}
        components={components}
        defaultTabComponent={(props) => <DockviewDefaultTab {...props} hideClose />}
        watermarkComponent={() => null}
      />
    </div>
  );
}

export default DockviewWorkspace;
