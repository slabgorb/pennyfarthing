/**
 * DockingWorkspace - Flexible docking layout system for Cyclist
 *
 * Story 70-1: Docking System Foundation
 * Story 70-2: Panel Drag-and-Drop (MSSCI-12705)
 * Story MSSCI-12770: Responsive Breakpoints
 *
 * Features:
 * - Three-region layout (left sidebar, center, right sidebar)
 * - Message view is sacred (fixed center, cannot be moved)
 * - Tabbed panels in sidebars
 * - Collapsible sidebars
 * - Resize handles between regions
 * - ARIA-compliant accessibility
 * - Drag-and-drop panels between sidebars
 * - Tab reordering within sidebars
 * - Ghost preview during drag
 * - Drop zone highlighting
 * - Responsive breakpoints (auto-collapse at <1024px, expand at >1440px)
 * - Minimum dimension warning (800x600)
 */

import React, { useState, useCallback, useRef, useEffect, KeyboardEvent, ComponentType, DragEvent } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { useResponsiveLayout, MIN_DIMENSIONS, SIDEBAR_WIDTHS } from '../hooks/useResponsiveLayout';

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
  PROGRESS: 'progress',  // Now contains Workflow/AC/Todo as internal tabs
  BACKGROUND: 'background',
  GIT: 'git',
  SETTINGS: 'settings',
} as const;

export type PanelId = typeof PANEL_INVENTORY[keyof typeof PANEL_INVENTORY];

// =============================================================================
// Types
// =============================================================================

export interface PanelConfig {
  id: string;
  title: string;
  component: string;
  position: 'left' | 'center' | 'right';
  closable?: boolean;
  draggable?: boolean;
}

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

// =============================================================================
// Panel Configuration
// =============================================================================

const PANEL_CONFIGS: Record<string, PanelConfig> = {
  [PANEL_INVENTORY.CHANGED]: {
    id: PANEL_INVENTORY.CHANGED,
    title: 'Changed',
    component: 'ChangedPanel',
    position: 'left',
    closable: true,
    draggable: true,
  },
  [PANEL_INVENTORY.DIFFS]: {
    id: PANEL_INVENTORY.DIFFS,
    title: 'Diffs',
    component: 'DiffsPanel',
    position: 'left',
    closable: true,
    draggable: true,
  },
  [PANEL_INVENTORY.DEBUG]: {
    id: PANEL_INVENTORY.DEBUG,
    title: 'Debug',
    component: 'DebugPanel',
    position: 'left',
    closable: true,
    draggable: true,
  },
  [PANEL_INVENTORY.MESSAGE]: {
    id: PANEL_INVENTORY.MESSAGE,
    title: 'Message',
    component: 'MessagePanel',
    position: 'center',
    closable: false,
    draggable: false,
  },
  [PANEL_INVENTORY.SPRINT]: {
    id: PANEL_INVENTORY.SPRINT,
    title: 'Sprint',
    component: 'SprintPanel',
    position: 'right',
    closable: true,
    draggable: true,
  },
  [PANEL_INVENTORY.PROGRESS]: {
    id: PANEL_INVENTORY.PROGRESS,
    title: 'Progress',
    component: 'ProgressPanel',
    position: 'right',
    closable: true,
    draggable: true,
  },
  [PANEL_INVENTORY.BACKGROUND]: {
    id: PANEL_INVENTORY.BACKGROUND,
    title: 'Background',
    component: 'BackgroundPanel',
    position: 'right',
    closable: true,
    draggable: true,
  },
  [PANEL_INVENTORY.GIT]: {
    id: PANEL_INVENTORY.GIT,
    title: 'Git',
    component: 'GitPanel',
    position: 'right',
    closable: true,
    draggable: true,
  },
  [PANEL_INVENTORY.SETTINGS]: {
    id: PANEL_INVENTORY.SETTINGS,
    title: 'Settings',
    component: 'SettingsPanel',
    position: 'right',
    closable: true,
    draggable: true,
  },
  // Note: AC and BikeLane are now internal tabs within ProgressPanel
};

// =============================================================================
// Component Registry
// =============================================================================

const panelComponents: Record<string, ComponentType> = {};

export function registerPanelComponent(panelId: string, component: ComponentType): void {
  panelComponents[panelId] = component;
}

// =============================================================================
// Helper Functions
// =============================================================================

export function createWorkspaceLayout(): WorkspaceLayoutConfig {
  return {
    leftSidebar: {
      panels: [PANEL_INVENTORY.CHANGED, PANEL_INVENTORY.DIFFS, PANEL_INVENTORY.DEBUG],
      width: 300,
      collapsed: false,
    },
    center: {
      panels: [PANEL_INVENTORY.MESSAGE],
      locked: true,
    },
    rightSidebar: {
      panels: [
        PANEL_INVENTORY.SPRINT,
        PANEL_INVENTORY.PROGRESS,  // Contains Workflow/AC/Todo as internal tabs
        PANEL_INVENTORY.BACKGROUND,
        PANEL_INVENTORY.GIT,
        PANEL_INVENTORY.SETTINGS,
      ],
      width: 300,
      collapsed: false,
    },
  };
}

export function getPanelConfig(panelId: string): PanelConfig {
  return PANEL_CONFIGS[panelId] || {
    id: panelId,
    title: panelId,
    component: panelId,
    position: 'left',
    closable: true,
    draggable: true,
  };
}

export function collapsePanel(panelId: string): void {
  // State management handled by component
}

export function expandPanel(panelId: string): void {
  // State management handled by component
}

// =============================================================================
// Drag Handle Component
// =============================================================================

interface DragHandleProps {
  isDragging: boolean;
}

function DragHandle({ isDragging }: DragHandleProps) {
  // Use ref to apply cursor synchronously for test compatibility
  const ref = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (ref.current) {
      ref.current.style.cursor = isDragging ? 'grabbing' : 'grab';
    }
  }, [isDragging]);

  return (
    <span
      ref={ref}
      data-testid="drag-handle"
      aria-label="drag to reorder"
      className={`drag-handle ${isDragging ? 'dragging' : ''}`}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      ⋮⋮
    </span>
  );
}

// =============================================================================
// Tab Drop Target Component
// =============================================================================

interface TabDropTargetProps {
  region: 'left' | 'right';
  index: number;
  isActive: boolean;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}

function TabDropTarget({ region, index, isActive, onDragOver, onDrop }: TabDropTargetProps) {
  return (
    <div
      data-testid={`${region}-tab-drop-${index}`}
      className={`tab-drop-target ${isActive ? 'tab-insertion-indicator' : ''}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    />
  );
}

// =============================================================================
// Sidebar Component
// =============================================================================

interface SidebarProps {
  region: 'left' | 'right';
  panels: string[];
  collapsed: boolean;
  width: number;
  activePanel: string;
  onPanelChange: (panelId: string) => void;
  onCollapseToggle: () => void;
  isDropZoneActive: boolean;
  dropValidPosition: number | null;
  onDragStart: (e: DragEvent, panelId: string, index: number) => void;
  onDragEnd: () => void;
  onDragEnter: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onTabDragOver: (e: DragEvent, index: number) => void;
  onTabDrop: (e: DragEvent, index: number) => void;
  draggingPanelId: string | null;
  responsiveCollapsed?: boolean;
}

function Sidebar({
  region,
  panels,
  collapsed,
  width,
  activePanel,
  onPanelChange,
  onCollapseToggle,
  isDropZoneActive,
  dropValidPosition,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onTabDragOver,
  onTabDrop,
  draggingPanelId,
  responsiveCollapsed,
}: SidebarProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
      let newIndex = index;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        newIndex = (index + 1) % panels.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        newIndex = (index - 1 + panels.length) % panels.length;
      }
      if (newIndex !== index) {
        onPanelChange(panels[newIndex]);
        tabRefs.current[newIndex]?.focus();
      }
    },
    [panels, onPanelChange]
  );

  return (
    <div
      data-region={region}
      data-collapsed={collapsed ? 'true' : undefined}
      data-responsive-collapsed={responsiveCollapsed ? 'true' : undefined}
      data-testid={`sidebar-${region}-dropzone`}
      data-drop-valid={isDropZoneActive ? 'true' : undefined}
      className={`sidebar sidebar-${region} ${isDropZoneActive ? 'drop-zone-active' : ''}`}
      style={{ width: collapsed ? 0 : width }}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div role="tablist" className="tablist">
        {panels.map((panelId, index) => {
          const config = getPanelConfig(panelId);
          const isActive = panelId === activePanel;
          const isDragging = panelId === draggingPanelId;
          return (
            <React.Fragment key={panelId}>
              <TabDropTarget
                region={region}
                index={index}
                isActive={dropValidPosition === index}
                onDragOver={(e) => onTabDragOver(e, index)}
                onDrop={(e) => onTabDrop(e, index)}
              />
              <button
                ref={(el) => { tabRefs.current[index] = el; }}
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                draggable={config.draggable}
                onClick={() => onPanelChange(panelId)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                onDragStart={(e) => onDragStart(e, panelId, index)}
                onDragEnd={onDragEnd}
                className={`tab ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
              >
                {config.draggable && <DragHandle isDragging={isDragging} />}
                {config.title}
              </button>
            </React.Fragment>
          );
        })}
        {/* Final drop target after all tabs */}
        <TabDropTarget
          region={region}
          index={panels.length}
          isActive={dropValidPosition === panels.length}
          onDragOver={(e) => onTabDragOver(e, panels.length)}
          onDrop={(e) => onTabDrop(e, panels.length)}
        />
      </div>
      {panels.map((panelId) => {
        const isActive = panelId === activePanel;
        const Component = panelComponents[panelId];
        return (
          <div
            key={panelId}
            role="tabpanel"
            data-panel={panelId}
            hidden={!isActive}
            className={`panel panel-${panelId}`}
          >
            {Component ? (
              <ErrorBoundary panelName={getPanelConfig(panelId).title}>
                <Component />
              </ErrorBoundary>
            ) : null}
          </div>
        );
      })}
      <button
        data-testid={`${region}-collapse-toggle`}
        onClick={onCollapseToggle}
        className="collapse-toggle"
        aria-label={collapsed ? `Expand ${region} sidebar` : `Collapse ${region} sidebar`}
      >
        {region === 'left' ? (collapsed ? '»' : '«') : (collapsed ? '«' : '»')}
      </button>
    </div>
  );
}

// =============================================================================
// Resize Handle Component
// =============================================================================

interface ResizeHandleProps {
  position: 'left' | 'right';
  currentWidth: number;
  onResizeStart: () => void;
  onResizeMove: (newWidth: number) => void;
  onResizeEnd: () => void;
}

function ResizeHandle({ position, currentWidth, onResizeStart, onResizeMove, onResizeEnd }: ResizeHandleProps) {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = currentWidth;

    onResizeStart();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      // For left handle, positive delta = wider left sidebar
      // For right handle, positive delta = narrower right sidebar (so negate)
      const adjustedDelta = position === 'left' ? delta : -delta;
      const minWidth = 150;
      const maxWidth = 600;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + adjustedDelta));
      onResizeMove(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      onResizeEnd();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [position, currentWidth, onResizeStart, onResizeMove, onResizeEnd]);

  return (
    <div
      data-testid={`resize-handle-${position}`}
      className="resize-handle cursor-col-resize"
      style={{ cursor: 'col-resize' }}
      onMouseDown={handleMouseDown}
    />
  );
}

// =============================================================================
// Ghost Element Helper
// =============================================================================

function createGhostElement(title: string): HTMLDivElement {
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.textContent = title;
  ghost.style.position = 'absolute';
  ghost.style.top = '-1000px';
  ghost.style.left = '-1000px';
  document.body.appendChild(ghost);
  return ghost;
}

function removeGhostElement(): void {
  const ghosts = document.querySelectorAll('.drag-ghost');
  ghosts.forEach((ghost) => ghost.remove());
}

// =============================================================================
// DockingWorkspace Component
// =============================================================================

export interface DockingWorkspaceProps {
  initialLayout?: WorkspaceLayoutConfig;
  leftCollapsed?: boolean;
  rightCollapsed?: boolean;
  onLeftCollapseChange?: (collapsed: boolean) => void;
  onRightCollapseChange?: (collapsed: boolean) => void;
  onDropRejected?: () => void;
  onLayoutChange?: (layout: WorkspaceLayoutConfig) => void;
  /** Enable responsive behavior (auto-collapse at small, expand at large). Default: true */
  responsive?: boolean;
}

export function DockingWorkspace({
  initialLayout,
  leftCollapsed: leftCollapsedProp,
  rightCollapsed: rightCollapsedProp,
  onLeftCollapseChange,
  onRightCollapseChange,
  onDropRejected,
  onLayoutChange,
  responsive = true,
}: DockingWorkspaceProps) {
  const [layout, setLayout] = useState(() => initialLayout ?? createWorkspaceLayout());

  // Responsive layout detection
  const responsiveState = useResponsiveLayout();
  const { breakpoint, isSmall, isLarge, sidebarWidth: responsiveSidebarWidth, isBelowMinimum } = responsiveState;

  // Track user manual overrides for collapse state
  const [leftUserOverride, setLeftUserOverride] = useState(false);
  const [rightUserOverride, setRightUserOverride] = useState(false);

  // Determine effective collapsed state
  // Priority: prop > initialLayout > responsive auto-collapse
  const shouldAutoCollapse = responsive && isSmall;
  const effectiveLeftCollapsed = leftCollapsedProp !== undefined
    ? leftCollapsedProp
    : (initialLayout?.leftSidebar?.collapsed ?? (shouldAutoCollapse && !leftUserOverride));
  const effectiveRightCollapsed = rightCollapsedProp !== undefined
    ? rightCollapsedProp
    : (initialLayout?.rightSidebar?.collapsed ?? (shouldAutoCollapse && !rightUserOverride));

  const [leftCollapsed, setLeftCollapsed] = useState(effectiveLeftCollapsed);
  const [rightCollapsed, setRightCollapsed] = useState(effectiveRightCollapsed);
  const [leftActivePanel, setLeftActivePanel] = useState(layout.leftSidebar.panels[0]);
  const [rightActivePanel, setRightActivePanel] = useState(layout.rightSidebar.panels[0]);

  // Track whether current collapse is due to responsive behavior
  const [leftResponsiveCollapsed, setLeftResponsiveCollapsed] = useState(false);
  const [rightResponsiveCollapsed, setRightResponsiveCollapsed] = useState(false);

  // Drag state
  const [draggingPanelId, setDraggingPanelId] = useState<string | null>(null);
  const [draggingSource, setDraggingSource] = useState<'left' | 'right' | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [leftDropZoneActive, setLeftDropZoneActive] = useState(false);
  const [rightDropZoneActive, setRightDropZoneActive] = useState(false);
  const [centerDropRejected, setCenterDropRejected] = useState(false);
  const [leftDropPosition, setLeftDropPosition] = useState<number | null>(null);
  const [rightDropPosition, setRightDropPosition] = useState<number | null>(null);

  // Sync with props
  useEffect(() => {
    if (leftCollapsedProp !== undefined) {
      setLeftCollapsed(leftCollapsedProp);
    }
  }, [leftCollapsedProp]);

  useEffect(() => {
    if (rightCollapsedProp !== undefined) {
      setRightCollapsed(rightCollapsedProp);
    }
  }, [rightCollapsedProp]);

  // Responsive auto-collapse effect
  useEffect(() => {
    if (!responsive) return;

    if (isSmall && !leftUserOverride) {
      setLeftCollapsed(true);
      setLeftResponsiveCollapsed(true);
    } else if (!isSmall && leftResponsiveCollapsed) {
      setLeftCollapsed(false);
      setLeftResponsiveCollapsed(false);
    }

    if (isSmall && !rightUserOverride) {
      setRightCollapsed(true);
      setRightResponsiveCollapsed(true);
    } else if (!isSmall && rightResponsiveCollapsed) {
      setRightCollapsed(false);
      setRightResponsiveCollapsed(false);
    }
  }, [responsive, isSmall, leftUserOverride, rightUserOverride, leftResponsiveCollapsed, rightResponsiveCollapsed]);

  // Update sidebar widths based on breakpoint
  useEffect(() => {
    if (!responsive) return;

    const newWidth = isLarge ? SIDEBAR_WIDTHS.large : SIDEBAR_WIDTHS.medium;
    setLayout(prev => ({
      ...prev,
      leftSidebar: { ...prev.leftSidebar, width: newWidth },
      rightSidebar: { ...prev.rightSidebar, width: newWidth },
    }));
  }, [responsive, isLarge]);

  const handleLeftCollapseToggle = useCallback(() => {
    const newValue = !leftCollapsed;
    setLeftCollapsed(newValue);
    // If user expands while in small breakpoint, mark as user override
    if (responsive && isSmall && !newValue) {
      setLeftUserOverride(true);
    } else if (!isSmall) {
      // Reset override when not in small breakpoint
      setLeftUserOverride(false);
    }
    setLeftResponsiveCollapsed(false);
    onLeftCollapseChange?.(newValue);
    // Update layout and persist collapsed state
    setLayout(prev => {
      const newLayout = { ...prev, leftSidebar: { ...prev.leftSidebar, collapsed: newValue } };
      onLayoutChange?.(newLayout);
      return newLayout;
    });
  }, [leftCollapsed, onLeftCollapseChange, onLayoutChange, responsive, isSmall]);

  const handleRightCollapseToggle = useCallback(() => {
    const newValue = !rightCollapsed;
    setRightCollapsed(newValue);
    // If user expands while in small breakpoint, mark as user override
    if (responsive && isSmall && !newValue) {
      setRightUserOverride(true);
    } else if (!isSmall) {
      // Reset override when not in small breakpoint
      setRightUserOverride(false);
    }
    setRightResponsiveCollapsed(false);
    onRightCollapseChange?.(newValue);
    // Update layout and persist collapsed state
    setLayout(prev => {
      const newLayout = { ...prev, rightSidebar: { ...prev.rightSidebar, collapsed: newValue } };
      onLayoutChange?.(newLayout);
      return newLayout;
    });
  }, [rightCollapsed, onRightCollapseChange, onLayoutChange, responsive, isSmall]);

  // ==========================================================================
  // Resize Handlers
  // ==========================================================================

  const handleLeftResizeMove = useCallback((newWidth: number) => {
    setLayout(prev => ({
      ...prev,
      leftSidebar: { ...prev.leftSidebar, width: newWidth }
    }));
  }, []);

  const handleRightResizeMove = useCallback((newWidth: number) => {
    setLayout(prev => ({
      ...prev,
      rightSidebar: { ...prev.rightSidebar, width: newWidth }
    }));
  }, []);

  const handleResizeEnd = useCallback(() => {
    // Notify parent of final layout on resize end
    onLayoutChange?.(layout);
  }, [layout, onLayoutChange]);

  const handleResizeStart = useCallback(() => {
    // Could add visual feedback here if needed
  }, []);

  // ==========================================================================
  // Drag Handlers
  // ==========================================================================

  const handleDragStart = useCallback(
    (e: DragEvent, panelId: string, index: number, source: 'left' | 'right') => {
      const config = getPanelConfig(panelId);

      // Set drag data (defensive: dataTransfer may be undefined in tests)
      if (e.dataTransfer) {
        e.dataTransfer.setData('application/x-cyclist-panel', panelId);
        e.dataTransfer.setData('application/x-cyclist-source', source);
        e.dataTransfer.setData('application/x-cyclist-index', index.toString());
        e.dataTransfer.effectAllowed = 'move';

        // Create ghost preview
        const ghost = createGhostElement(config.title);
        e.dataTransfer.setDragImage(ghost, 0, 0);
      }

      setDraggingPanelId(panelId);
      setDraggingSource(source);
      setDraggingIndex(index);
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    removeGhostElement();
    setDraggingPanelId(null);
    setDraggingSource(null);
    setDraggingIndex(null);
    setLeftDropZoneActive(false);
    setRightDropZoneActive(false);
    setCenterDropRejected(false);
    setLeftDropPosition(null);
    setRightDropPosition(null);
  }, []);

  const handleSidebarDragEnter = useCallback((region: 'left' | 'right') => {
    if (region === 'left') {
      setLeftDropZoneActive(true);
    } else {
      setRightDropZoneActive(true);
    }
  }, []);

  const handleSidebarDragLeave = useCallback((region: 'left' | 'right') => {
    if (region === 'left') {
      setLeftDropZoneActive(false);
      setLeftDropPosition(null);
    } else {
      setRightDropZoneActive(false);
      setRightDropPosition(null);
    }
  }, []);

  const handleSidebarDragOver = useCallback((e: DragEvent, region: 'left' | 'right') => {
    e.preventDefault();
    if (region === 'left') {
      setLeftDropZoneActive(true);
    } else {
      setRightDropZoneActive(true);
    }
  }, []);

  const handleSidebarDrop = useCallback(
    (e: DragEvent, targetRegion: 'left' | 'right') => {
      e.preventDefault();

      const panelId = e.dataTransfer.getData('application/x-cyclist-panel');
      const sourceRegion = e.dataTransfer.getData('application/x-cyclist-source') as 'left' | 'right';

      if (!panelId || !sourceRegion) return;

      // Don't allow dropping on same region (use tab reorder instead)
      if (sourceRegion === targetRegion) return;

      const newLayout = { ...layout };
      const sourcePanels = sourceRegion === 'left'
        ? [...newLayout.leftSidebar.panels]
        : [...newLayout.rightSidebar.panels];
      const targetPanels = targetRegion === 'left'
        ? [...newLayout.leftSidebar.panels]
        : [...newLayout.rightSidebar.panels];

      // Remove from source
      const sourceIndex = sourcePanels.indexOf(panelId);
      if (sourceIndex !== -1) {
        sourcePanels.splice(sourceIndex, 1);
      }

      // Add to target
      targetPanels.push(panelId);

      // Update layout
      if (sourceRegion === 'left') {
        newLayout.leftSidebar.panels = sourcePanels;
      } else {
        newLayout.rightSidebar.panels = sourcePanels;
      }

      if (targetRegion === 'left') {
        newLayout.leftSidebar.panels = targetPanels;
      } else {
        newLayout.rightSidebar.panels = targetPanels;
      }

      setLayout(newLayout);
      onLayoutChange?.(newLayout);

      // Reset drag state
      handleDragEnd();
    },
    [layout, onLayoutChange, handleDragEnd]
  );

  const handleTabDragOver = useCallback(
    (e: DragEvent, index: number, region: 'left' | 'right') => {
      e.preventDefault();
      if (region === 'left') {
        setLeftDropPosition(index);
      } else {
        setRightDropPosition(index);
      }
    },
    []
  );

  const handleTabDrop = useCallback(
    (e: DragEvent, targetIndex: number, targetRegion: 'left' | 'right') => {
      e.preventDefault();
      e.stopPropagation();

      const panelId = e.dataTransfer.getData('application/x-cyclist-panel');
      const sourceRegion = e.dataTransfer.getData('application/x-cyclist-source') as 'left' | 'right';
      const sourceIndexStr = e.dataTransfer.getData('application/x-cyclist-index');
      const sourceIndex = parseInt(sourceIndexStr, 10);

      if (!panelId || !sourceRegion) return;

      const newLayout = { ...layout };

      if (sourceRegion === targetRegion) {
        // Reordering within same sidebar
        const panels = sourceRegion === 'left'
          ? [...newLayout.leftSidebar.panels]
          : [...newLayout.rightSidebar.panels];

        // Remove from old position
        panels.splice(sourceIndex, 1);

        // Insert at new position (adjust if needed)
        const adjustedIndex = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;
        panels.splice(adjustedIndex, 0, panelId);

        if (sourceRegion === 'left') {
          newLayout.leftSidebar.panels = panels;
        } else {
          newLayout.rightSidebar.panels = panels;
        }
      } else {
        // Moving between sidebars
        const sourcePanels = sourceRegion === 'left'
          ? [...newLayout.leftSidebar.panels]
          : [...newLayout.rightSidebar.panels];
        const targetPanels = targetRegion === 'left'
          ? [...newLayout.leftSidebar.panels]
          : [...newLayout.rightSidebar.panels];

        // Remove from source
        sourcePanels.splice(sourceIndex, 1);

        // Insert at target position
        targetPanels.splice(targetIndex, 0, panelId);

        if (sourceRegion === 'left') {
          newLayout.leftSidebar.panels = sourcePanels;
        } else {
          newLayout.rightSidebar.panels = sourcePanels;
        }

        if (targetRegion === 'left') {
          newLayout.leftSidebar.panels = targetPanels;
        } else {
          newLayout.rightSidebar.panels = targetPanels;
        }
      }

      setLayout(newLayout);
      onLayoutChange?.(newLayout);
      handleDragEnd();
    },
    [layout, onLayoutChange, handleDragEnd]
  );

  // ==========================================================================
  // Center Region Handlers
  // ==========================================================================

  const handleCenterDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setCenterDropRejected(true);
    },
    []
  );

  const handleCenterDragEnter = useCallback(() => {
    setCenterDropRejected(true);
  }, []);

  const handleCenterDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      onDropRejected?.();
      // Do NOT call onLayoutChange - center rejects drops
    },
    [onDropRejected]
  );

  const bothCollapsed = leftCollapsed && rightCollapsed;

  return (
    <div
      data-testid="docking-workspace"
      data-breakpoint={responsive ? breakpoint : undefined}
      className="docking-workspace"
    >
      {/* Minimum size warning overlay */}
      {responsive && isBelowMinimum && (
        <div
          data-testid="minimum-size-warning"
          className="minimum-size-warning"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            zIndex: 9999,
            padding: '20px',
            textAlign: 'center',
          }}
        >
          <div>
            <p>Window too small</p>
            <p>Minimum size: {MIN_DIMENSIONS.width}x{MIN_DIMENSIONS.height}</p>
          </div>
        </div>
      )}
      <Sidebar
        region="left"
        panels={layout.leftSidebar.panels}
        collapsed={leftCollapsed}
        width={layout.leftSidebar.width}
        activePanel={leftActivePanel}
        onPanelChange={setLeftActivePanel}
        onCollapseToggle={handleLeftCollapseToggle}
        isDropZoneActive={leftDropZoneActive}
        dropValidPosition={leftDropPosition}
        onDragStart={(e, panelId, index) => handleDragStart(e, panelId, index, 'left')}
        onDragEnd={handleDragEnd}
        onDragEnter={() => handleSidebarDragEnter('left')}
        onDragLeave={() => handleSidebarDragLeave('left')}
        onDragOver={(e) => handleSidebarDragOver(e, 'left')}
        onDrop={(e) => handleSidebarDrop(e, 'left')}
        onTabDragOver={(e, index) => handleTabDragOver(e, index, 'left')}
        onTabDrop={(e, index) => handleTabDrop(e, index, 'left')}
        draggingPanelId={draggingPanelId}
        responsiveCollapsed={leftResponsiveCollapsed}
      />

      <ResizeHandle
        position="left"
        currentWidth={layout.leftSidebar.width}
        onResizeStart={handleResizeStart}
        onResizeMove={handleLeftResizeMove}
        onResizeEnd={handleResizeEnd}
      />

      <div
        data-testid="center-region"
        data-region="center"
        data-drop-allowed="false"
        data-expanded={bothCollapsed ? 'true' : undefined}
        className={`center-region ${centerDropRejected ? 'drop-zone-rejected' : ''}`}
        onDragOver={handleCenterDragOver}
        onDragEnter={handleCenterDragEnter}
        onDrop={handleCenterDrop}
      >
        <div
          data-panel="message"
          role="tabpanel"
          className="panel panel-message"
        >
          {panelComponents[PANEL_INVENTORY.MESSAGE] ? (
            <ErrorBoundary panelName="Message">
              {React.createElement(panelComponents[PANEL_INVENTORY.MESSAGE])}
            </ErrorBoundary>
          ) : null}
        </div>
      </div>

      <ResizeHandle
        position="right"
        currentWidth={layout.rightSidebar.width}
        onResizeStart={handleResizeStart}
        onResizeMove={handleRightResizeMove}
        onResizeEnd={handleResizeEnd}
      />

      <Sidebar
        region="right"
        panels={layout.rightSidebar.panels}
        collapsed={rightCollapsed}
        width={layout.rightSidebar.width}
        activePanel={rightActivePanel}
        onPanelChange={setRightActivePanel}
        onCollapseToggle={handleRightCollapseToggle}
        isDropZoneActive={rightDropZoneActive}
        dropValidPosition={rightDropPosition}
        onDragStart={(e, panelId, index) => handleDragStart(e, panelId, index, 'right')}
        onDragEnd={handleDragEnd}
        onDragEnter={() => handleSidebarDragEnter('right')}
        onDragLeave={() => handleSidebarDragLeave('right')}
        onDragOver={(e) => handleSidebarDragOver(e, 'right')}
        onDrop={(e) => handleSidebarDrop(e, 'right')}
        onTabDragOver={(e, index) => handleTabDragOver(e, index, 'right')}
        onTabDrop={(e, index) => handleTabDrop(e, index, 'right')}
        draggingPanelId={draggingPanelId}
        responsiveCollapsed={rightResponsiveCollapsed}
      />
    </div>
  );
}

/**
 * ResponsiveDockingWorkspace - Pre-configured responsive wrapper
 */
export function ResponsiveDockingWorkspace(props: Omit<DockingWorkspaceProps, 'responsive'>) {
  return <DockingWorkspace {...props} responsive={true} />;
}

export default DockingWorkspace;
