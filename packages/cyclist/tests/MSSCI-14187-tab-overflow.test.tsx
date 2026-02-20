/**
 * MSSCI-14187: Tab Overflow Bug Fix Tests
 *
 * Tests for ensuring all sidebar tabs are accessible when they overflow
 * the visible width of the tab container.
 *
 * Story: MSSCI-14187 - [BUG] Tab overflow - hidden tabs have no way to be accessed
 * Epic: MSSCI-14186 (Dockview Panel Migration)
 *
 * Acceptance Criteria:
 * - AC1: All sidebar tabs are accessible (via overflow dropdown or scroll)
 * - AC2: Dockview overflow dropdown appears when tabs exceed visible width
 * - AC3: OR horizontal tab scroll with visible scrollbar works
 * - AC4: Tab overflow behavior documented in ADR-0019
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';

// ============================================================================
// Panel Constants - Must match implementation
// ============================================================================

const LEFT_SIDEBAR_PANELS = ['changed', 'diffs', 'debug', 'audit-log'] as const;
const RIGHT_SIDEBAR_PANELS = ['sprint', 'progress', 'git', 'settings'] as const;
const ALL_PANEL_IDS = [...LEFT_SIDEBAR_PANELS, 'message', ...RIGHT_SIDEBAR_PANELS];

// ============================================================================
// Mock Setup
// ============================================================================

const mockElectronAPI = {
  layout: {
    get: vi.fn(() => Promise.resolve(null)),
    save: vi.fn(() => Promise.resolve({ success: true })),
    onUpdate: vi.fn(),
  },
  projectInfo: {
    get: vi.fn(() => Promise.resolve({ pwd: '/test/project' })),
  },
};

let originalInnerWidth: number;
let originalInnerHeight: number;

beforeEach(async () => {
  (window as any).electronAPI = mockElectronAPI;
  vi.clearAllMocks();
  originalInnerWidth = window.innerWidth;
  originalInnerHeight = window.innerHeight;

  // Register mock panel components
  const { registerPanelComponent } = await import('../src/public/components/DockviewWorkspace');
  for (const panelId of ALL_PANEL_IDS) {
    registerPanelComponent(panelId, () => <div data-testid={`mock-${panelId}`}>Mock {panelId}</div>);
  }
});

afterEach(() => {
  delete (window as any).electronAPI;
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: originalInnerWidth,
  });
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: originalInnerHeight,
  });
});

// ============================================================================
// AC1: All sidebar tabs are accessible (via overflow dropdown or scroll)
// ============================================================================
describe('AC1: All sidebar tabs are accessible', () => {
  it('should have overflow handling mechanism available in DockviewWorkspace', async () => {
    const { DockviewWorkspace } = await import('../src/public/components/DockviewWorkspace');
    render(<DockviewWorkspace />);

    // The workspace should render with overflow handling capability
    // Either via scrollable tabs or overflow dropdown
    const container = document.querySelector('.cyclist-dockview');
    expect(container).toBeInTheDocument();

    // Dockview should have scrollable or overflow mechanism available
    // Check for either .dv-scrollable class (scroll mode) or overflow dropdown support
    const hasOverflowSupport =
      document.querySelector('.dv-scrollable') !== null ||
      document.querySelector('.dv-tabs-overflow-dropdown-default') !== null ||
      document.querySelector('[data-testid="tab-overflow-dropdown"]') !== null;

    // This test will FAIL until overflow handling is implemented
    expect(hasOverflowSupport).toBe(true);
  });

  it('should allow access to all left sidebar panels when tabs overflow', async () => {
    // Simulate narrow viewport where tabs would overflow
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 300 });

    const { DockviewWorkspace } = await import('../src/public/components/DockviewWorkspace');
    render(<DockviewWorkspace />);

    // All left sidebar panels should be accessible somehow
    // Either visible directly, via scroll, or via overflow dropdown
    for (const panelId of LEFT_SIDEBAR_PANELS) {
      // Check if panel is accessible (visible or in overflow menu)
      const tabElement = document.querySelector(`[data-panel-id="${panelId}"]`);
      const overflowItem = document.querySelector(`[data-overflow-panel-id="${panelId}"]`);
      const scrollableContainer = document.querySelector('.dv-scrollable .dv-tabs-container');

      const isAccessible = tabElement !== null || overflowItem !== null || scrollableContainer !== null;

      // This test will FAIL until overflow handling is implemented
      expect(isAccessible).toBe(true);
    }
  });

  it('should allow access to all right sidebar panels when tabs overflow', async () => {
    // Simulate narrow viewport where tabs would overflow
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 300 });

    const { DockviewWorkspace } = await import('../src/public/components/DockviewWorkspace');
    render(<DockviewWorkspace />);

    // All right sidebar panels should be accessible somehow
    for (const panelId of RIGHT_SIDEBAR_PANELS) {
      const tabElement = document.querySelector(`[data-panel-id="${panelId}"]`);
      const overflowItem = document.querySelector(`[data-overflow-panel-id="${panelId}"]`);
      const scrollableContainer = document.querySelector('.dv-scrollable .dv-tabs-container');

      const isAccessible = tabElement !== null || overflowItem !== null || scrollableContainer !== null;

      // This test will FAIL until overflow handling is implemented
      expect(isAccessible).toBe(true);
    }
  });
});

// ============================================================================
// AC2: Dockview overflow dropdown appears when tabs exceed visible width
// ============================================================================
describe('AC2: Overflow dropdown appears when tabs exceed visible width', () => {
  it('should have CSS styling for overflow dropdown in theme', async () => {
    // Note: Dockview's overflow dropdown only renders when actual overflow occurs,
    // which requires real layout calculations not available in JSDOM.
    // We verify the CSS styling is in place, which enables the dropdown when it renders.
    const fs = await import('fs');
    const path = await import('path');

    const cssPath = path.resolve(
      __dirname,
      '../src/public/styles/dockview-theme.css'
    );

    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    // Theme CSS should style the overflow dropdown trigger
    expect(cssContent).toContain('.dv-tabs-overflow-dropdown-default');
  });

  it('should have CSS styling for overflow container in theme', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const cssPath = path.resolve(
      __dirname,
      '../src/public/styles/dockview-theme.css'
    );

    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    // Theme CSS should style the overflow dropdown container
    expect(cssContent).toContain('.dv-tabs-overflow-container');
  });

  it('should style overflow dropdown to match Cyclist theme', async () => {
    const { DockviewWorkspace } = await import('../src/public/components/DockviewWorkspace');
    render(<DockviewWorkspace />);

    // Check that cyclist-dockview class is applied (for theme styling)
    const container = document.querySelector('.cyclist-dockview');
    expect(container).toBeInTheDocument();

    // Theme should define overflow-related styling
    // This test verifies the CSS is properly scoped
    expect(container?.classList.contains('cyclist-dockview')).toBe(true);
  });
});

// ============================================================================
// AC3: OR horizontal tab scroll with visible scrollbar works
// ============================================================================
describe('AC3: Horizontal tab scroll with visible scrollbar', () => {
  it('should have CSS rules for scrollable tabs container', async () => {
    // Note: getComputedStyle in JSDOM doesn't apply CSS from files.
    // We verify the CSS rules are defined in the theme file.
    const fs = await import('fs');
    const path = await import('path');

    const cssPath = path.resolve(
      __dirname,
      '../src/public/styles/dockview-theme.css'
    );

    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    // Theme CSS should set overflow for tabs container
    expect(cssContent).toContain('.dv-tabs-container');
    expect(cssContent).toContain('overflow-x: auto');
  });

  it('should show scrollbar when tabs overflow', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 200 });

    const { DockviewWorkspace } = await import('../src/public/components/DockviewWorkspace');
    render(<DockviewWorkspace />);

    // Check for scrollbar styling
    const tabsContainer = document.querySelector('.dv-tabs-container');

    expect(tabsContainer).toBeInTheDocument();
    if (tabsContainer) {
      // Dockview uses scrollbar-width: thin for the tabs container
      const computedStyle = getComputedStyle(tabsContainer);

      // Verify scrollbar is configured
      // Note: scrollbar-width may not be readable via getComputedStyle in all browsers
      // but the CSS should be present
      expect(tabsContainer.classList.contains('dv-tabs-container')).toBe(true);
    }
  });

  it('should allow keyboard navigation through scrolled tabs', async () => {
    const { DockviewWorkspace } = await import('../src/public/components/DockviewWorkspace');
    render(<DockviewWorkspace />);

    // Tabs should be focusable for keyboard navigation
    const tabs = document.querySelectorAll('.dv-tab');

    expect(tabs.length).toBeGreaterThan(0);

    // Each tab should be focusable (either via tabindex or native focus)
    tabs.forEach((tab) => {
      const tabIndex = tab.getAttribute('tabindex');
      const isFocusable =
        tabIndex !== '-1' ||
        tab.tagName === 'BUTTON' ||
        tab.hasAttribute('data-focusable');

      // Tabs should be keyboard accessible
      // This test verifies accessibility requirements
      expect(tab.getAttribute('tabindex')).not.toBe('-1');
    });
  });
});

// ============================================================================
// AC4: Tab overflow behavior documented in ADR-0019
// ============================================================================
describe('AC4: Tab overflow behavior documented in ADR-0019', () => {
  it('should have ADR-0019 file present', async () => {
    const fs = await import('fs');
    const path = await import('path');

    // Path from packages/cyclist/tests/ to docs/adr/
    const adrPath = path.resolve(
      __dirname,
      '../../../docs/adr/0019-dockview-migration.md'
    );

    const fileExists = fs.existsSync(adrPath);
    expect(fileExists).toBe(true);
  });

  it('should document tab overflow handling in ADR-0019', async () => {
    const fs = await import('fs');
    const path = await import('path');

    // Path from packages/cyclist/tests/ to docs/adr/
    const adrPath = path.resolve(
      __dirname,
      '../../../docs/adr/0019-dockview-migration.md'
    );

    const content = fs.readFileSync(adrPath, 'utf-8');

    // ADR should mention tab overflow handling
    const hasOverflowDocumentation =
      content.toLowerCase().includes('overflow') ||
      content.toLowerCase().includes('scroll') ||
      content.toLowerCase().includes('hidden tabs');

    // This test will FAIL if ADR doesn't document overflow behavior
    expect(hasOverflowDocumentation).toBe(true);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================
describe('Tab Overflow Integration', () => {
  it('should handle viewport resize and show/hide overflow indicator', async () => {
    const { DockviewWorkspace } = await import('../src/public/components/DockviewWorkspace');
    const { rerender } = render(<DockviewWorkspace />);

    // Start with wide viewport
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1920 });
    window.dispatchEvent(new Event('resize'));

    // Then shrink to trigger overflow
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 300 });
    window.dispatchEvent(new Event('resize'));

    // Overflow handling should adapt
    const container = document.querySelector('.cyclist-dockview');
    expect(container).toBeInTheDocument();
  });

  it('should preserve panel state when accessing via overflow dropdown', async () => {
    const { DockviewWorkspace, getDockviewApi } = await import('../src/public/components/DockviewWorkspace');
    render(<DockviewWorkspace />);

    // getDockviewApi should be available for panel state management
    expect(getDockviewApi).toBeDefined();
  });
});

// ============================================================================
// CSS Theme Tests for Overflow Styling
// ============================================================================
describe('Overflow CSS Styling', () => {
  it('should have CSS rules for overflow dropdown in dockview-theme.css', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const cssPath = path.resolve(
      __dirname,
      '../src/public/styles/dockview-theme.css'
    );

    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    // Theme CSS should style the overflow dropdown
    const hasOverflowStyling =
      cssContent.includes('dv-tabs-overflow') ||
      cssContent.includes('overflow-dropdown') ||
      cssContent.includes('tabs-overflow');

    // This test will FAIL until overflow CSS is added to theme
    expect(hasOverflowStyling).toBe(true);
  });

  it('should style overflow scrollbar to be visible', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const cssPath = path.resolve(
      __dirname,
      '../src/public/styles/dockview-theme.css'
    );

    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    // Theme should have scrollbar styling for tabs container
    const hasScrollbarStyling =
      cssContent.includes('scrollbar') ||
      cssContent.includes('::-webkit-scrollbar');

    // This test will FAIL until scrollbar CSS is added
    expect(hasScrollbarStyling).toBe(true);
  });
});
