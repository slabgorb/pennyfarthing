/**
 * 70-1: Docking System Foundation
 *
 * Tests for integrating Dockview as the flexible workspace layout system.
 * The message view is sacred (fixed center), with draggable sidebars.
 *
 * Written in RED phase - tests should fail until Dev implements functionality.
 *
 * Acceptance Criteria:
 * - AC1: Dockview integrated and rendering
 * - AC2: Message view fixed center - cannot be moved (sacred)
 * - AC3: Left sidebar with tabbed panels (Changed, Diffs, Debug)
 * - AC4: Right sidebar with tabbed panels (Sprint, Progress, Background, Git, Settings)
 * - AC5: Panels can be collapsed individually
 * - AC6: Docking system respects existing panel inventory
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement as h } from 'react';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Panel configuration for the docking system
 */
export interface PanelConfig {
  id: string;
  title: string;
  component: string;
  position: 'left' | 'center' | 'right';
  closable?: boolean;
  draggable?: boolean;
}

/**
 * Layout configuration for the workspace
 */
export interface WorkspaceLayoutConfig {
  leftSidebar: {
    panels: string[];
    width: number;
    collapsed: boolean;
  };
  center: {
    panels: string[];
    locked: boolean; // Sacred - cannot be moved
  };
  rightSidebar: {
    panels: string[];
    width: number;
    collapsed: boolean;
  };
}

/**
 * Panel inventory - all available panels in Cyclist
 */
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

/**
 * Default layout configuration
 */
export const DEFAULT_LAYOUT: WorkspaceLayoutConfig = {
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

// =============================================================================
// Tests
// =============================================================================

describe('70-1: Docking System Foundation', () => {

  // ===========================================================================
  // AC1: Dockview integrated and rendering
  // ===========================================================================
  describe('AC1: Dockview integrated and rendering', () => {

    it('should export DockingWorkspace component', async () => {
      const workspace = await import('../src/public/components/DockingWorkspace.js');
      expect(workspace.DockingWorkspace).toBeDefined();
    });

    it('should export createWorkspaceLayout function', async () => {
      const workspace = await import('../src/public/components/DockingWorkspace.js');
      expect(workspace.createWorkspaceLayout).toBeDefined();
      expect(typeof workspace.createWorkspaceLayout).toBe('function');
    });

    it('should have dockview as a dependency', async () => {
      const pkg = await import('../package.json');
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      expect(deps['dockview'] || deps['dockview-react']).toBeDefined();
    });

    it('should render dockview container element', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const dockviewContainer = container.querySelector('[data-testid="docking-workspace"]');
      expect(dockviewContainer).not.toBeNull();
    });

    it('should initialize with default layout configuration', async () => {
      const workspace = await import('../src/public/components/DockingWorkspace.js');

      const layout = workspace.createWorkspaceLayout();

      expect(layout).toBeDefined();
      expect(layout.leftSidebar).toBeDefined();
      expect(layout.center).toBeDefined();
      expect(layout.rightSidebar).toBeDefined();
    });

    it('should render three main regions (left, center, right)', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      expect(container.querySelector('[data-region="left"]')).not.toBeNull();
      expect(container.querySelector('[data-region="center"]')).not.toBeNull();
      expect(container.querySelector('[data-region="right"]')).not.toBeNull();
    });

  });

  // ===========================================================================
  // AC2: Message view fixed center - cannot be moved (sacred)
  // ===========================================================================
  describe('AC2: Message view fixed center (sacred)', () => {

    it('should render message view in center region', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const centerRegion = container.querySelector('[data-region="center"]');
      const messagePanel = centerRegion?.querySelector('[data-panel="message"]');
      expect(messagePanel).not.toBeNull();
    });

    it('should mark center panel as locked (not draggable)', async () => {
      const workspace = await import('../src/public/components/DockingWorkspace.js');

      const layout = workspace.createWorkspaceLayout();

      expect(layout.center.locked).toBe(true);
    });

    it('should not allow message panel to be closed', async () => {
      const workspace = await import('../src/public/components/DockingWorkspace.js');

      const panelConfig = workspace.getPanelConfig(PANEL_INVENTORY.MESSAGE);

      expect(panelConfig.closable).toBe(false);
    });

    it('should not allow message panel to be dragged', async () => {
      const workspace = await import('../src/public/components/DockingWorkspace.js');

      const panelConfig = workspace.getPanelConfig(PANEL_INVENTORY.MESSAGE);

      expect(panelConfig.draggable).toBe(false);
    });

    it('should reject drop events on center region', async () => {
      const { render, fireEvent } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const onDropRejected = vi.fn();
      const { container } = render(h(DockingWorkspace, { onDropRejected: onDropRejected }));

      const centerRegion = container.querySelector('[data-region="center"]');

      // Simulate drag over center
      fireEvent.dragOver(centerRegion!, {
        dataTransfer: { getData: () => 'panel:changed' }
      });

      // Center should indicate drop is not allowed
      expect(centerRegion?.getAttribute('data-drop-allowed')).toBe('false');
    });

    it('should maintain center panel position after sidebar changes', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container, rerender } = render(h(DockingWorkspace, { leftCollapsed: false }));

      const centerBefore = container.querySelector('[data-region="center"]');
      const initialPosition = centerBefore?.getBoundingClientRect();

      // Collapse left sidebar
      rerender(h(DockingWorkspace, { leftCollapsed: true }));

      // Center should still exist and be in center position
      const centerAfter = container.querySelector('[data-region="center"]');
      expect(centerAfter).not.toBeNull();
      expect(centerAfter?.querySelector('[data-panel="message"]')).not.toBeNull();
    });

  });

  // ===========================================================================
  // AC3: Left sidebar with tabbed panels (Changed, Diffs, Debug)
  // ===========================================================================
  describe('AC3: Left sidebar with tabbed panels', () => {

    it('should render left sidebar region', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const leftSidebar = container.querySelector('[data-region="left"]');
      expect(leftSidebar).not.toBeNull();
    });

    it('should render Changed panel in left sidebar', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const leftSidebar = container.querySelector('[data-region="left"]');
      const changedPanel = leftSidebar?.querySelector('[data-panel="changed"]');
      expect(changedPanel).not.toBeNull();
    });

    it('should render Diffs panel in left sidebar', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const leftSidebar = container.querySelector('[data-region="left"]');
      const diffsPanel = leftSidebar?.querySelector('[data-panel="diffs"]');
      expect(diffsPanel).not.toBeNull();
    });

    it('should render Debug panel in left sidebar', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const leftSidebar = container.querySelector('[data-region="left"]');
      const debugPanel = leftSidebar?.querySelector('[data-panel="debug"]');
      expect(debugPanel).not.toBeNull();
    });

    it('should render tabs for left sidebar panels', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const leftSidebar = container.querySelector('[data-region="left"]');
      const tabs = leftSidebar?.querySelectorAll('[role="tab"]');

      expect(tabs?.length).toBeGreaterThanOrEqual(3);
    });

    it('should have tab labels for Changed, Diffs, Debug', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const leftSidebar = container.querySelector('[data-region="left"]');
      const tabLabels = Array.from(leftSidebar?.querySelectorAll('[role="tab"]') || [])
        .map(tab => tab.textContent);

      expect(tabLabels).toContain('Changed');
      expect(tabLabels).toContain('Diffs');
      expect(tabLabels).toContain('Debug');
    });

    it('should show only active panel content (tabbed behavior)', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const leftSidebar = container.querySelector('[data-region="left"]');
      const visiblePanels = leftSidebar?.querySelectorAll('[data-panel]:not([hidden])');

      // Only one panel should be visible at a time (tabbed)
      expect(visiblePanels?.length).toBe(1);
    });

    it('should allow reordering tabs within left sidebar', async () => {
      const workspace = await import('../src/public/components/DockingWorkspace.js');

      const layout = workspace.createWorkspaceLayout();

      // Left sidebar panels should be draggable for reordering
      expect(layout.leftSidebar.panels).toContain(PANEL_INVENTORY.CHANGED);
      expect(layout.leftSidebar.panels).toContain(PANEL_INVENTORY.DIFFS);
      expect(layout.leftSidebar.panels).toContain(PANEL_INVENTORY.DEBUG);
    });

  });

  // ===========================================================================
  // AC4: Right sidebar with tabbed panels
  // ===========================================================================
  describe('AC4: Right sidebar with tabbed panels', () => {

    it('should render right sidebar region', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const rightSidebar = container.querySelector('[data-region="right"]');
      expect(rightSidebar).not.toBeNull();
    });

    it('should render Sprint panel in right sidebar', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const rightSidebar = container.querySelector('[data-region="right"]');
      const sprintPanel = rightSidebar?.querySelector('[data-panel="sprint"]');
      expect(sprintPanel).not.toBeNull();
    });

    it('should render Progress panel in right sidebar', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const rightSidebar = container.querySelector('[data-region="right"]');
      const progressPanel = rightSidebar?.querySelector('[data-panel="progress"]');
      expect(progressPanel).not.toBeNull();
    });

    it('should render Background panel in right sidebar', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const rightSidebar = container.querySelector('[data-region="right"]');
      const backgroundPanel = rightSidebar?.querySelector('[data-panel="background"]');
      expect(backgroundPanel).not.toBeNull();
    });

    it('should render Git panel in right sidebar', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const rightSidebar = container.querySelector('[data-region="right"]');
      const gitPanel = rightSidebar?.querySelector('[data-panel="git"]');
      expect(gitPanel).not.toBeNull();
    });

    it('should render Settings panel in right sidebar', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const rightSidebar = container.querySelector('[data-region="right"]');
      const settingsPanel = rightSidebar?.querySelector('[data-panel="settings"]');
      expect(settingsPanel).not.toBeNull();
    });

    it('should render tabs for all 5 right sidebar panels', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const rightSidebar = container.querySelector('[data-region="right"]');
      const tabs = rightSidebar?.querySelectorAll('[role="tab"]');

      expect(tabs?.length).toBeGreaterThanOrEqual(5);
    });

    it('should have tab labels for Sprint, Progress, Background, Git, Settings', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const rightSidebar = container.querySelector('[data-region="right"]');
      const tabLabels = Array.from(rightSidebar?.querySelectorAll('[role="tab"]') || [])
        .map(tab => tab.textContent);

      expect(tabLabels).toContain('Sprint');
      expect(tabLabels).toContain('Progress');
      expect(tabLabels).toContain('Background');
      expect(tabLabels).toContain('Git');
      expect(tabLabels).toContain('Settings');
    });

  });

  // ===========================================================================
  // AC5: Panels can be collapsed individually
  // ===========================================================================
  describe('AC5: Panels can be collapsed individually', () => {

    it('should export collapsePanel function', async () => {
      const workspace = await import('../src/public/components/DockingWorkspace.js');
      expect(workspace.collapsePanel).toBeDefined();
      expect(typeof workspace.collapsePanel).toBe('function');
    });

    it('should export expandPanel function', async () => {
      const workspace = await import('../src/public/components/DockingWorkspace.js');
      expect(workspace.expandPanel).toBeDefined();
      expect(typeof workspace.expandPanel).toBe('function');
    });

    it('should allow left sidebar to be collapsed', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container, rerender } = render(h(DockingWorkspace, { leftCollapsed: false }));

      let leftSidebar = container.querySelector('[data-region="left"]');
      expect(leftSidebar?.getAttribute('data-collapsed')).not.toBe('true');

      rerender(h(DockingWorkspace, { leftCollapsed: true }));

      leftSidebar = container.querySelector('[data-region="left"]');
      expect(leftSidebar?.getAttribute('data-collapsed')).toBe('true');
    });

    it('should allow right sidebar to be collapsed', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container, rerender } = render(h(DockingWorkspace, { rightCollapsed: false }));

      let rightSidebar = container.querySelector('[data-region="right"]');
      expect(rightSidebar?.getAttribute('data-collapsed')).not.toBe('true');

      rerender(h(DockingWorkspace, { rightCollapsed: true }));

      rightSidebar = container.querySelector('[data-region="right"]');
      expect(rightSidebar?.getAttribute('data-collapsed')).toBe('true');
    });

    it('should render collapse toggle button for left sidebar', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const leftToggle = container.querySelector('[data-testid="left-collapse-toggle"]');
      expect(leftToggle).not.toBeNull();
    });

    it('should render collapse toggle button for right sidebar', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const rightToggle = container.querySelector('[data-testid="right-collapse-toggle"]');
      expect(rightToggle).not.toBeNull();
    });

    it('should toggle left sidebar on collapse button click', async () => {
      const { render, fireEvent } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const onLeftCollapse = vi.fn();
      const { container } = render(
        h(DockingWorkspace, { onLeftCollapseChange: onLeftCollapse })
      );

      const leftToggle = container.querySelector('[data-testid="left-collapse-toggle"]');
      fireEvent.click(leftToggle!);

      expect(onLeftCollapse).toHaveBeenCalled();
    });

    it('should toggle right sidebar on collapse button click', async () => {
      const { render, fireEvent } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const onRightCollapse = vi.fn();
      const { container } = render(
        h(DockingWorkspace, { onRightCollapseChange: onRightCollapse })
      );

      const rightToggle = container.querySelector('[data-testid="right-collapse-toggle"]');
      fireEvent.click(rightToggle!);

      expect(onRightCollapse).toHaveBeenCalled();
    });

    it('should expand center to fill space when sidebars collapse', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(
        h(DockingWorkspace, { leftCollapsed: true, rightCollapsed: true })
      );

      const center = container.querySelector('[data-region="center"]');
      // Center should have flex-grow or similar to fill space
      expect(center?.getAttribute('data-expanded')).toBe('true');
    });

    it('should preserve panel content when collapsed', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container, rerender } = render(h(DockingWorkspace, { leftCollapsed: false }));

      // Panel exists when expanded
      let changedPanel = container.querySelector('[data-panel="changed"]');
      expect(changedPanel).not.toBeNull();

      // Collapse left sidebar
      rerender(h(DockingWorkspace, { leftCollapsed: true }));

      // Expand again
      rerender(h(DockingWorkspace, { leftCollapsed: false }));

      // Panel should still exist
      changedPanel = container.querySelector('[data-panel="changed"]');
      expect(changedPanel).not.toBeNull();
    });

  });

  // ===========================================================================
  // AC6: Docking system respects existing panel inventory
  // ===========================================================================
  describe('AC6: Docking system respects existing panel inventory', () => {

    it('should export PANEL_INVENTORY constant', async () => {
      const workspace = await import('../src/public/components/DockingWorkspace.js');
      expect(workspace.PANEL_INVENTORY).toBeDefined();
    });

    it('should have all 8 sidebar panels in inventory', async () => {
      const workspace = await import('../src/public/components/DockingWorkspace.js');
      const inventory = workspace.PANEL_INVENTORY;

      // Left sidebar
      expect(inventory.CHANGED).toBeDefined();
      expect(inventory.DIFFS).toBeDefined();
      expect(inventory.DEBUG).toBeDefined();

      // Right sidebar
      expect(inventory.SPRINT).toBeDefined();
      expect(inventory.PROGRESS).toBeDefined();
      expect(inventory.BACKGROUND).toBeDefined();
      expect(inventory.GIT).toBeDefined();
      expect(inventory.SETTINGS).toBeDefined();
    });

    it('should have MESSAGE panel in inventory (center)', async () => {
      const workspace = await import('../src/public/components/DockingWorkspace.js');
      expect(workspace.PANEL_INVENTORY.MESSAGE).toBeDefined();
    });

    it('should export getPanelConfig function', async () => {
      const workspace = await import('../src/public/components/DockingWorkspace.js');
      expect(workspace.getPanelConfig).toBeDefined();
      expect(typeof workspace.getPanelConfig).toBe('function');
    });

    it('should return valid config for each panel in inventory', async () => {
      const workspace = await import('../src/public/components/DockingWorkspace.js');
      const inventory = workspace.PANEL_INVENTORY;

      for (const panelId of Object.values(inventory)) {
        const config = workspace.getPanelConfig(panelId);
        expect(config).toBeDefined();
        expect(config.id).toBe(panelId);
        expect(config.title).toBeDefined();
        expect(typeof config.title).toBe('string');
      }
    });

    it('should map panels to correct default positions', async () => {
      const workspace = await import('../src/public/components/DockingWorkspace.js');

      // Left panels
      expect(workspace.getPanelConfig('changed').position).toBe('left');
      expect(workspace.getPanelConfig('diffs').position).toBe('left');
      expect(workspace.getPanelConfig('debug').position).toBe('left');

      // Center panel
      expect(workspace.getPanelConfig('message').position).toBe('center');

      // Right panels
      expect(workspace.getPanelConfig('sprint').position).toBe('right');
      expect(workspace.getPanelConfig('progress').position).toBe('right');
      expect(workspace.getPanelConfig('background').position).toBe('right');
      expect(workspace.getPanelConfig('git').position).toBe('right');
      expect(workspace.getPanelConfig('settings').position).toBe('right');
    });

    it('should export registerPanelComponent function for panel content', async () => {
      const workspace = await import('../src/public/components/DockingWorkspace.js');
      expect(workspace.registerPanelComponent).toBeDefined();
      expect(typeof workspace.registerPanelComponent).toBe('function');
    });

    it('should render registered panel components', async () => {
      const { render } = await import('@testing-library/react');
      const workspace = await import('../src/public/components/DockingWorkspace.js');

      // Register a test component
      const TestComponent = () => h('div', { 'data-testid': 'test-panel-content' }, 'Test');
      workspace.registerPanelComponent('changed', TestComponent);

      const { container } = render(h(workspace.DockingWorkspace));

      const panelContent = container.querySelector('[data-testid="test-panel-content"]');
      expect(panelContent).not.toBeNull();
    });

    it('should apply panel-specific CSS classes', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      // Each panel should have its ID as a class for styling
      expect(container.querySelector('.panel-changed')).not.toBeNull();
      expect(container.querySelector('.panel-diffs')).not.toBeNull();
      expect(container.querySelector('.panel-message')).not.toBeNull();
      expect(container.querySelector('.panel-sprint')).not.toBeNull();
    });

  });

  // ===========================================================================
  // Resize Handles (supporting AC5)
  // ===========================================================================
  describe('Resize Handles', () => {

    it('should render resize handle between left sidebar and center', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const leftHandle = container.querySelector('[data-testid="resize-handle-left"]');
      expect(leftHandle).not.toBeNull();
    });

    it('should render resize handle between center and right sidebar', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const rightHandle = container.querySelector('[data-testid="resize-handle-right"]');
      expect(rightHandle).not.toBeNull();
    });

    it('should have cursor style for resize handles', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const handle = container.querySelector('[data-testid="resize-handle-left"]');
      expect(handle?.classList.contains('cursor-col-resize') ||
             getComputedStyle(handle!).cursor === 'col-resize').toBe(true);
    });

  });

  // ===========================================================================
  // Accessibility
  // ===========================================================================
  describe('Accessibility', () => {

    it('should have proper ARIA roles for tabs', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const tablist = container.querySelector('[role="tablist"]');
      expect(tablist).not.toBeNull();

      const tabs = container.querySelectorAll('[role="tab"]');
      expect(tabs.length).toBeGreaterThan(0);
    });

    it('should have proper ARIA roles for tabpanels', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const tabpanels = container.querySelectorAll('[role="tabpanel"]');
      expect(tabpanels.length).toBeGreaterThan(0);
    });

    it('should have aria-selected on active tab', async () => {
      const { render } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const activeTab = container.querySelector('[role="tab"][aria-selected="true"]');
      expect(activeTab).not.toBeNull();
    });

    it('should have keyboard navigation for tabs', async () => {
      const { render, fireEvent } = await import('@testing-library/react');
      const { DockingWorkspace } = await import('../src/public/components/DockingWorkspace.js');

      const { container } = render(h(DockingWorkspace));

      const firstTab = container.querySelector('[role="tab"]') as HTMLElement;
      firstTab?.focus();

      // Arrow right should move to next tab
      fireEvent.keyDown(firstTab, { key: 'ArrowRight' });

      const activeTab = container.querySelector('[role="tab"][aria-selected="true"]');
      expect(activeTab).not.toBe(firstTab);
    });

  });

});
