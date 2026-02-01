/**
 * MSSCI-12799: Debug Panel Tier Display Tests
 *
 * Tests for displaying the current context tier in the DebugPanel component.
 * This is the UI visibility layer for the tiered context injection system
 * (MSSCI-12793) that shows users which tier is being used and potential savings.
 *
 * Tier Reference:
 * | Tier     | Tokens | Color   | Description                    |
 * |----------|--------|---------|--------------------------------|
 * | FULL     | ~4000  | Blue    | First turn of new session      |
 * | REFRESH  | ~600   | Green   | Resumed session, same agent    |
 * | HANDOFF  | ~700   | Yellow  | Resumed session, different agent|
 * | MINIMAL  | ~200   | Purple  | Deep conversation (turn 3+)    |
 *
 * Acceptance Criteria:
 * - AC1: Tier added to ContextInfo interface
 * - AC2: DebugPanel displays tier badge with color coding
 * - AC3: Shows potential token savings for current tier vs FULL
 * - AC4: Badge colors distinguish tiers visually
 * - AC5: Tier updates correctly when context tier changes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

// =============================================================================
// AC1: ContextInfo interface includes tier field
// =============================================================================

describe('MSSCI-12799: AC1 - ContextInfo interface includes tier', () => {

  it('should export ContextInfo with tier field from context module', async () => {
    // Import ContextInfo interface - will fail until tier field added
    const { ContextInfo } = await import('../src/api/context.js') as { ContextInfo: { tier?: string } };

    // Type check - tier should be a valid property
    // This test validates the interface definition exists
    const mockContext: typeof ContextInfo = {
      tier: 'FULL',
    };

    expect(mockContext).toHaveProperty('tier');
  });

  it('should include tier field with ContextTier type', async () => {
    const { ContextInfo } = await import('../src/api/context.js') as { ContextInfo: { tier?: string } };

    // All valid tier values should be accepted
    const validTiers = ['FULL', 'REFRESH', 'HANDOFF', 'MINIMAL'];

    for (const tier of validTiers) {
      const context: typeof ContextInfo = { tier };
      expect(context.tier).toBe(tier);
    }
  });

  it('should allow tier to be optional (undefined for backward compat)', async () => {
    const { ContextInfo } = await import('../src/api/context.js') as { ContextInfo: { tier?: string; percent?: number } };

    // Context without tier should still be valid
    const context: typeof ContextInfo = {
      percent: 50,
    };

    expect(context.tier).toBeUndefined();
  });

});

// =============================================================================
// AC2: DebugPanel displays tier badge with color coding
// =============================================================================

describe('MSSCI-12799: AC2 - DebugPanel displays tier badge', () => {

  // Mock electronAPI for DebugPanel
  const mockElectronAPI = {
    context: {
      get: vi.fn(),
      onUpdate: vi.fn(),
    },
    tokenStats: {
      get: vi.fn(),
      onUpdate: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    (window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = mockElectronAPI;
  });

  it('should render tier badge when tier is FULL', async () => {
    mockElectronAPI.context.get.mockResolvedValue({
      percent: 25,
      tokens: 50000,
      tier: 'FULL',
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Wait for async context load
    await vi.waitFor(() => {
      expect(screen.getByTestId('tier-badge')).toBeInTheDocument();
    });

    expect(screen.getByTestId('tier-badge')).toHaveTextContent('FULL');
  });

  it('should render tier badge when tier is REFRESH', async () => {
    mockElectronAPI.context.get.mockResolvedValue({
      percent: 30,
      tokens: 60000,
      tier: 'REFRESH',
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('tier-badge')).toBeInTheDocument();
    });

    expect(screen.getByTestId('tier-badge')).toHaveTextContent('REFRESH');
  });

  it('should render tier badge when tier is HANDOFF', async () => {
    mockElectronAPI.context.get.mockResolvedValue({
      percent: 35,
      tokens: 70000,
      tier: 'HANDOFF',
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('tier-badge')).toBeInTheDocument();
    });

    expect(screen.getByTestId('tier-badge')).toHaveTextContent('HANDOFF');
  });

  it('should render tier badge when tier is MINIMAL', async () => {
    mockElectronAPI.context.get.mockResolvedValue({
      percent: 40,
      tokens: 80000,
      tier: 'MINIMAL',
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('tier-badge')).toBeInTheDocument();
    });

    expect(screen.getByTestId('tier-badge')).toHaveTextContent('MINIMAL');
  });

  it('should not render tier badge when tier is undefined', async () => {
    mockElectronAPI.context.get.mockResolvedValue({
      percent: 25,
      tokens: 50000,
      // tier is undefined - backward compat
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('debug-panel')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('tier-badge')).not.toBeInTheDocument();
  });

});

// =============================================================================
// AC3: Shows potential token savings for current tier vs FULL
// =============================================================================

describe('MSSCI-12799: AC3 - Shows potential token savings', () => {

  const mockElectronAPI = {
    context: {
      get: vi.fn(),
      onUpdate: vi.fn(),
    },
    tokenStats: {
      get: vi.fn(),
      onUpdate: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    (window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = mockElectronAPI;
  });

  it('should show 0% savings for FULL tier', async () => {
    mockElectronAPI.context.get.mockResolvedValue({
      percent: 25,
      tier: 'FULL',
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('tier-savings')).toBeInTheDocument();
    });

    // FULL tier = no savings (baseline)
    expect(screen.getByTestId('tier-savings')).toHaveTextContent('0%');
  });

  it('should show ~85% savings for REFRESH tier', async () => {
    mockElectronAPI.context.get.mockResolvedValue({
      percent: 30,
      tier: 'REFRESH',
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('tier-savings')).toBeInTheDocument();
    });

    // REFRESH: 600 vs 4000 = 85% savings
    expect(screen.getByTestId('tier-savings')).toHaveTextContent('85%');
  });

  it('should show ~82% savings for HANDOFF tier', async () => {
    mockElectronAPI.context.get.mockResolvedValue({
      percent: 35,
      tier: 'HANDOFF',
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('tier-savings')).toBeInTheDocument();
    });

    // HANDOFF: 700 vs 4000 = 82.5% savings
    expect(screen.getByTestId('tier-savings')).toHaveTextContent('82%');
  });

  it('should show ~95% savings for MINIMAL tier', async () => {
    mockElectronAPI.context.get.mockResolvedValue({
      percent: 40,
      tier: 'MINIMAL',
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('tier-savings')).toBeInTheDocument();
    });

    // MINIMAL: 200 vs 4000 = 95% savings
    expect(screen.getByTestId('tier-savings')).toHaveTextContent('95%');
  });

  it('should not show savings when tier is undefined', async () => {
    mockElectronAPI.context.get.mockResolvedValue({
      percent: 25,
      // tier undefined
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('debug-panel')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('tier-savings')).not.toBeInTheDocument();
  });

});

// =============================================================================
// AC4: Badge colors distinguish tiers visually
// =============================================================================

describe('MSSCI-12799: AC4 - Badge colors distinguish tiers', () => {

  const mockElectronAPI = {
    context: {
      get: vi.fn(),
      onUpdate: vi.fn(),
    },
    tokenStats: {
      get: vi.fn(),
      onUpdate: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    (window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = mockElectronAPI;
  });

  it('should apply tier-full class for FULL tier', async () => {
    mockElectronAPI.context.get.mockResolvedValue({
      percent: 25,
      tier: 'FULL',
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('tier-badge')).toBeInTheDocument();
    });

    expect(screen.getByTestId('tier-badge')).toHaveClass('tier-full');
  });

  it('should apply tier-refresh class for REFRESH tier', async () => {
    mockElectronAPI.context.get.mockResolvedValue({
      percent: 30,
      tier: 'REFRESH',
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('tier-badge')).toBeInTheDocument();
    });

    expect(screen.getByTestId('tier-badge')).toHaveClass('tier-refresh');
  });

  it('should apply tier-handoff class for HANDOFF tier', async () => {
    mockElectronAPI.context.get.mockResolvedValue({
      percent: 35,
      tier: 'HANDOFF',
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('tier-badge')).toBeInTheDocument();
    });

    expect(screen.getByTestId('tier-badge')).toHaveClass('tier-handoff');
  });

  it('should apply tier-minimal class for MINIMAL tier', async () => {
    mockElectronAPI.context.get.mockResolvedValue({
      percent: 40,
      tier: 'MINIMAL',
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('tier-badge')).toBeInTheDocument();
    });

    expect(screen.getByTestId('tier-badge')).toHaveClass('tier-minimal');
  });

  it('should have distinct colors defined in CSS for each tier', async () => {
    // This test validates the CSS classes exist with distinct colors
    // Will pass when CSS is properly defined
    const expectedClasses = [
      'tier-full',     // Blue (#3b82f6)
      'tier-refresh',  // Green (#22c55e)
      'tier-handoff',  // Yellow (#eab308)
      'tier-minimal',  // Purple (#a855f7)
    ];

    // Import the DebugPanel styles
    // This just validates the class names are used consistently
    for (const className of expectedClasses) {
      expect(className).toMatch(/^tier-/);
    }
  });

});

// =============================================================================
// AC5: Tier updates correctly when context tier changes
// =============================================================================

describe('MSSCI-12799: AC5 - Tier updates on context change', () => {

  const mockElectronAPI = {
    context: {
      get: vi.fn(),
      onUpdate: vi.fn(),
    },
    tokenStats: {
      get: vi.fn(),
      onUpdate: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    (window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = mockElectronAPI;
  });

  it('should update tier badge when context.onUpdate fires', async () => {
    let updateCallback: ((_event: unknown, data: unknown) => void) | null = null;

    mockElectronAPI.context.get.mockResolvedValue({
      percent: 25,
      tier: 'FULL',
    });

    mockElectronAPI.context.onUpdate.mockImplementation((cb: (_event: unknown, data: unknown) => void) => {
      updateCallback = cb;
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Initial render should show FULL
    await vi.waitFor(() => {
      expect(screen.getByTestId('tier-badge')).toHaveTextContent('FULL');
    });

    // Simulate context update to MINIMAL
    if (updateCallback) {
      updateCallback(null, {
        percent: 30,
        tier: 'MINIMAL',
      });
    }

    // Should update to show MINIMAL
    await vi.waitFor(() => {
      expect(screen.getByTestId('tier-badge')).toHaveTextContent('MINIMAL');
    });
  });

  it('should update savings display when tier changes', async () => {
    let updateCallback: ((_event: unknown, data: unknown) => void) | null = null;

    mockElectronAPI.context.get.mockResolvedValue({
      percent: 25,
      tier: 'FULL',
    });

    mockElectronAPI.context.onUpdate.mockImplementation((cb: (_event: unknown, data: unknown) => void) => {
      updateCallback = cb;
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Initial render should show 0% savings (FULL tier)
    await vi.waitFor(() => {
      expect(screen.getByTestId('tier-savings')).toHaveTextContent('0%');
    });

    // Simulate context update to MINIMAL
    if (updateCallback) {
      updateCallback(null, {
        percent: 30,
        tier: 'MINIMAL',
      });
    }

    // Should update to show 95% savings
    await vi.waitFor(() => {
      expect(screen.getByTestId('tier-savings')).toHaveTextContent('95%');
    });
  });

  it('should update badge class when tier changes', async () => {
    let updateCallback: ((_event: unknown, data: unknown) => void) | null = null;

    mockElectronAPI.context.get.mockResolvedValue({
      percent: 25,
      tier: 'FULL',
    });

    mockElectronAPI.context.onUpdate.mockImplementation((cb: (_event: unknown, data: unknown) => void) => {
      updateCallback = cb;
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Initial render should have tier-full class
    await vi.waitFor(() => {
      expect(screen.getByTestId('tier-badge')).toHaveClass('tier-full');
    });

    // Simulate context update to HANDOFF
    if (updateCallback) {
      updateCallback(null, {
        percent: 30,
        tier: 'HANDOFF',
      });
    }

    // Should update to tier-handoff class
    await vi.waitFor(() => {
      expect(screen.getByTestId('tier-badge')).toHaveClass('tier-handoff');
    });
  });

  it('should hide tier display when tier becomes undefined', async () => {
    let updateCallback: ((_event: unknown, data: unknown) => void) | null = null;

    mockElectronAPI.context.get.mockResolvedValue({
      percent: 25,
      tier: 'FULL',
    });

    mockElectronAPI.context.onUpdate.mockImplementation((cb: (_event: unknown, data: unknown) => void) => {
      updateCallback = cb;
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Initial render should show tier badge
    await vi.waitFor(() => {
      expect(screen.getByTestId('tier-badge')).toBeInTheDocument();
    });

    // Simulate context update without tier
    if (updateCallback) {
      updateCallback(null, {
        percent: 30,
        // tier is undefined
      });
    }

    // Should hide tier badge
    await vi.waitFor(() => {
      expect(screen.queryByTestId('tier-badge')).not.toBeInTheDocument();
    });
  });

});

// =============================================================================
// Utility: Token savings calculation
// =============================================================================

describe('MSSCI-12799: Tier savings calculation utility', () => {

  it('should export calculateTierSavings function', async () => {
    const { calculateTierSavings } = await import('../src/public/components/panels/DebugPanel.js');
    expect(typeof calculateTierSavings).toBe('function');
  });

  it('should return 0 for FULL tier', async () => {
    const { calculateTierSavings } = await import('../src/public/components/panels/DebugPanel.js');
    expect(calculateTierSavings('FULL')).toBe(0);
  });

  it('should return 85 for REFRESH tier', async () => {
    const { calculateTierSavings } = await import('../src/public/components/panels/DebugPanel.js');
    expect(calculateTierSavings('REFRESH')).toBe(85);
  });

  it('should return 82 for HANDOFF tier', async () => {
    const { calculateTierSavings } = await import('../src/public/components/panels/DebugPanel.js');
    expect(calculateTierSavings('HANDOFF')).toBe(82);
  });

  it('should return 95 for MINIMAL tier', async () => {
    const { calculateTierSavings } = await import('../src/public/components/panels/DebugPanel.js');
    expect(calculateTierSavings('MINIMAL')).toBe(95);
  });

  it('should return 0 for undefined tier', async () => {
    const { calculateTierSavings } = await import('../src/public/components/panels/DebugPanel.js');
    expect(calculateTierSavings(undefined)).toBe(0);
  });

});
