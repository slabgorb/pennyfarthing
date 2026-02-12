/**
 * MSSCI-14882: BikeRack: anchor portrait panel above Dockview tab bar
 *
 * RED phase tests — Extract PortraitPanel from Dockview tabs and render it
 * as a fixed element above the tab bar in BikeRack, anchoring tabs open.
 *
 * Story: MSSCI-14882 - BikeRack: anchor portrait panel above Dockview tab bar
 * Epic: 102 (BikeRack Follow-up)
 *
 * Acceptance Criteria:
 * - AC1: Portrait component extracted from Cyclist message view and reused in BikeRack
 * - AC2: Portrait renders above the Dockview tab bar, not as a Dockview panel/tab
 * - AC3: Portrait anchors the tab bar open (tab bar cannot collapse while portrait is present)
 * - AC4: Portrait displays correctly (no layout/styling regressions)
 * - AC5: Existing Cyclist message view portrait continues to work unchanged
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
// Mock Setup
// ============================================================================

const mockPersona = {
  character: 'Leeloo',
  theme: 'fifth-element',
  role: 'Test Engineer/Architect',
  slug: 'leeloo',
  quote: 'Multipass!',
  tandemAgent: null,
};

vi.mock('../src/public/hooks/usePersona', () => ({
  usePersona: vi.fn(() => ({
    persona: mockPersona,
    isStreaming: false,
    isLoading: false,
    error: null,
  })),
}));

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
// Tests
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// AC1: Portrait component extracted and reused in BikeRack
// ---------------------------------------------------------------------------

describe('AC1: Portrait extracted from Dockview and reused in BikeRack', () => {
  it('should NOT include portrait in BIKERACK_PANELS (removed from Dockview tabs)', async () => {
    const { BIKERACK_PANELS } = await import(
      '../src/public/components/BikeRackWorkspace'
    );

    // Portrait must NOT be a Dockview panel/tab anymore
    expect(BIKERACK_PANELS).not.toContain('portrait');
  });

  it('should NOT include portrait in RIGHT_PANELS or LEFT_PANELS groups', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/BikeRackWorkspace.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    // Extract LEFT_PANELS and RIGHT_PANELS arrays
    const leftMatch = source.match(/LEFT_PANELS\s*=\s*\[([\s\S]*?)\]/);
    const rightMatch = source.match(/RIGHT_PANELS\s*=\s*\[([\s\S]*?)\]/);

    if (leftMatch) {
      expect(leftMatch[1]).not.toMatch(/['"]portrait['"]/);
    }
    if (rightMatch) {
      expect(rightMatch[1]).not.toMatch(/['"]portrait['"]/);
    }
  });

  it('should NOT include portrait in PANEL_TITLES mapping', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/BikeRackWorkspace.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    // PANEL_TITLES should not have a portrait entry
    const titlesMatch = source.match(/PANEL_TITLES[\s\S]*?=[\s\S]*?\{([\s\S]*?)\}/);
    expect(titlesMatch).toBeTruthy();
    expect(titlesMatch![1]).not.toMatch(/portrait/);
  });

  it('should import PortraitPanel in BikeRackWorkspace', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/BikeRackWorkspace.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    // BikeRackWorkspace should import PortraitPanel to render it outside Dockview
    expect(source).toMatch(/import.*PortraitPanel.*from/);
  });
});

// ---------------------------------------------------------------------------
// AC2: Portrait renders above the Dockview tab bar, not as a panel/tab
// ---------------------------------------------------------------------------

describe('AC2: Portrait renders above Dockview tab bar', () => {
  it('BikeRackWorkspace should render PortraitPanel outside DockviewReact', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/BikeRackWorkspace.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    // In the JSX return, PortraitPanel should appear BEFORE DockviewReact
    // Find the return/JSX block
    const jsxMatch = source.match(/return\s*\(([\s\S]*)\);\s*\}/);
    expect(jsxMatch).toBeTruthy();

    const jsx = jsxMatch![1];
    const portraitIndex = jsx.indexOf('PortraitPanel');
    const dockviewIndex = jsx.indexOf('DockviewReact');

    // PortraitPanel must exist in JSX and come before DockviewReact
    expect(portraitIndex).toBeGreaterThan(-1);
    expect(dockviewIndex).toBeGreaterThan(-1);
    expect(portraitIndex).toBeLessThan(dockviewIndex);
  });

  it('should render portrait with data-testid="bikerack-portrait-anchor"', async () => {
    const { BikeRackWorkspace } = await import(
      '../src/public/components/BikeRackWorkspace'
    );
    render(<BikeRackWorkspace />);

    const anchor = document.querySelector('[data-testid="bikerack-portrait-anchor"]');
    expect(anchor).toBeInTheDocument();
  });

  it('portrait anchor should be a sibling/ancestor of dockview container, not inside it', async () => {
    const { BikeRackWorkspace } = await import(
      '../src/public/components/BikeRackWorkspace'
    );
    render(<BikeRackWorkspace />);

    const anchor = document.querySelector('[data-testid="bikerack-portrait-anchor"]');
    const dockview = document.querySelector('.dockview-container');

    expect(anchor).toBeInTheDocument();
    expect(dockview).toBeInTheDocument();

    // Portrait anchor must NOT be a descendant of the dockview container
    expect(dockview!.contains(anchor)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC3: Portrait anchors the tab bar open
// ---------------------------------------------------------------------------

describe('AC3: Portrait anchors tab bar open', () => {
  it('BikeRackWorkspace should use a flex column layout (portrait on top, dockview below)', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/BikeRackWorkspace.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    // The outer container should use flex column to stack portrait above dockview
    // Look for flexDirection: 'column' or flex-col class in the container
    const hasFlexColumn = source.match(/flexDirection:\s*['"]column['"]/) ||
      source.match(/flex-col/) ||
      source.match(/display:\s*['"]flex['"][\s\S]*?flexDirection:\s*['"]column['"]/);

    expect(hasFlexColumn).toBeTruthy();
  });

  it('portrait anchor should have a fixed/non-collapsible height', async () => {
    const { BikeRackWorkspace } = await import(
      '../src/public/components/BikeRackWorkspace'
    );
    render(<BikeRackWorkspace />);

    const anchor = document.querySelector('[data-testid="bikerack-portrait-anchor"]');
    expect(anchor).toBeInTheDocument();

    // The anchor should have a style that prevents collapse
    // (flexShrink: 0 or minHeight set)
    const style = (anchor as HTMLElement)?.style;
    const hasNonCollapsible =
      style?.flexShrink === '0' ||
      style?.minHeight !== '' ||
      anchor?.className?.includes('shrink-0');

    expect(hasNonCollapsible).toBe(true);
  });

  it('dockview container should use flex: 1 to fill remaining space', async () => {
    const { BikeRackWorkspace } = await import(
      '../src/public/components/BikeRackWorkspace'
    );
    render(<BikeRackWorkspace />);

    const dockview = document.querySelector('.dockview-container');
    expect(dockview).toBeInTheDocument();

    // The dockview container (or its wrapper) should flex to fill remaining space
    const parent = dockview!.parentElement;
    const style = parent?.style;
    const hasFlex = style?.flex === '1' || style?.flexGrow === '1' ||
      parent?.className?.includes('flex-1');

    expect(hasFlex).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC4: Portrait displays correctly (no layout/styling regressions)
// ---------------------------------------------------------------------------

describe('AC4: Portrait displays correctly', () => {
  it('should render portrait image with correct src URL pattern', async () => {
    const { BikeRackWorkspace } = await import(
      '../src/public/components/BikeRackWorkspace'
    );
    render(<BikeRackWorkspace />);

    const anchor = document.querySelector('[data-testid="bikerack-portrait-anchor"]');
    expect(anchor).toBeInTheDocument();

    // Should contain a portrait image
    const img = anchor?.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img?.src).toMatch(/\/portraits\/.*\/medium\/.*\.png/);
  });

  it('should render agent character name in portrait anchor', async () => {
    const { BikeRackWorkspace } = await import(
      '../src/public/components/BikeRackWorkspace'
    );
    render(<BikeRackWorkspace />);

    const anchor = document.querySelector('[data-testid="bikerack-portrait-anchor"]');
    expect(anchor).toBeInTheDocument();
    expect(anchor!.textContent).toContain('Leeloo');
  });

  it('should show "No agent active" when persona is null', async () => {
    const { usePersona } = await import('../src/public/hooks/usePersona');
    (usePersona as ReturnType<typeof vi.fn>).mockReturnValue({
      persona: null,
      isStreaming: false,
      isLoading: false,
      error: null,
    });

    const { BikeRackWorkspace } = await import(
      '../src/public/components/BikeRackWorkspace'
    );
    render(<BikeRackWorkspace />);

    const anchor = document.querySelector('[data-testid="bikerack-portrait-anchor"]');
    expect(anchor).toBeInTheDocument();
    expect(anchor!.textContent).toMatch(/no agent/i);
  });
});

// ---------------------------------------------------------------------------
// AC5: Existing Cyclist message view portrait continues to work unchanged
// ---------------------------------------------------------------------------

describe('AC5: Existing Cyclist portrait unchanged', () => {
  it('PersonaHeader.tsx should still exist and export PersonaHeader', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/PersonaHeader.tsx',
    );
    expect(fs.existsSync(filePath)).toBe(true);

    const source = fs.readFileSync(filePath, 'utf-8');
    expect(source).toMatch(/export.*PersonaHeader/);
  });

  it('PersonaHeader should still use usePersona hook', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/PersonaHeader.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');
    expect(source).toMatch(/usePersona/);
  });

  it('DockviewWorkspace should NOT be modified (no portrait changes)', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/DockviewWorkspace.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    // DockviewWorkspace (base Cyclist) should NOT import or reference PortraitPanel
    expect(source).not.toMatch(/PortraitPanel/);
    expect(source).not.toMatch(/bikerack-portrait-anchor/);
  });

  it('PortraitPanel.tsx should still exist as a reusable component', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/panels/PortraitPanel.tsx',
    );
    expect(fs.existsSync(filePath)).toBe(true);

    const source = fs.readFileSync(filePath, 'utf-8');
    expect(source).toMatch(/export function PortraitPanel/);
  });
});

// ---------------------------------------------------------------------------
// Structural: Updated panel count and layout integrity
// ---------------------------------------------------------------------------

describe('Structural: BikeRack panel count updated', () => {
  it('BIKERACK_PANELS should have 12 entries (13 minus portrait)', async () => {
    const { BIKERACK_PANELS } = await import(
      '../src/public/components/BikeRackWorkspace'
    );

    // Was 13, now 12 since portrait is no longer a Dockview panel
    expect(BIKERACK_PANELS.length).toBe(12);
  });

  it('createBikeRackLayout should NOT include portrait in serialized panels', async () => {
    const { createBikeRackLayout } = await import(
      '../src/public/components/BikeRackWorkspace'
    );
    const layout = createBikeRackLayout() as { panels?: Record<string, unknown> };

    if (layout.panels) {
      expect(layout.panels).not.toHaveProperty('portrait');
    }
  });
});
