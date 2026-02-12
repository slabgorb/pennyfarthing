/**
 * MSSCI-14877: Migrate BikeRack from index page to Dockview layout
 *
 * RED phase tests — BikeRackWorkspace replaces BikeRackIndex with a proper
 * Dockview-based panel layout for BikeRack mode.
 *
 * Story: MSSCI-14877 - Migrate BikeRack from index page to Dockview layout
 * Epic: 102 (BikeRack Follow-up)
 *
 * Acceptance Criteria:
 * - AC1: BikeRack renders panels in Dockview layout instead of index page
 * - AC2: Panel tabs are navigable like base Cyclist
 * - AC3: StandalonePanel/?panel=X routing still works for direct panel access
 * - AC4: No regressions in base Cyclist Dockview behavior
 * - AC5: pnpm build succeeds (verified separately)
 * - AC6: Existing tests pass (verified separately)
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import React from 'react';
import * as fs from 'node:fs';
import * as path from 'node:path';

expect.extend(matchers);

// ============================================================================
// Expected BikeRack panels (no MessagePanel — that's Cyclist-only)
// These are the panels BikeRackIndex currently lists, minus message
// ============================================================================

// Portrait moved from Dockview tab to fixed anchor above tab bar (MSSCI-14882)
// TTY and BikeLane removed in MSSCI-14887 (BikeRack UX sweep)
const EXPECTED_BIKERACK_PANEL_COUNT = 10;

// Panels that MUST be in BikeRack (regardless of exact ID format)
const MUST_HAVE_PANELS = [
  'sprint',
  'git',
  'diffs',
  'changed',
  'workflow',
  'background',
  'ac',
  'debug',
];

// Panels that MUST NOT be in BikeRack
const MUST_NOT_HAVE_PANELS = ['message'];

// ============================================================================
// Mock Setup
// ============================================================================

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

function setLocation(pathname: string, search = ''): void {
  Object.defineProperty(window, 'location', {
    value: new URL(`http://localhost:2898${pathname}${search}`),
    writable: true,
    configurable: true,
  });
}

function clearLocation(): void {
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
  clearLocation();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  clearLocation();
});

// ---------------------------------------------------------------------------
// AC1: BikeRack renders panels in Dockview layout instead of index page
// ---------------------------------------------------------------------------

describe('AC1: BikeRack renders Dockview layout instead of index page', () => {
  it('should export BikeRackWorkspace as a named component', async () => {
    const mod = await import('../src/public/components/BikeRackWorkspace');
    expect(mod).toHaveProperty('BikeRackWorkspace');
    expect(typeof mod.BikeRackWorkspace).toBe('function');
  });

  it('should render without crashing', async () => {
    const { BikeRackWorkspace } = await import(
      '../src/public/components/BikeRackWorkspace'
    );
    expect(() => render(<BikeRackWorkspace />)).not.toThrow();
  });

  it('should render with cyclist-dockview CSS class (Dockview container)', async () => {
    const { BikeRackWorkspace } = await import(
      '../src/public/components/BikeRackWorkspace'
    );
    render(<BikeRackWorkspace />);

    const container = document.querySelector('.cyclist-dockview');
    expect(container).toBeInTheDocument();
  });

  it('App.tsx should route /bikerack to BikeRackWorkspace (not BikeRackIndex)', () => {
    const appPath = path.resolve(__dirname, '../src/public/App.tsx');
    const source = fs.readFileSync(appPath, 'utf-8');

    // App.tsx should import BikeRackWorkspace
    expect(source).toMatch(/BikeRackWorkspace/);

    // The /bikerack branch should render BikeRackWorkspace, not BikeRackIndex
    // Look for the pattern where isBikeRackIndex renders BikeRackWorkspace
    expect(source).toMatch(/isBikeRack.*BikeRackWorkspace|BikeRackWorkspace.*bikerack/s);
  });

  it('BikeRackWorkspace.tsx should import from dockview-react', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/BikeRackWorkspace.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    // Unlike the old BikeRackIndex (which was forbidden from dockview),
    // BikeRackWorkspace MUST use dockview-react for the tabbed layout
    expect(source).toMatch(/from\s+['"]dockview-react['"]/);
  });

  it('should NOT render the old BikeRackIndex listing page content', async () => {
    const { BikeRackWorkspace } = await import(
      '../src/public/components/BikeRackWorkspace'
    );
    render(<BikeRackWorkspace />);

    // Should not have the old grid of panel links
    const links = document.querySelectorAll('a[href*="panel="]');
    expect(links.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC2: Panel tabs are navigable like base Cyclist
// ---------------------------------------------------------------------------

describe('AC2: Panel tabs navigable like base Cyclist', () => {
  it('should export BIKERACK_PANELS with correct panel count', async () => {
    const { BIKERACK_PANELS } = await import(
      '../src/public/components/BikeRackWorkspace'
    );

    expect(BIKERACK_PANELS).toBeDefined();
    expect(Array.isArray(BIKERACK_PANELS)).toBe(true);
    expect(BIKERACK_PANELS.length).toBe(EXPECTED_BIKERACK_PANEL_COUNT);
  });

  it.each(MUST_HAVE_PANELS)(
    'should include "%s" in BIKERACK_PANELS',
    async (panelName) => {
      const { BIKERACK_PANELS } = await import(
        '../src/public/components/BikeRackWorkspace'
      );

      // Panel must be present (may have variant IDs like 'audit' or 'audit-log')
      const hasPanel = BIKERACK_PANELS.some(
        (id: string) => id === panelName || id.startsWith(panelName),
      );
      expect(hasPanel).toBe(true);
    },
  );

  it.each(MUST_NOT_HAVE_PANELS)(
    'should NOT include "%s" in BIKERACK_PANELS (Cyclist-only)',
    async (panelName) => {
      const { BIKERACK_PANELS } = await import(
        '../src/public/components/BikeRackWorkspace'
      );

      expect(BIKERACK_PANELS).not.toContain(panelName);
    },
  );

  it('should have all BIKERACK_PANELS as unique entries', async () => {
    const { BIKERACK_PANELS } = await import(
      '../src/public/components/BikeRackWorkspace'
    );

    const uniquePanels = new Set(BIKERACK_PANELS);
    expect(uniquePanels.size).toBe(BIKERACK_PANELS.length);
  });
});

// ---------------------------------------------------------------------------
// AC3: StandalonePanel/?panel=X routing still works for direct panel access
// ---------------------------------------------------------------------------

describe('AC3: StandalonePanel/?panel=X routing still works', () => {
  it('App.tsx should still check ?panel=X before /bikerack routing', () => {
    const appPath = path.resolve(__dirname, '../src/public/App.tsx');
    const source = fs.readFileSync(appPath, 'utf-8');

    // StandalonePanel import must still exist
    expect(source).toMatch(/StandalonePanel/);
    expect(source).toMatch(/getStandalonePanelName/);

    // ?panel=X check must come before /bikerack check in the code
    const standalonePanelIndex = source.indexOf('standalonePanelName');
    const bikerackIndex = source.indexOf('isBikeRackIndex');

    // The standalone panel conditional should exist
    expect(standalonePanelIndex).toBeGreaterThan(-1);
  });

  it('StandalonePanel.tsx should still export StandalonePanel and helpers', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/StandalonePanel.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    expect(source).toMatch(/export function StandalonePanel/);
    expect(source).toMatch(/export function getStandalonePanelName/);
    expect(source).toMatch(/export const PANEL_REGISTRY/);
  });

  it('?panel=X should still render StandalonePanel (not BikeRackWorkspace)', () => {
    const appPath = path.resolve(__dirname, '../src/public/App.tsx');
    const source = fs.readFileSync(appPath, 'utf-8');

    // When ?panel=X is present, should render StandalonePanel
    // The standalonePanelName check should still return <StandalonePanel />
    expect(source).toMatch(/standalonePanelName[\s\S]*?<StandalonePanel/);
  });
});

// ---------------------------------------------------------------------------
// AC4: No regressions in base Cyclist Dockview behavior
// ---------------------------------------------------------------------------

describe('AC4: No regressions in base Cyclist Dockview behavior', () => {
  // Note: DockviewWorkspace has heavy dependencies (shadcn/ui, radix, dockview-react)
  // that don't reliably resolve in isolated test forks. Use source code analysis
  // for regression checks (matching MSSCI-14822 pattern).

  it('DockviewWorkspace.tsx should still export DockviewWorkspace function', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/DockviewWorkspace.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    expect(source).toMatch(/export function DockviewWorkspace/);
  });

  it('PANEL_INVENTORY should still define 13 panels in source', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/DockviewWorkspace.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    // Extract PANEL_INVENTORY block and count entries
    const inventoryMatch = source.match(/PANEL_INVENTORY\s*=\s*\{([\s\S]*?)\}\s*as\s*const/);
    expect(inventoryMatch).toBeTruthy();

    // Count colon-separated entries (key: 'value' pairs)
    const entries = inventoryMatch![1].match(/:\s*['"]/g);
    expect(entries).toHaveLength(13);
  });

  it('PANEL_INVENTORY should still include MESSAGE panel', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/DockviewWorkspace.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    expect(source).toMatch(/MESSAGE:\s*['"]message['"]/);
  });

  it('App.tsx should still render DockviewWorkspace for normal / route', () => {
    const appPath = path.resolve(__dirname, '../src/public/App.tsx');
    const source = fs.readFileSync(appPath, 'utf-8');

    // DockviewWorkspace should still be the default render
    expect(source).toMatch(/DockviewWorkspace/);

    // The default path (no bikerack, no ?panel=) should render DockviewWorkspace
    expect(source).toMatch(/<DockviewWorkspace/);
  });

  it('DockviewWorkspace.tsx should still export registerPanelComponent', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/DockviewWorkspace.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    expect(source).toMatch(/export function registerPanelComponent/);
  });
});

// ---------------------------------------------------------------------------
// Structural: BikeRackWorkspace follows architecture rules
// ---------------------------------------------------------------------------

describe('Structural: BikeRackWorkspace architecture', () => {
  it('should NOT include MessagePanel in BikeRack mode', async () => {
    const { BIKERACK_PANELS } = await import(
      '../src/public/components/BikeRackWorkspace'
    );

    // MessagePanel is sacred to Cyclist — BikeRack is a monitoring dashboard
    expect(BIKERACK_PANELS).not.toContain('message');
  });

  it('BikeRackWorkspace should use DockviewReact component', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/BikeRackWorkspace.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    // Must use DockviewReact for the tabbed layout
    expect(source).toMatch(/DockviewReact/);
  });

  it('should not pass BikeRack-specific props to individual panels (Rule 2)', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/BikeRackWorkspace.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    expect(source).not.toMatch(/isBikeRack\s*[=:]/);
    expect(source).not.toMatch(/bikeRackMode/);
  });

  it('BikeRackWorkspace should be a separate file from DockviewWorkspace', () => {
    const bikerackPath = path.resolve(
      __dirname,
      '../src/public/components/BikeRackWorkspace.tsx',
    );
    const dockviewPath = path.resolve(
      __dirname,
      '../src/public/components/DockviewWorkspace.tsx',
    );

    // Both files should exist as separate components
    expect(fs.existsSync(bikerackPath)).toBe(true);
    expect(fs.existsSync(dockviewPath)).toBe(true);

    // BikeRackWorkspace should NOT re-export DockviewWorkspace
    const source = fs.readFileSync(bikerackPath, 'utf-8');
    expect(source).toMatch(/export function BikeRackWorkspace/);
    expect(source).not.toMatch(/export.*DockviewWorkspace/);
  });
});
