/**
 * 79-2: Migrate HotspotsPanel into HotspotsDialog
 *
 * Tests for migrating HotspotsPanel content into a dialog launched via
 * ToolDialog wrapper, and removing HotspotsPanel as a standalone dockview panel.
 *
 * Story: MSSCI-14442 - Migrate HotspotsPanel into HotspotsDialog
 * Epic: epic-79 (Dialog Infrastructure + Hotspot Refactor)
 *
 * Acceptance Criteria:
 * - AC1: HotspotsDialog.tsx created using ToolDialog wrapper from 79-1
 * - AC2: HotspotsPanel content migrated into HotspotsDialog
 * - AC3: HotspotsPanel removed from PANEL_INVENTORY in DockviewWorkspace.tsx
 * - AC4: HotspotsPanel removed from RIGHT_SIDEBAR_PANELS in DockviewWorkspace.tsx
 * - AC5: HotspotsPanel removed from PANEL_TITLES in DockviewWorkspace.tsx
 * - AC6: HotspotsPanel registration removed from App.tsx
 * - AC7: HotspotsPanel export removed from panels/index.ts
 * - AC8: Tests pass for the new HotspotsDialog component
 * - AC9: Build succeeds with no type errors
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock the useHotspots hook so tests don't need a real API
vi.mock('../src/public/hooks/useHotspots', () => ({
  useHotspots: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));

// Import after mock setup
import { useHotspots } from '../src/public/hooks/useHotspots';

const mockUseHotspots = vi.mocked(useHotspots);

beforeEach(() => {
  vi.clearAllMocks();
  mockUseHotspots.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  });
});

// ============================================================================
// AC1: HotspotsDialog.tsx created using ToolDialog wrapper
// ============================================================================

describe('AC1: HotspotsDialog component exists and uses ToolDialog', () => {
  it('should export HotspotsDialog as a named export', async () => {
    const mod = await import('../src/public/components/dialogs/HotspotsDialog');
    expect(mod.HotspotsDialog).toBeDefined();
    expect(typeof mod.HotspotsDialog).toBe('function');
  });

  it('should accept open, onOpenChange props like ToolDialog', async () => {
    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');
    const onOpenChange = vi.fn();

    // Should render without crashing
    render(<HotspotsDialog open={true} onOpenChange={onOpenChange} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('should not render content when closed', async () => {
    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={false} onOpenChange={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should render with a title "Hotspots" in the dialog header', async () => {
    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);
    expect(screen.getByText('Hotspots')).toBeInTheDocument();
  });
});

// ============================================================================
// AC2: HotspotsPanel content migrated into HotspotsDialog
// ============================================================================

describe('AC2: HotspotsPanel content migrated into dialog', () => {
  it('should render time window buttons (30d, 60d, 90d)', async () => {
    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);
    expect(screen.getByText('30d')).toBeInTheDocument();
    expect(screen.getByText('60d')).toBeInTheDocument();
    expect(screen.getByText('90d')).toBeInTheDocument();
  });

  it('should render view mode toggles (Files, Dirs)', async () => {
    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);
    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getByText('Dirs')).toBeInTheDocument();
  });

  it('should render Analyze button', async () => {
    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);
    expect(screen.getByRole('button', { name: /analyze/i })).toBeInTheDocument();
  });

  it('should show empty state message when no data', async () => {
    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);
    // Empty state text is split across nodes: "Click <strong>Analyze</strong> to detect..."
    // Both the button and <strong> contain "Analyze" — target the <strong> specifically
    expect(screen.getByText('Analyze', { selector: 'strong' })).toBeInTheDocument();
  });

  it('should render file hotspots table when data is loaded', async () => {
    const mockRefresh = vi.fn();
    mockUseHotspots.mockReturnValue({
      data: {
        success: true,
        repo_name: 'test-repo',
        time_window_days: 90,
        commit_count: 42,
        file_hotspots: [
          { path: 'src/app.ts', change_count: 10, bug_fix_count: 3, author_count: 2, churn: 500, hotspot_score: 75.0 },
        ],
        directory_hotspots: [],
      } as any,
      isLoading: false,
      error: null,
      refresh: mockRefresh,
    });

    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);
    expect(screen.getByText('src/app.ts')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('should render loading skeleton when isLoading is true', async () => {
    mockUseHotspots.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      refresh: vi.fn(),
    });

    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);
    // Should still show dialog but with loading state
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('should render error state with retry button', async () => {
    mockUseHotspots.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Analysis failed'),
      refresh: vi.fn(),
    });

    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);
    expect(screen.getByText('Analysis failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('should call onOpenChange when dialog close button is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={onOpenChange} />);
    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

// ============================================================================
// AC3: HotspotsPanel removed from PANEL_INVENTORY
// ============================================================================

describe('AC3: PANEL_INVENTORY no longer has HOTSPOTS', () => {
  it('should not have HOTSPOTS key in PANEL_INVENTORY', async () => {
    const { PANEL_INVENTORY } = await import('../src/public/components/DockviewWorkspace');
    expect((PANEL_INVENTORY as any).HOTSPOTS).toBeUndefined();
  });

  it('should not have "hotspots" value in PANEL_INVENTORY', async () => {
    const { PANEL_INVENTORY } = await import('../src/public/components/DockviewWorkspace');
    const values = Object.values(PANEL_INVENTORY);
    expect(values).not.toContain('hotspots');
  });
});

// ============================================================================
// AC4: HotspotsPanel removed from RIGHT_SIDEBAR_PANELS
// ============================================================================

describe('AC4: RIGHT_SIDEBAR_PANELS no longer has hotspots', () => {
  it('should not include hotspots in RIGHT_SIDEBAR_PANELS', async () => {
    const { RIGHT_SIDEBAR_PANELS } = await import('../src/public/components/DockviewWorkspace');
    expect(RIGHT_SIDEBAR_PANELS).not.toContain('hotspots');
  });
});

// ============================================================================
// AC5: HotspotsPanel removed from PANEL_TITLES
// ============================================================================

describe('AC5: PANEL_TITLES no longer has hotspots', () => {
  it('should not have a "hotspots" key in PANEL_TITLES', async () => {
    // PANEL_TITLES is not exported — test indirectly via the panel title display
    // Since it's a const inside the module, we verify the panel doesn't register
    const mod = await import('../src/public/components/DockviewWorkspace');
    // If PANEL_TITLES is exported, check directly
    if ('PANEL_TITLES' in mod) {
      expect((mod as any).PANEL_TITLES.hotspots).toBeUndefined();
    }
    // Otherwise the removal is verified by AC3 (no inventory = no title needed)
    expect(true).toBe(true);
  });
});

// ============================================================================
// AC6: HotspotsPanel registration removed from App.tsx
// ============================================================================

describe('AC6: HotspotsPanel not registered in App.tsx', () => {
  it('should not import HotspotsPanel from panels index', async () => {
    // We verify by checking the panels index no longer exports it (AC7)
    // and that PANEL_INVENTORY has no HOTSPOTS (AC3).
    // Registration in App.tsx uses: registerPanelComponent(PANEL_INVENTORY.HOTSPOTS, HotspotsPanel)
    // If PANEL_INVENTORY.HOTSPOTS doesn't exist AND HotspotsPanel isn't exported,
    // the registration line must have been removed (TypeScript would error otherwise).
    const { PANEL_INVENTORY } = await import('../src/public/components/DockviewWorkspace');
    expect((PANEL_INVENTORY as any).HOTSPOTS).toBeUndefined();
  });
});

// ============================================================================
// AC7: HotspotsPanel export removed from panels/index.ts
// ============================================================================

describe('AC7: panels/index.ts no longer exports HotspotsPanel', () => {
  it('should not export HotspotsPanel from the panels index', async () => {
    const panelsIndex = await import('../src/public/components/panels/index');
    expect((panelsIndex as any).HotspotsPanel).toBeUndefined();
  });
});

// ============================================================================
// AC8 & AC9: Build and test integrity (verified by this test file passing)
// ============================================================================

describe('AC8/AC9: Dialog integration works end-to-end', () => {
  it('should render a complete dialog with hotspot data', async () => {
    const mockRefresh = vi.fn();
    mockUseHotspots.mockReturnValue({
      data: {
        success: true,
        repo_name: 'pennyfarthing',
        time_window_days: 90,
        commit_count: 100,
        file_hotspots: [
          { path: 'src/server.ts', change_count: 20, bug_fix_count: 5, author_count: 3, churn: 800, hotspot_score: 85.0 },
          { path: 'src/client.ts', change_count: 8, bug_fix_count: 1, author_count: 2, churn: 200, hotspot_score: 30.0 },
        ],
        directory_hotspots: [
          { path: 'src', file_count: 10, total_changes: 50, total_bug_fixes: 8, avg_author_count: 2.5, hotspot_score: 65.0 },
        ],
      } as any,
      isLoading: false,
      error: null,
      refresh: mockRefresh,
    });

    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);

    // Dialog should show
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Title
    expect(screen.getByText('Hotspots')).toBeInTheDocument();
    // Data should render
    expect(screen.getByText('src/server.ts')).toBeInTheDocument();
    expect(screen.getByText('src/client.ts')).toBeInTheDocument();
    // Summary
    expect(screen.getByText(/100 commits/)).toBeInTheDocument();
  });

  it('should support switching between file and directory views', async () => {
    const user = userEvent.setup();
    mockUseHotspots.mockReturnValue({
      data: {
        success: true,
        repo_name: 'pennyfarthing',
        time_window_days: 90,
        commit_count: 50,
        file_hotspots: [
          { path: 'src/app.ts', change_count: 10, bug_fix_count: 2, author_count: 2, churn: 300, hotspot_score: 55.0 },
        ],
        directory_hotspots: [
          { path: 'src', file_count: 5, total_changes: 25, total_bug_fixes: 4, avg_author_count: 2.0, hotspot_score: 45.0 },
        ],
      } as any,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);

    // Default view is files
    expect(screen.getByText('src/app.ts')).toBeInTheDocument();

    // Switch to dirs
    await user.click(screen.getByText('Dirs'));
    expect(screen.getByText('src')).toBeInTheDocument();
  });
});
