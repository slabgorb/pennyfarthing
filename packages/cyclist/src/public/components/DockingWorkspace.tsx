/**
 * DockingWorkspace - Flexible docking layout system for Cyclist
 *
 * Story 70-1: Docking System Foundation
 *
 * Features:
 * - Three-region layout (left sidebar, center, right sidebar)
 * - Message view is sacred (fixed center, cannot be moved)
 * - Tabbed panels in sidebars
 * - Collapsible sidebars
 * - Resize handles between regions
 * - ARIA-compliant accessibility
 */

import React, { useState, useCallback, useRef, KeyboardEvent, ComponentType } from 'react';

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
// Tab Component
// =============================================================================

interface TabProps {
  panelId: string;
  title: string;
  isActive: boolean;
  onClick: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}

function Tab({ panelId, title, isActive, onClick, onKeyDown }: TabProps) {
  return (
    <button
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`tab ${isActive ? 'active' : ''}`}
    >
      {title}
    </button>
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
}

function Sidebar({
  region,
  panels,
  collapsed,
  activePanel,
  onPanelChange,
  onCollapseToggle,
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
      className={`sidebar sidebar-${region}`}
      style={{ width: collapsed ? 0 : 300 }}
    >
      <div role="tablist" className="tablist">
        {panels.map((panelId, index) => {
          const config = getPanelConfig(panelId);
          const isActive = panelId === activePanel;
          return (
            <button
              key={panelId}
              ref={(el) => { tabRefs.current[index] = el; }}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onPanelChange(panelId)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={`tab ${isActive ? 'active' : ''}`}
            >
              {config.title}
            </button>
          );
        })}
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
            {Component ? <Component /> : null}
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
// DockingWorkspace Component
// =============================================================================

export interface DockingWorkspaceProps {
  leftCollapsed?: boolean;
  rightCollapsed?: boolean;
  onLeftCollapseChange?: (collapsed: boolean) => void;
  onRightCollapseChange?: (collapsed: boolean) => void;
  onDropRejected?: () => void;
}

export function DockingWorkspace({
  leftCollapsed: leftCollapsedProp,
  rightCollapsed: rightCollapsedProp,
  onLeftCollapseChange,
  onRightCollapseChange,
  onDropRejected,
}: DockingWorkspaceProps) {
  const layout = createWorkspaceLayout();

  const [leftCollapsed, setLeftCollapsed] = useState(leftCollapsedProp ?? false);
  const [rightCollapsed, setRightCollapsed] = useState(rightCollapsedProp ?? false);
  const [leftActivePanel, setLeftActivePanel] = useState(layout.leftSidebar.panels[0]);
  const [rightActivePanel, setRightActivePanel] = useState(layout.rightSidebar.panels[0]);

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

  const handleCenterDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      // Reject drops on center
      onDropRejected?.();
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
      />

      <ResizeHandle position="left" />

      <div
        data-region="center"
        data-drop-allowed="false"
        data-expanded={bothCollapsed ? 'true' : undefined}
        className="center-region"
        onDragOver={handleCenterDragOver}
      >
        <div
          data-panel="message"
          role="tabpanel"
          className="panel panel-message"
        >
          {panelComponents[PANEL_INVENTORY.MESSAGE]
            ? React.createElement(panelComponents[PANEL_INVENTORY.MESSAGE])
            : null}
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
      />
    </div>
  );
}

export default DockingWorkspace;
