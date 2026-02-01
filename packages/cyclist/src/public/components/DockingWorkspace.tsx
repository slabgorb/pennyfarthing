/**
 * DockingWorkspace - Flexible docking layout system for Cyclist
 *
 * Story 70-1: Docking System Foundation
 * Story 70-2: Panel Drag-and-Drop (MSSCI-12705)
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
 */

import React, { useState, useCallback, useRef, KeyboardEvent, ComponentType, DragEvent } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

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
        PANEL_INVENTORY.PROGRESS,
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
}

function Sidebar({
  region,
  panels,
  collapsed,
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
      data-testid={`sidebar-${region}-dropzone`}
      data-drop-valid={isDropZoneActive ? 'true' : undefined}
      className={`sidebar sidebar-${region} ${isDropZoneActive ? 'drop-zone-active' : ''}`}
      style={{ width: collapsed ? 0 : 300 }}
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
}

function ResizeHandle({ position }: ResizeHandleProps) {
  return (
    <div
      data-testid={`resize-handle-${position}`}
      className="resize-handle cursor-col-resize"
      style={{ cursor: 'col-resize' }}
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
}

export function DockingWorkspace({
  initialLayout,
  leftCollapsed: leftCollapsedProp,
  rightCollapsed: rightCollapsedProp,
  onLeftCollapseChange,
  onRightCollapseChange,
  onDropRejected,
  onLayoutChange,
}: DockingWorkspaceProps) {
  const [layout, setLayout] = useState(() => initialLayout ?? createWorkspaceLayout());

  const [leftCollapsed, setLeftCollapsed] = useState(leftCollapsedProp ?? false);
  const [rightCollapsed, setRightCollapsed] = useState(rightCollapsedProp ?? false);
  const [leftActivePanel, setLeftActivePanel] = useState(layout.leftSidebar.panels[0]);
  const [rightActivePanel, setRightActivePanel] = useState(layout.rightSidebar.panels[0]);

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
  React.useEffect(() => {
    if (leftCollapsedProp !== undefined) {
      setLeftCollapsed(leftCollapsedProp);
    }
  }, [leftCollapsedProp]);

  React.useEffect(() => {
    if (rightCollapsedProp !== undefined) {
      setRightCollapsed(rightCollapsedProp);
    }
  }, [rightCollapsedProp]);

  const handleLeftCollapseToggle = useCallback(() => {
    const newValue = !leftCollapsed;
    setLeftCollapsed(newValue);
    onLeftCollapseChange?.(newValue);
  }, [leftCollapsed, onLeftCollapseChange]);

  const handleRightCollapseToggle = useCallback(() => {
    const newValue = !rightCollapsed;
    setRightCollapsed(newValue);
    onRightCollapseChange?.(newValue);
  }, [rightCollapsed, onRightCollapseChange]);

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
    <div data-testid="docking-workspace" className="docking-workspace">
      <Sidebar
        region="left"
        panels={layout.leftSidebar.panels}
        collapsed={leftCollapsed}
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
      />

      <ResizeHandle position="left" />

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

      <ResizeHandle position="right" />

      <Sidebar
        region="right"
        panels={layout.rightSidebar.panels}
        collapsed={rightCollapsed}
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
      />
    </div>
  );
}

export default DockingWorkspace;
