/**
 * MSSCI-14823: PortraitPanel with tandem support
 *
 * Tests for the PortraitPanel component that displays agent identity
 * (character, role, portrait image) with tandem backseat support.
 *
 * Story: MSSCI-14823 (101-4) - PortraitPanel with tandem support
 * Epic: 101 (BikeRack Mode)
 *
 * Acceptance Criteria:
 * - AC1: PortraitPanel uses existing usePersona() hook (CE-1)
 * - AC2: No new WebSocket connections or endpoints (CE-5, Rule 3)
 * - AC3: Displays character name, role, portrait image
 * - AC4: Shows tandem agent when active (tandemAgent data)
 * - AC5: Shows "No agent active" state when no persona data
 * - AC6: Portrait URL resolved via /portraits/{theme}/medium/{slug}.png
 * - AC7: Renders correctly in StandalonePanel wrapper via ?panel=portrait
 * - AC8: pnpm build succeeds (verified by CI, not tested here)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import React from 'react';

// ============================================================================
// Mock Setup
// ============================================================================

let personaWs: any = null;
const allWsConnections: string[] = [];

async function sendPersonaData(data: any) {
  await act(async () => {
    personaWs?.onmessage?.({ data: JSON.stringify(data) });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  personaWs = null;
  allWsConnections.length = 0;

  const OriginalMockWebSocket = (window as any).WebSocket;
  (window as any).WebSocket = class extends OriginalMockWebSocket {
    constructor(url: string) {
      super(url);
      allWsConnections.push(url);
      if (url.includes('/ws/persona')) {
        personaWs = this;
      }
    }
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ============================================================================
// Test Fixtures
// ============================================================================

const mockPersona = {
  character: 'Korben Dallas',
  theme: 'fifth-element',
  role: 'dev',
  slug: 'korben-dallas',
  quote: 'Negative, I am a meat popsicle.',
};

const mockPersonaWithTandem = {
  ...mockPersona,
  tandemAgent: {
    character: 'Vito Cornelius',
    role: 'architect',
    slug: 'vito-cornelius',
    theme: 'fifth-element',
    isThinking: false,
  },
};

// ============================================================================
// AC1: PortraitPanel uses existing usePersona() hook (CE-1)
// ============================================================================

describe('AC1: PortraitPanel uses existing usePersona() hook', () => {
  it('should import usePersona from the hooks directory', () => {
    const sourcePath = path.resolve(
      __dirname,
      '../src/public/components/panels/PortraitPanel.tsx'
    );
    const source = fs.readFileSync(sourcePath, 'utf-8');
    expect(source).toMatch(/import.*usePersona.*from.*hooks\/usePersona/);
  });

  it('should call usePersona() in the component body', () => {
    const sourcePath = path.resolve(
      __dirname,
      '../src/public/components/panels/PortraitPanel.tsx'
    );
    const source = fs.readFileSync(sourcePath, 'utf-8');
    expect(source).toMatch(/usePersona\(\)/);
  });
});

// ============================================================================
// AC2: No new WebSocket connections or endpoints (CE-5, Rule 3)
// ============================================================================

describe('AC2: No new WebSocket connections or endpoints', () => {
  it('should not contain new WebSocket() constructor calls in source', () => {
    const sourcePath = path.resolve(
      __dirname,
      '../src/public/components/panels/PortraitPanel.tsx'
    );
    const source = fs.readFileSync(sourcePath, 'utf-8');
    expect(source).not.toMatch(/new\s+WebSocket\s*\(/);
  });

  it('should only connect to /ws/persona (via usePersona hook)', async () => {
    const { PortraitPanel } = await import(
      '../src/public/components/panels/PortraitPanel'
    );
    render(<PortraitPanel />);

    // Wait for WebSocket connections to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Filter WS connections initiated by PortraitPanel render
    const personaConnections = allWsConnections.filter((url) =>
      url.includes('/ws/persona')
    );
    const nonPersonaConnections = allWsConnections.filter(
      (url) => !url.includes('/ws/persona') && !url.includes('/ws/context') && !url.includes('/ws/stats') && !url.includes('/ws/claude')
    );

    // Should have at least one persona connection (from usePersona)
    expect(personaConnections.length).toBeGreaterThanOrEqual(1);
    // Should have no unexpected new endpoints
    expect(nonPersonaConnections).toHaveLength(0);
  });
});

// ============================================================================
// AC3: Displays character name, role, portrait image
// ============================================================================

describe('AC3: Displays character name, role, portrait image', () => {
  it('should display the character name', async () => {
    const { PortraitPanel } = await import(
      '../src/public/components/panels/PortraitPanel'
    );
    render(<PortraitPanel />);

    await sendPersonaData(mockPersona);

    expect(screen.getByText('Korben Dallas')).toBeInTheDocument();
  });

  it('should display the agent role', async () => {
    const { PortraitPanel } = await import(
      '../src/public/components/panels/PortraitPanel'
    );
    render(<PortraitPanel />);

    await sendPersonaData(mockPersona);

    // Role should be visible (either as text or in a badge)
    expect(screen.getByText(/dev/i)).toBeInTheDocument();
  });

  it('should display a portrait image', async () => {
    const { PortraitPanel } = await import(
      '../src/public/components/panels/PortraitPanel'
    );
    render(<PortraitPanel />);

    await sendPersonaData(mockPersona);

    const img = screen.getByRole('img', { name: /korben dallas/i });
    expect(img).toBeInTheDocument();
  });
});

// ============================================================================
// AC4: Shows tandem agent when active (tandemAgent data)
// ============================================================================

describe('AC4: Shows tandem agent when active', () => {
  it('should display tandem agent character name', async () => {
    const { PortraitPanel } = await import(
      '../src/public/components/panels/PortraitPanel'
    );
    render(<PortraitPanel />);

    await sendPersonaData(mockPersonaWithTandem);

    expect(screen.getByText('Vito Cornelius')).toBeInTheDocument();
  });

  it('should display tandem agent role', async () => {
    const { PortraitPanel } = await import(
      '../src/public/components/panels/PortraitPanel'
    );
    render(<PortraitPanel />);

    await sendPersonaData(mockPersonaWithTandem);

    expect(screen.getByText(/architect/i)).toBeInTheDocument();
  });

  it('should display tandem agent portrait image', async () => {
    const { PortraitPanel } = await import(
      '../src/public/components/panels/PortraitPanel'
    );
    render(<PortraitPanel />);

    await sendPersonaData(mockPersonaWithTandem);

    const imgs = screen.getAllByRole('img');
    const tandemImg = imgs.find((img) =>
      img.getAttribute('src')?.includes('vito-cornelius')
    );
    expect(tandemImg).toBeDefined();
  });

  it('should not show tandem section when tandemAgent is absent', async () => {
    const { PortraitPanel } = await import(
      '../src/public/components/panels/PortraitPanel'
    );
    render(<PortraitPanel />);

    await sendPersonaData(mockPersona);

    expect(screen.queryByText('Vito Cornelius')).not.toBeInTheDocument();
  });
});

// ============================================================================
// AC5: Shows "No agent active" state when no persona data
// ============================================================================

describe('AC5: Shows "No agent active" state when no persona data', () => {
  it('should show empty state message when no persona data received', async () => {
    const { PortraitPanel } = await import(
      '../src/public/components/panels/PortraitPanel'
    );
    render(<PortraitPanel />);

    // Don't send any persona data — component should show empty state
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByText(/no agent active/i)).toBeInTheDocument();
  });

  it('should show empty state when persona is null', async () => {
    const { PortraitPanel } = await import(
      '../src/public/components/panels/PortraitPanel'
    );
    render(<PortraitPanel />);

    await sendPersonaData({
      character: null,
      theme: null,
      role: null,
      slug: null,
      quote: null,
    });

    expect(screen.getByText(/no agent active/i)).toBeInTheDocument();
  });
});

// ============================================================================
// AC6: Portrait URL resolved via /portraits/{theme}/medium/{slug}.png
// ============================================================================

describe('AC6: Portrait URL follows /portraits/{theme}/medium/{slug}.png', () => {
  it('should set primary portrait src to correct URL pattern', async () => {
    const { PortraitPanel } = await import(
      '../src/public/components/panels/PortraitPanel'
    );
    render(<PortraitPanel />);

    await sendPersonaData(mockPersona);

    const img = screen.getByRole('img', { name: /korben dallas/i });
    expect(img.getAttribute('src')).toBe(
      '/portraits/fifth-element/medium/korben-dallas.png'
    );
  });

  it('should set tandem portrait src to correct URL pattern', async () => {
    const { PortraitPanel } = await import(
      '../src/public/components/panels/PortraitPanel'
    );
    render(<PortraitPanel />);

    await sendPersonaData(mockPersonaWithTandem);

    const imgs = screen.getAllByRole('img');
    const tandemImg = imgs.find((img) =>
      img.getAttribute('src')?.includes('vito-cornelius')
    );
    expect(tandemImg?.getAttribute('src')).toBe(
      '/portraits/fifth-element/medium/vito-cornelius.png'
    );
  });
});

// ============================================================================
// AC7: Renders correctly in StandalonePanel wrapper via ?panel=portrait
// ============================================================================

describe('AC7: Renders in StandalonePanel via ?panel=portrait', () => {
  it('should be registered in PANEL_REGISTRY with key "portrait"', async () => {
    const { PANEL_REGISTRY } = await import(
      '../src/public/components/StandalonePanel'
    );
    expect(PANEL_REGISTRY).toHaveProperty('portrait');
  });

  it('should map to the PortraitPanel component in registry', async () => {
    const { PANEL_REGISTRY } = await import(
      '../src/public/components/StandalonePanel'
    );
    const { PortraitPanel } = await import(
      '../src/public/components/panels/PortraitPanel'
    );
    expect(PANEL_REGISTRY['portrait']).toBe(PortraitPanel);
  });

  it('should render PortraitPanel when ?panel=portrait is set', async () => {
    // Set URL parameter
    const url = new URL(window.location.href);
    url.searchParams.set('panel', 'portrait');
    Object.defineProperty(window, 'location', {
      value: new URL(url.toString()),
      writable: true,
      configurable: true,
    });

    const { StandalonePanel } = await import(
      '../src/public/components/StandalonePanel'
    );
    render(<StandalonePanel />);

    expect(screen.getByTestId('portrait-panel')).toBeInTheDocument();
  });
});

// ============================================================================
// Structural: No forbidden patterns (Rules 2, 3, 7)
// ============================================================================

describe('Structural: No forbidden patterns', () => {
  it('should not import from dockview-react (Rule 7)', () => {
    const sourcePath = path.resolve(
      __dirname,
      '../src/public/components/panels/PortraitPanel.tsx'
    );
    const source = fs.readFileSync(sourcePath, 'utf-8');
    expect(source).not.toMatch(/dockview/i);
  });

  it('should not accept BikeRack-specific props (Rule 2)', () => {
    const sourcePath = path.resolve(
      __dirname,
      '../src/public/components/panels/PortraitPanel.tsx'
    );
    const source = fs.readFileSync(sourcePath, 'utf-8');
    // Function should take no props
    expect(source).toMatch(/function PortraitPanel\(\)/);
  });

  it('should not directly access process.env (Rule 10)', () => {
    const sourcePath = path.resolve(
      __dirname,
      '../src/public/components/panels/PortraitPanel.tsx'
    );
    const source = fs.readFileSync(sourcePath, 'utf-8');
    expect(source).not.toMatch(/process\.env/);
  });

  it('should export PortraitPanel from panels/index.ts', () => {
    const indexPath = path.resolve(
      __dirname,
      '../src/public/components/panels/index.ts'
    );
    const source = fs.readFileSync(indexPath, 'utf-8');
    expect(source).toMatch(/export.*PortraitPanel.*from.*PortraitPanel/);
  });
});
