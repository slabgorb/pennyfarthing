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
 * - Layout persistence via Dockview serialization
 * - Theme integration via CSS custom properties
 */

import React, { useEffect, useRef, useCallback, useState, ComponentType } from 'react';
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
  DockviewApi,
  IDockviewPanel,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { ErrorBoundary } from './ErrorBoundary';
import { useResponsiveLayout, MIN_DIMENSIONS, SIDEBAR_WIDTHS } from '../hooks/useResponsiveLayout';
import '../styles/dockview-theme.css';

// =============================================================================
// Panel Inventory - All available panels in Cyclist
// =============================================================================

export const PANEL_INVENTORY = {
  // Left sidebar panels
  CHANGED: 'changed',
  DIFFS: 'diffs',
  DEBUG: 'debug',
  // Center panel (sacred)
  MESSAGE: 'message',
  // Right sidebar panels
  SPRINT: 'sprint',
  PROGRESS: 'progress',
  BACKGROUND: 'background',
  GIT: 'git',
  SETTINGS: 'settings',
} as const;

export type PanelId = typeof PANEL_INVENTORY[keyof typeof PANEL_INVENTORY];

// =============================================================================
// Panel Component Registry
// =============================================================================

const panelComponents: Map<string, ComponentType> = new Map();

/**
 * Register a panel component by ID
 */
export function registerPanelComponent(id: string, component: ComponentType): void {
  panelComponents.set(id, component);
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
const LEFT_SIDEBAR_PANELS = [PANEL_INVENTORY.CHANGED, PANEL_INVENTORY.DIFFS, PANEL_INVENTORY.DEBUG] as const;
const RIGHT_SIDEBAR_PANELS = [
  PANEL_INVENTORY.SPRINT,
  PANEL_INVENTORY.PROGRESS,
  PANEL_INVENTORY.BACKGROUND,
  PANEL_INVENTORY.GIT,
  PANEL_INVENTORY.SETTINGS,
] as const;

// Title Case display names for tab headers (AC4: Story 75-5)
const PANEL_TITLES: Record<string, string> = {
  changed: 'Changed',
  diffs: 'Diffs',
  debug: 'Debug',
  message: 'Message',
  sprint: 'Sprint',
  progress: 'Progress',
  background: 'Background',
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
  if (!api || !closedPanels.has(panelId)) return false;

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
  const Component = panelComponents.get(params.panelId);

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
// Default Layout
// =============================================================================

function createDefaultLayout(api: DockviewApi, sidebarWidth: number): void {
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
    api.addPanel({
      id: panelId,
      component: 'PanelAdapter',
      params: { panelId },
      position: { referencePanel: leftFirstPanel.id },
      title: PANEL_TITLES[panelId],
    });
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
    api.addPanel({
      id: panelId,
      component: 'PanelAdapter',
      params: { panelId },
      position: { referencePanel: rightFirstPanel.id },
      title: PANEL_TITLES[panelId],
    });
  }

  // Lock the center group - MessagePanel cannot be closed or moved
  if (messagePanel?.group) {
    messagePanel.group.locked = 'no-drop-target';
  }

  // Set initial sidebar sizes
  const leftGroup = leftFirstPanel.group;
  const rightGroup = rightFirstPanel.group;

  if (leftGroup) {
    leftGroup.api.setSize({ width: sidebarWidth });
  }
  if (rightGroup) {
    rightGroup.api.setSize({ width: sidebarWidth });
  }
}

// =============================================================================
// Types for Layout Persistence
// =============================================================================

export interface WorkspaceLayoutConfig {
  leftSidebar: {
    panels: string[];
    width: number;
    collapsed: boolean;
  };
  center: {
    panels: string[];
    locked: boolean;
  };
  rightSidebar: {
    panels: string[];
    width: number;
    collapsed: boolean;
  };
}

/**
 * Create default workspace layout config
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
// DockviewWorkspace Component
// =============================================================================

export interface DockviewWorkspaceProps {
  initialLayout?: WorkspaceLayoutConfig;
  onLayoutChange?: (layout: WorkspaceLayoutConfig) => void;
}

export function DockviewWorkspace({
  initialLayout,
  onLayoutChange,
}: DockviewWorkspaceProps): React.ReactElement {
  const apiRef = useRef<DockviewApi | null>(null);
  const { isSmall, isBelowMinimum, sidebarWidth } = useResponsiveLayout();
  const [isReady, setIsReady] = useState(false);
  const [closedPanelsList, setClosedPanelsList] = useState<string[]>([]);
  const [showRestoreMenu, setShowRestoreMenu] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update closed panels list when panels change
  const updateClosedPanelsList = useCallback(() => {
    setClosedPanelsList(Array.from(closedPanels));
  }, []);

  // Handle Dockview ready event
  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;
    apiRef.current = api;
    dockviewApiRef = api;

    // Create default layout
    createDefaultLayout(api, sidebarWidth);

    // Ensure MessagePanel group is locked
    const messagePanel = api.getPanel(PANEL_INVENTORY.MESSAGE);
    if (messagePanel?.group) {
      messagePanel.group.locked = 'no-drop-target';
    }

    setIsReady(true);
  }, [sidebarWidth]);

  // Handle layout changes for persistence
  const handleLayoutChange = useCallback(() => {
    const api = apiRef.current;
    if (!api || !onLayoutChange) return;

    // Debounce saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const leftGroup = api.getGroup('left');
      const rightGroup = api.getGroup('right');

      const layout: WorkspaceLayoutConfig = {
        leftSidebar: {
          panels: leftGroup?.panels.map(p => p.id) || LEFT_SIDEBAR_PANELS,
          width: leftGroup?.width || sidebarWidth,
          collapsed: (leftGroup?.width || 0) === 0,
        },
        center: {
          panels: [PANEL_INVENTORY.MESSAGE],
          locked: true,
        },
        rightSidebar: {
          panels: rightGroup?.panels.map(p => p.id) || RIGHT_SIDEBAR_PANELS,
          width: rightGroup?.width || sidebarWidth,
          collapsed: (rightGroup?.width || 0) === 0,
        },
      };

      onLayoutChange(layout);
    }, 300);
  }, [onLayoutChange, sidebarWidth]);

  // Subscribe to layout changes and track closed panels
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !isReady) return;

    const disposables = [
      api.onDidLayoutChange(() => handleLayoutChange()),
      api.onDidAddPanel((e) => {
        // Panel restored, remove from closed set
        closedPanels.delete(e.panel.id);
        updateClosedPanelsList();
        handleLayoutChange();
      }),
      api.onDidRemovePanel((e) => {
        // Track closed panels (except message which can't be closed)
        if (e.panel.id !== PANEL_INVENTORY.MESSAGE) {
          closedPanels.add(e.panel.id);
          updateClosedPanelsList();
        }
        handleLayoutChange();
      }),
    ];

    return () => {
      disposables.forEach(d => d.dispose());
    };
  }, [isReady, handleLayoutChange]);

  // Handle responsive breakpoints
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !isReady) return;

    const leftGroup = api.getGroup('left');
    const rightGroup = api.getGroup('right');

    if (isSmall) {
      // Collapse sidebars at small viewport
      leftGroup?.api.setSize({ width: 0 });
      rightGroup?.api.setSize({ width: 0 });
    } else {
      // Restore sidebars
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

  // Component map for Dockview
  const components = {
    PanelAdapter,
  };

  // Panel display names for the restore menu
  const panelDisplayNames: Record<string, string> = {
    changed: 'Changed Files',
    diffs: 'Diffs',
    debug: 'Debug',
    sprint: 'Sprint',
    progress: 'Progress',
    background: 'Background',
    git: 'Git',
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
          <button
            className="panel-restore-button"
            onClick={() => setShowRestoreMenu(!showRestoreMenu)}
            aria-expanded={showRestoreMenu}
            aria-haspopup="menu"
            title="Restore closed panels"
          >
            <span className="panel-restore-icon">+</span>
            <span className="panel-restore-count">{closedPanelsList.length}</span>
          </button>

          {showRestoreMenu && (
            <div className="panel-restore-menu" role="menu">
              <div className="panel-restore-header">Restore Panel</div>
              {closedPanelsList.map((panelId) => (
                <button
                  key={panelId}
                  className="panel-restore-item"
                  onClick={() => handleRestorePanel(panelId)}
                  role="menuitem"
                >
                  {panelDisplayNames[panelId] || panelId}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <DockviewReact
        className="dockview-container"
        onReady={onReady}
        components={components}
        watermarkComponent={() => null}
      />
    </div>
  );
}

export default DockviewWorkspace;
