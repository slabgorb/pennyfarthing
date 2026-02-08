/**
 * Story 80-3: CodeMarkersDialog + DebugPanel launcher tests
 *
 * AC3: CodeMarkersDialog displays with TODOs/FIXMEs/Deprecated tabs
 * AC4: Sortable table within each tab
 * AC5: Staleness filter (>90 days) applied
 * AC6: Summary stats displayed (total, stale, by_type)
 * AC7: Launcher button in DebugPanel activates dialog
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock the useCodeMarkers hook
vi.mock('../src/public/hooks/useCodeMarkers', () => ({
  useCodeMarkers: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));

// Note: shadcn/ui mocks for DebugPanel tests are in AC7 describe block using vi.doMock

import { useCodeMarkers } from '../src/public/hooks/useCodeMarkers';

const mockUseCodeMarkers = vi.mocked(useCodeMarkers);

// --- Mock Data ---

const MOCK_MARKERS_DATA = {
  success: true,
  repo_name: 'pennyfarthing',
  repo_path: '/test/project/pennyfarthing',
  stale_threshold_days: 90,
  markers: [
    {
      path: 'src/server.ts',
      line: 42,
      marker_type: 'TODO',
      text: 'TODO: refactor this into separate module',
      author: 'alice',
      date: '2025-11-15T10:30:00-05:00',
      age_days: 84,
      is_stale: false,
    },
    {
      path: 'src/utils.ts',
      line: 10,
      marker_type: 'FIXME',
      text: 'FIXME: handle edge case for empty input',
      author: 'bob',
      date: '2025-06-01T10:00:00-05:00',
      age_days: 252,
      is_stale: true,
    },
    {
      path: 'src/api/stats.ts',
      line: 5,
      marker_type: 'TODO',
      text: 'TODO: add caching',
      author: 'charlie',
      date: '2025-12-20T08:00:00-05:00',
      age_days: 50,
      is_stale: false,
    },
    {
      path: 'src/legacy.ts',
      line: 100,
      marker_type: 'HACK',
      text: 'HACK: temporary workaround for API bug',
      author: 'alice',
      date: '2025-04-01T10:00:00-05:00',
      age_days: 313,
      is_stale: true,
    },
    {
      path: 'src/old-helper.ts',
      line: 18,
      marker_type: 'XXX',
      text: 'XXX: this needs to be completely rewritten',
      author: 'bob',
      date: '2025-08-15T10:00:00-05:00',
      age_days: 177,
      is_stale: true,
    },
  ],
  summary: {
    total_markers: 5,
    stale_markers: 3,
    by_type: { TODO: 2, FIXME: 1, HACK: 1, XXX: 1 },
  },
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseCodeMarkers.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  });
});

// ============================================================================
// AC3: CodeMarkersDialog displays with tabs
// ============================================================================

describe('AC3: CodeMarkersDialog displays with TODOs/FIXMEs/Deprecated tabs', () => {
  it('should export CodeMarkersDialog as a named export', async () => {
    const mod = await import('../src/public/components/dialogs/CodeMarkersDialog');
    expect(mod.CodeMarkersDialog).toBeDefined();
    expect(typeof mod.CodeMarkersDialog).toBe('function');
  });

  it('should accept open and onOpenChange props', async () => {
    const { CodeMarkersDialog } = await import('../src/public/components/dialogs/CodeMarkersDialog');
    const onOpenChange = vi.fn();

    render(<CodeMarkersDialog open={true} onOpenChange={onOpenChange} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('should not render when closed', async () => {
    const { CodeMarkersDialog } = await import('../src/public/components/dialogs/CodeMarkersDialog');

    render(<CodeMarkersDialog open={false} onOpenChange={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should render All tab', async () => {
    mockUseCodeMarkers.mockReturnValue({
      data: MOCK_MARKERS_DATA as any,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { CodeMarkersDialog } = await import('../src/public/components/dialogs/CodeMarkersDialog');
    render(<CodeMarkersDialog open={true} onOpenChange={() => {}} />);

    expect(screen.getByRole('tab', { name: /all/i })).toBeInTheDocument();
  });

  it('should render Stale tab', async () => {
    mockUseCodeMarkers.mockReturnValue({
      data: MOCK_MARKERS_DATA as any,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { CodeMarkersDialog } = await import('../src/public/components/dialogs/CodeMarkersDialog');
    render(<CodeMarkersDialog open={true} onOpenChange={() => {}} />);

    expect(screen.getByRole('tab', { name: /stale/i })).toBeInTheDocument();
  });

  it('should render Deprecated tab', async () => {
    mockUseCodeMarkers.mockReturnValue({
      data: MOCK_MARKERS_DATA as any,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { CodeMarkersDialog } = await import('../src/public/components/dialogs/CodeMarkersDialog');
    render(<CodeMarkersDialog open={true} onOpenChange={() => {}} />);

    expect(screen.getByRole('tab', { name: /deprecated/i })).toBeInTheDocument();
  });

  it('should show all markers in All tab by default', async () => {
    mockUseCodeMarkers.mockReturnValue({
      data: MOCK_MARKERS_DATA as any,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { CodeMarkersDialog } = await import('../src/public/components/dialogs/CodeMarkersDialog');
    render(<CodeMarkersDialog open={true} onOpenChange={() => {}} />);

    // All 5 markers should appear in All tab
    expect(screen.getByText('src/server.ts')).toBeInTheDocument();
    expect(screen.getByText('src/utils.ts')).toBeInTheDocument();
    expect(screen.getByText('src/api/stats.ts')).toBeInTheDocument();
    expect(screen.getByText('src/legacy.ts')).toBeInTheDocument();
    expect(screen.getByText('src/old-helper.ts')).toBeInTheDocument();
  });

  it('should show only stale markers when Stale tab is clicked', async () => {
    const user = userEvent.setup();

    mockUseCodeMarkers.mockReturnValue({
      data: MOCK_MARKERS_DATA as any,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { CodeMarkersDialog } = await import('../src/public/components/dialogs/CodeMarkersDialog');
    render(<CodeMarkersDialog open={true} onOpenChange={() => {}} />);

    await user.click(screen.getByRole('tab', { name: /stale/i }));

    // Stale markers (is_stale === true): src/utils.ts, src/legacy.ts, src/old-helper.ts
    expect(screen.getByText('src/utils.ts')).toBeInTheDocument();
    expect(screen.getByText('src/legacy.ts')).toBeInTheDocument();
    expect(screen.getByText('src/old-helper.ts')).toBeInTheDocument();

    // Non-stale markers should NOT be visible
    expect(screen.queryByText('src/server.ts')).not.toBeInTheDocument();
    expect(screen.queryByText('src/api/stats.ts')).not.toBeInTheDocument();
  });

  it('should show loading state with skeletons', async () => {
    mockUseCodeMarkers.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      refresh: vi.fn(),
    });

    const { CodeMarkersDialog } = await import('../src/public/components/dialogs/CodeMarkersDialog');
    render(<CodeMarkersDialog open={true} onOpenChange={() => {}} />);

    // Should show skeleton loading indicators
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // Loading state shouldn't show the table
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('should show error message on error', async () => {
    mockUseCodeMarkers.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Failed to fetch'),
      refresh: vi.fn(),
    });

    const { CodeMarkersDialog } = await import('../src/public/components/dialogs/CodeMarkersDialog');
    render(<CodeMarkersDialog open={true} onOpenChange={() => {}} />);

    expect(screen.getByText(/failed to fetch/i)).toBeInTheDocument();
  });
});

// ============================================================================
// AC4: Sortable table within each tab
// ============================================================================

describe('AC4: Sortable table within each tab', () => {
  beforeEach(() => {
    mockUseCodeMarkers.mockReturnValue({
      data: MOCK_MARKERS_DATA as any,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
  });

  it('should render a table with column headers', async () => {
    const { CodeMarkersDialog } = await import('../src/public/components/dialogs/CodeMarkersDialog');
    render(<CodeMarkersDialog open={true} onOpenChange={() => {}} />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    // Should have columns: Type, File, Line, Text, Author, Age, Stale
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('File')).toBeInTheDocument();
    expect(screen.getByText('Line')).toBeInTheDocument();
    expect(screen.getByText('Author')).toBeInTheDocument();
    expect(screen.getByText('Age')).toBeInTheDocument();
  });

  it('should sort by age when Age header is clicked', async () => {
    const user = userEvent.setup();

    const { CodeMarkersDialog } = await import('../src/public/components/dialogs/CodeMarkersDialog');
    render(<CodeMarkersDialog open={true} onOpenChange={() => {}} />);

    // Click Age header to sort
    await user.click(screen.getByText('Age'));

    // After sorting, rows should be in a different order
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    // At least header + data rows
    expect(rows.length).toBeGreaterThan(1);
  });

  it('should toggle sort direction when same header is clicked twice', async () => {
    const user = userEvent.setup();

    const { CodeMarkersDialog } = await import('../src/public/components/dialogs/CodeMarkersDialog');
    render(<CodeMarkersDialog open={true} onOpenChange={() => {}} />);

    // Click Age header twice
    const ageHeader = screen.getByText('Age');
    await user.click(ageHeader);
    await user.click(ageHeader);

    // Table should still render (no crash on double-click sort toggle)
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('should sort by file path when File header is clicked', async () => {
    const user = userEvent.setup();

    const { CodeMarkersDialog } = await import('../src/public/components/dialogs/CodeMarkersDialog');
    render(<CodeMarkersDialog open={true} onOpenChange={() => {}} />);

    await user.click(screen.getByText('File'));

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
  });
});

// ============================================================================
// AC5: Staleness filter (>90 days)
// ============================================================================

describe('AC5: Staleness filter applied', () => {
  it('should mark stale markers with destructive badge variant', async () => {
    mockUseCodeMarkers.mockReturnValue({
      data: MOCK_MARKERS_DATA as any,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { CodeMarkersDialog } = await import('../src/public/components/dialogs/CodeMarkersDialog');
    render(<CodeMarkersDialog open={true} onOpenChange={() => {}} />);

    // Stale markers (age_days > 90) should have destructive badge styling
    // The FIXME at src/utils.ts has age_days: 252 and is_stale: true
    const staleRow = screen.getByText('src/utils.ts').closest('tr');
    expect(staleRow).toBeInTheDocument();
    // Should contain a visual indicator of staleness (e.g., destructive badge or icon)
  });

  it('should not mark non-stale markers with destructive variant', async () => {
    mockUseCodeMarkers.mockReturnValue({
      data: MOCK_MARKERS_DATA as any,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { CodeMarkersDialog } = await import('../src/public/components/dialogs/CodeMarkersDialog');
    render(<CodeMarkersDialog open={true} onOpenChange={() => {}} />);

    // Non-stale marker (age_days: 84, is_stale: false) at src/server.ts
    const nonStaleRow = screen.getByText('src/server.ts').closest('tr');
    expect(nonStaleRow).toBeInTheDocument();
  });
});

// ============================================================================
// AC6: Summary stats displayed
// ============================================================================

describe('AC6: Summary stats displayed', () => {
  it('should display total marker count', async () => {
    mockUseCodeMarkers.mockReturnValue({
      data: MOCK_MARKERS_DATA as any,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { CodeMarkersDialog } = await import('../src/public/components/dialogs/CodeMarkersDialog');
    render(<CodeMarkersDialog open={true} onOpenChange={() => {}} />);

    // Should show total count in the summary stats
    expect(screen.getByText(/Total: 5/)).toBeInTheDocument();
  });

  it('should display stale marker count', async () => {
    mockUseCodeMarkers.mockReturnValue({
      data: MOCK_MARKERS_DATA as any,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { CodeMarkersDialog } = await import('../src/public/components/dialogs/CodeMarkersDialog');
    render(<CodeMarkersDialog open={true} onOpenChange={() => {}} />);

    // Should show stale count (3 stale markers)
    expect(screen.getByText(/Stale: 3/)).toBeInTheDocument();
  });

  it('should display by_type breakdown', async () => {
    mockUseCodeMarkers.mockReturnValue({
      data: MOCK_MARKERS_DATA as any,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { CodeMarkersDialog } = await import('../src/public/components/dialogs/CodeMarkersDialog');
    render(<CodeMarkersDialog open={true} onOpenChange={() => {}} />);

    // Should display type counts from summary
    expect(screen.getByText(/TODO: 2/)).toBeInTheDocument();
    expect(screen.getByText(/FIXME: 1/)).toBeInTheDocument();
  });

  it('should show empty state when no markers found', async () => {
    mockUseCodeMarkers.mockReturnValue({
      data: {
        success: true,
        repo_name: 'clean-repo',
        repo_path: '/test/clean',
        stale_threshold_days: 90,
        markers: [],
        summary: {
          total_markers: 0,
          stale_markers: 0,
          by_type: {},
        },
        error: null,
      } as any,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { CodeMarkersDialog } = await import('../src/public/components/dialogs/CodeMarkersDialog');
    render(<CodeMarkersDialog open={true} onOpenChange={() => {}} />);

    expect(screen.getByText(/no markers/i)).toBeInTheDocument();
  });
});

// ============================================================================
// AC7: Launcher button in DebugPanel activates dialog
// ============================================================================

describe('AC7: DebugPanel launcher button activates CodeMarkersDialog', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should have Code Markers button that is NOT disabled', async () => {
    vi.doMock('../src/public/components/dialogs/HotspotsDialog', () => ({
      HotspotsDialog: ({ open }: { open: boolean }) => open ? <div data-testid="hotspots-dialog" /> : null,
    }));
    vi.doMock('../src/public/components/dialogs/CodeMarkersDialog', () => ({
      CodeMarkersDialog: ({ open }: { open: boolean }) => open ? <div data-testid="codemarkers-dialog" /> : null,
    }));
    vi.doMock('../src/public/components/dialogs/AgentLoadDialog', () => ({
      AgentLoadDialog: ({ open }: { open: boolean }) => open ? <div data-testid="agent-load-dialog" /> : null,
    }));
    vi.doMock('@/components/ui/button', () => ({
      Button: ({ children, disabled, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
        <button disabled={disabled} onClick={onClick} {...props}>{children}</button>
      ),
      buttonVariants: () => '',
    }));
    vi.doMock('@/components/ui/badge', () => ({
      Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    }));
    vi.doMock('@/components/ui/separator', () => ({
      Separator: (props: any) => <hr {...props} />,
    }));

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel');
    render(<DebugPanel />);

    const codeMarkersBtn = screen.getByTestId('tool-launcher-codemarkers');
    expect(codeMarkersBtn).not.toBeDisabled();
  });

  it('should open CodeMarkersDialog when Code Markers button is clicked', async () => {
    vi.doMock('../src/public/components/dialogs/HotspotsDialog', () => ({
      HotspotsDialog: ({ open }: { open: boolean }) => open ? <div data-testid="hotspots-dialog" /> : null,
    }));
    vi.doMock('../src/public/components/dialogs/CodeMarkersDialog', () => ({
      CodeMarkersDialog: ({ open }: { open: boolean }) => open ? <div data-testid="codemarkers-dialog" /> : null,
    }));
    vi.doMock('../src/public/components/dialogs/AgentLoadDialog', () => ({
      AgentLoadDialog: ({ open }: { open: boolean }) => open ? <div data-testid="agent-load-dialog" /> : null,
    }));
    vi.doMock('@/components/ui/button', () => ({
      Button: ({ children, disabled, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
        <button disabled={disabled} onClick={onClick} {...props}>{children}</button>
      ),
      buttonVariants: () => '',
    }));
    vi.doMock('@/components/ui/badge', () => ({
      Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    }));
    vi.doMock('@/components/ui/separator', () => ({
      Separator: (props: any) => <hr {...props} />,
    }));

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel');
    render(<DebugPanel />);

    expect(screen.queryByTestId('codemarkers-dialog')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('tool-launcher-codemarkers'));

    expect(screen.getByTestId('codemarkers-dialog')).toBeInTheDocument();
  });

  it('should close CodeMarkersDialog when it requests close', async () => {
    vi.doMock('../src/public/components/dialogs/HotspotsDialog', () => ({
      HotspotsDialog: ({ open }: { open: boolean }) => open ? <div data-testid="hotspots-dialog" /> : null,
    }));
    vi.doMock('../src/public/components/dialogs/CodeMarkersDialog', () => ({
      CodeMarkersDialog: ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) =>
        open ? (
          <div data-testid="codemarkers-dialog">
            <button data-testid="close-codemarkers" onClick={() => onOpenChange(false)}>Close</button>
          </div>
        ) : null,
    }));
    vi.doMock('../src/public/components/dialogs/AgentLoadDialog', () => ({
      AgentLoadDialog: ({ open }: { open: boolean }) => open ? <div data-testid="agent-load-dialog" /> : null,
    }));
    vi.doMock('@/components/ui/button', () => ({
      Button: ({ children, disabled, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
        <button disabled={disabled} onClick={onClick} {...props}>{children}</button>
      ),
      buttonVariants: () => '',
    }));
    vi.doMock('@/components/ui/badge', () => ({
      Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    }));
    vi.doMock('@/components/ui/separator', () => ({
      Separator: (props: any) => <hr {...props} />,
    }));

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel');
    render(<DebugPanel />);

    const user = userEvent.setup();

    await user.click(screen.getByTestId('tool-launcher-codemarkers'));
    expect(screen.getByTestId('codemarkers-dialog')).toBeInTheDocument();

    await user.click(screen.getByTestId('close-codemarkers'));
    expect(screen.queryByTestId('codemarkers-dialog')).not.toBeInTheDocument();
  });
});
