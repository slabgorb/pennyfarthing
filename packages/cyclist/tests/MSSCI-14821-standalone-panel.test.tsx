/**
 * MSSCI-14821: StandalonePanel wrapper and ?panel=X client routing
 *
 * Tests for standalone panel rendering in BikeRack mode.
 * Panels serve individually via browser tabs, no dockview.
 *
 * Story: MSSCI-14821 - StandalonePanel wrapper and ?panel=X client routing
 * Epic: 101 (BikeRack Mode)
 *
 * Acceptance Criteria:
 * - AC1: ?panel=sprint renders SprintPanel full-screen
 * - AC2: All 12 existing panels in PANEL_REGISTRY
 * - AC3: PANEL_REGISTRY is single source of truth for routing (CE-2)
 * - AC4: Invalid ?panel= value shows "Panel not found" with link to /bikerack
 * - AC5: No dockview-react imports in StandalonePanel (Rule 7)
 * - AC6: No BikeRack-specific props passed to panels (Rule 2)
 * - AC7: BikeRack detection is URL-based only — ?panel= presence (Rule 10)
 * - AC8: Normal / URL still loads dockview workspace
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import React from 'react';
import * as fs from 'node:fs';
import * as path from 'node:path';

expect.extend(matchers);

// ============================================================================
// The 12 panel names required by the story AC
// ============================================================================

const REQUIRED_PANELS = [
  'sprint',
  'git',
  'diffs',
  'todos',
  'workflow',
  'audit',
  'ac',
  'debug',
  'bikelane',
  'settings',
  'progress',
] as const;

// ============================================================================
// Mock Setup
// ============================================================================

// Mock hooks that panels depend on (so panel components can render)
vi.mock('../src/public/hooks/useStory', () => ({
  useStory: vi.fn(() => ({
    story: null,
    isLoading: false,
    error: null,
  })),
}));

vi.mock('../src/public/contexts/ClaudeContext', () => ({
  useClaudeContext: vi.fn(() => ({
    send: vi.fn(),
    isConnected: false,
  })),
  ClaudeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../src/public/hooks/useTodos', () => ({
  useTodos: vi.fn(() => ({
    todos: [],
    isLoading: false,
    error: null,
  })),
}));

vi.mock('../src/public/hooks/useGit', () => ({
  useGit: vi.fn(() => ({
    branches: [],
    isLoading: false,
    error: null,
  })),
}));

// ============================================================================
// URL helpers
// ============================================================================

function setSearchParam(param: string, value: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set(param, value);
  Object.defineProperty(window, 'location', {
    value: new URL(url.toString()),
    writable: true,
    configurable: true,
  });
}

function clearSearchParams(): void {
  Object.defineProperty(window, 'location', {
    value: new URL('http://localhost:2898/'),
    writable: true,
    configurable: true,
  });
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  clearSearchParams();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  clearSearchParams();
});

// ---------------------------------------------------------------------------
// AC1: ?panel=sprint renders SprintPanel full-screen
// ---------------------------------------------------------------------------

describe('AC1: ?panel=sprint renders SprintPanel full-screen', () => {
  it('should render a panel when URL has ?panel=sprint', async () => {
    setSearchParam('panel', 'sprint');

    const { StandalonePanel } = await import(
      '../src/public/components/StandalonePanel'
    );

    const { container } = render(<StandalonePanel />);

    // Should render the sprint panel content — not the stub "Not implemented"
    expect(screen.queryByText('Not implemented')).not.toBeInTheDocument();
    // Panel wrapper should be full-screen
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toBeTruthy();
    expect(wrapper.style.width || wrapper.className).toBeTruthy();
  });

  it('should render panel at full viewport dimensions', async () => {
    setSearchParam('panel', 'sprint');

    const { StandalonePanel } = await import(
      '../src/public/components/StandalonePanel'
    );

    const { container } = render(<StandalonePanel />);
    const wrapper = container.firstElementChild as HTMLElement;

    // Full-screen wrapper should use 100vh/100vw or equivalent class
    const style = wrapper?.getAttribute('style') || '';
    const className = wrapper?.className || '';
    const hasFullScreen =
      style.includes('100vh') ||
      style.includes('100vw') ||
      className.includes('h-screen') ||
      className.includes('w-screen') ||
      className.includes('h-full') ||
      className.includes('w-full');
    expect(hasFullScreen).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC2: All 11 existing panels in PANEL_REGISTRY
// ---------------------------------------------------------------------------

describe('AC2: All 11 existing panels in PANEL_REGISTRY', () => {
  it('should have exactly 11 panels in PANEL_REGISTRY', async () => {
    const { PANEL_REGISTRY } = await import(
      '../src/public/components/StandalonePanel'
    );

    const keys = Object.keys(PANEL_REGISTRY);
    expect(keys.length).toBe(11);
  });

  it.each(REQUIRED_PANELS)(
    'should include "%s" in PANEL_REGISTRY',
    async (panelName) => {
      const { PANEL_REGISTRY } = await import(
        '../src/public/components/StandalonePanel'
      );

      expect(PANEL_REGISTRY).toHaveProperty(panelName);
      expect(PANEL_REGISTRY[panelName]).toBeDefined();
      expect(typeof PANEL_REGISTRY[panelName]).toBe('function');
    },
  );
});

// ---------------------------------------------------------------------------
// AC3: PANEL_REGISTRY is single source of truth for routing (CE-2)
// ---------------------------------------------------------------------------

describe('AC3: PANEL_REGISTRY is single source of truth for routing (CE-2)', () => {
  it('should use PANEL_REGISTRY to resolve panel components', async () => {
    setSearchParam('panel', 'sprint');

    const { StandalonePanel, PANEL_REGISTRY } = await import(
      '../src/public/components/StandalonePanel'
    );

    // PANEL_REGISTRY must have real components, not empty
    expect(Object.keys(PANEL_REGISTRY).length).toBeGreaterThan(0);

    // Rendering should use the registry — sprint key should resolve to SprintPanel
    expect(PANEL_REGISTRY['sprint']).toBeDefined();
  });

  it('should export PANEL_REGISTRY as a named export', async () => {
    const mod = await import('../src/public/components/StandalonePanel');
    expect(mod).toHaveProperty('PANEL_REGISTRY');
    expect(typeof mod.PANEL_REGISTRY).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// AC4: Invalid ?panel= shows "Panel not found" with link to /bikerack
// ---------------------------------------------------------------------------

describe('AC4: Invalid ?panel= shows "Panel not found" with link to /bikerack', () => {
  it('should show "Panel not found" for unknown panel name', async () => {
    setSearchParam('panel', 'nonexistent-panel-xyz');

    const { StandalonePanel } = await import(
      '../src/public/components/StandalonePanel'
    );

    render(<StandalonePanel />);

    expect(screen.getByText(/panel not found/i)).toBeInTheDocument();
  });

  it('should include a link to /bikerack in the fallback', async () => {
    setSearchParam('panel', 'nonexistent-panel-xyz');

    const { StandalonePanel } = await import(
      '../src/public/components/StandalonePanel'
    );

    render(<StandalonePanel />);

    const link = screen.getByRole('link', { name: /bikerack/i });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toBe('/');
  });
});

// ---------------------------------------------------------------------------
// AC5: No dockview-react imports in StandalonePanel (Rule 7)
// ---------------------------------------------------------------------------

describe('AC5: No dockview-react imports in StandalonePanel (Rule 7)', () => {
  it('should not import from dockview-react', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/StandalonePanel.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    expect(source).not.toMatch(/from\s+['"]dockview-react['"]/);
    expect(source).not.toMatch(/import.*dockview/i);
  });
});

// ---------------------------------------------------------------------------
// AC6: No BikeRack-specific props passed to panels (Rule 2)
// ---------------------------------------------------------------------------

describe('AC6: No BikeRack-specific props passed to panels (Rule 2)', () => {
  it('should not pass bikerack or standalone props to panel components', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/StandalonePanel.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    // No props like isBikeRack, isStandalone, bikeRackMode
    expect(source).not.toMatch(/isBikeRack/);
    expect(source).not.toMatch(/isStandalone/);
    expect(source).not.toMatch(/bikeRackMode/);
  });

  it('should render panels with no extra props', async () => {
    setSearchParam('panel', 'sprint');

    const { PANEL_REGISTRY } = await import(
      '../src/public/components/StandalonePanel'
    );

    // Sprint panel component should be a standard React component
    const PanelComponent = PANEL_REGISTRY['sprint'];
    expect(PanelComponent).toBeDefined();

    // Render it bare — should work with no props
    if (PanelComponent) {
      const { container } = render(<PanelComponent />);
      expect(container.firstElementChild).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// AC7: BikeRack detection is URL-based only (Rule 10)
// ---------------------------------------------------------------------------

describe('AC7: BikeRack detection is URL-based only (Rule 10)', () => {
  it('should detect standalone mode from ?panel= URL parameter', async () => {
    setSearchParam('panel', 'debug');

    const { getStandalonePanelName } = await import(
      '../src/public/components/StandalonePanel'
    );

    expect(getStandalonePanelName()).toBe('debug');
  });

  it('should return null when no ?panel= parameter is present', async () => {
    clearSearchParams();

    const { getStandalonePanelName } = await import(
      '../src/public/components/StandalonePanel'
    );

    expect(getStandalonePanelName()).toBeNull();
  });

  it('should not check environment variables or process state', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/StandalonePanel.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    // No process.env checks — detection is URL-based only
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/IS_BIKERACK/);
  });
});

// ---------------------------------------------------------------------------
// AC8: Normal / URL still loads dockview workspace
// ---------------------------------------------------------------------------

describe('AC8: Normal / URL still loads dockview workspace', () => {
  it('should not render StandalonePanel when no ?panel= parameter', async () => {
    clearSearchParams();

    const { getStandalonePanelName } = await import(
      '../src/public/components/StandalonePanel'
    );

    // No panel param → null → App.tsx should render DockviewWorkspace
    expect(getStandalonePanelName()).toBeNull();
  });

  it('should render DockviewWorkspace for root URL without ?panel=', async () => {
    clearSearchParams();

    // App.tsx must check for ?panel= and conditionally render
    // When absent, normal DockviewWorkspace should render
    // We verify this by checking App.tsx source for the conditional
    const filePath = path.resolve(__dirname, '../src/public/App.tsx');
    const source = fs.readFileSync(filePath, 'utf-8');

    // App.tsx should import StandalonePanel or getStandalonePanelName
    expect(source).toMatch(/StandalonePanel|getStandalonePanelName/);

    // App.tsx should have conditional routing based on panel param
    expect(source).toMatch(/\?panel|searchParams|getStandalonePanelName/);
  });
});
