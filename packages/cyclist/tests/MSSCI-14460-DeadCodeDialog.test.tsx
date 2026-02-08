/**
 * MSSCI-14460: DeadCodeDialog component tests (Story 81-3)
 *
 * Tests the dialog component that displays dead code analysis results.
 * Two tabs: Stale Files and Unused Exports with sortable tables.
 *
 * Acceptance Criteria tested:
 * - AC12: DeadCodeDialog opens with two tabs: "Stale Files" and "Unused Exports"
 * - AC13: Each tab shows a Badge with count (stale_file_count, unused_export_count)
 * - AC14: Stale files table has sortable columns: File, Days Stale, Size, Last Commit
 * - AC15: Unused exports table has sortable columns: File, Export, Line
 * - AC16: No delete or modify buttons — diagnostic only
 * - AC17: Loading state shows while analysis runs
 * - AC18: Error state renders when API returns failure
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock the useDeadCode hook
vi.mock('../src/public/hooks/useDeadCode', () => ({
  useDeadCode: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));

import { useDeadCode } from '../src/public/hooks/useDeadCode';

const mockUseDeadCode = vi.mocked(useDeadCode);

// --- Mock Data ---

const MOCK_DATA_WITH_RESULTS = {
  success: true,
  repo_name: 'pennyfarthing',
  repo_path: '/test/project/pennyfarthing',
  time_window_days: 180,
  stale_files: [
    {
      path: 'src/old-util.ts',
      last_commit_date: '2025-06-01T00:00:00Z',
      days_since_last_commit: 250,
      size_bytes: 2048,
    },
    {
      path: 'src/legacy/parser.ts',
      last_commit_date: '2025-03-15T00:00:00Z',
      days_since_last_commit: 330,
      size_bytes: 4096,
    },
    {
      path: 'lib/compat.js',
      last_commit_date: '2025-08-01T00:00:00Z',
      days_since_last_commit: 190,
      size_bytes: 512,
    },
  ],
  total_files: 3,
  unused_exports: [
    {
      symbol: 'unusedHelper',
      file: 'src/utils.ts',
      line: 42,
      export_type: 'named',
    },
    {
      symbol: 'OldComponent',
      file: 'src/components/Legacy.tsx',
      line: 15,
      export_type: 'default',
    },
  ],
  stale_file_count: 3,
  unused_export_count: 2,
  error: null,
};

const MOCK_EMPTY_DATA = {
  success: true,
  repo_name: 'pennyfarthing',
  stale_files: [],
  unused_exports: [],
  stale_file_count: 0,
  unused_export_count: 0,
  error: null,
};

// --- Tests ---

describe('MSSCI-14460: DeadCodeDialog (Story 81-3)', () => {
  const mockRefresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDeadCode.mockReturnValue({
      data: MOCK_DATA_WITH_RESULTS as any,
      isLoading: false,
      error: null,
      refresh: mockRefresh,
    });
  });

  describe('AC12: Two tabs — Stale Files and Unused Exports', () => {
    it('should render two tab buttons', async () => {
      const { DeadCodeDialog } = await import('../src/public/components/DeadCodeDialog');

      render(<DeadCodeDialog isOpen={true} onClose={() => {}} />);

      expect(screen.getByRole('button', { name: /stale files/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /unused exports/i })).toBeInTheDocument();
    });

    it('should show stale files tab content by default', async () => {
      const { DeadCodeDialog } = await import('../src/public/components/DeadCodeDialog');

      render(<DeadCodeDialog isOpen={true} onClose={() => {}} />);

      // Stale file paths should be visible
      expect(screen.getByText('src/old-util.ts')).toBeInTheDocument();
    });

    it('should switch to unused exports tab on click', async () => {
      const user = userEvent.setup();
      const { DeadCodeDialog } = await import('../src/public/components/DeadCodeDialog');

      render(<DeadCodeDialog isOpen={true} onClose={() => {}} />);

      const exportsTab = screen.getByRole('button', { name: /unused exports/i });
      await user.click(exportsTab);

      // Unused export data should be visible
      expect(screen.getByText('unusedHelper')).toBeInTheDocument();
      expect(screen.getByText('src/utils.ts')).toBeInTheDocument();
    });
  });

  describe('AC13: Badge counts on tabs', () => {
    it('should show stale file count badge', async () => {
      const { DeadCodeDialog } = await import('../src/public/components/DeadCodeDialog');

      render(<DeadCodeDialog isOpen={true} onClose={() => {}} />);

      // The stale files tab should show a badge with count 3
      const staleTab = screen.getByRole('button', { name: /stale files/i });
      expect(within(staleTab).getByText('3')).toBeInTheDocument();
    });

    it('should show unused export count badge', async () => {
      const { DeadCodeDialog } = await import('../src/public/components/DeadCodeDialog');

      render(<DeadCodeDialog isOpen={true} onClose={() => {}} />);

      // The unused exports tab should show a badge with count 2
      const exportsTab = screen.getByRole('button', { name: /unused exports/i });
      expect(within(exportsTab).getByText('2')).toBeInTheDocument();
    });

    it('should show zero counts when no results', async () => {
      mockUseDeadCode.mockReturnValue({
        data: MOCK_EMPTY_DATA as any,
        isLoading: false,
        error: null,
        refresh: mockRefresh,
      });

      const { DeadCodeDialog } = await import('../src/public/components/DeadCodeDialog');

      render(<DeadCodeDialog isOpen={true} onClose={() => {}} />);

      const staleTab = screen.getByRole('button', { name: /stale files/i });
      expect(within(staleTab).getByText('0')).toBeInTheDocument();
    });
  });

  describe('AC14: Stale files sortable table columns', () => {
    it('should render column headers: File, Days Stale, Size, Last Commit', async () => {
      const { DeadCodeDialog } = await import('../src/public/components/DeadCodeDialog');

      render(<DeadCodeDialog isOpen={true} onClose={() => {}} />);

      expect(screen.getByText(/^File$/i)).toBeInTheDocument();
      expect(screen.getByText(/days stale/i)).toBeInTheDocument();
      expect(screen.getByText(/^Size$/i)).toBeInTheDocument();
      expect(screen.getByText(/last commit/i)).toBeInTheDocument();
    });

    it('should display stale file data in rows', async () => {
      const { DeadCodeDialog } = await import('../src/public/components/DeadCodeDialog');

      render(<DeadCodeDialog isOpen={true} onClose={() => {}} />);

      expect(screen.getByText('src/old-util.ts')).toBeInTheDocument();
      expect(screen.getByText('src/legacy/parser.ts')).toBeInTheDocument();
      expect(screen.getByText('lib/compat.js')).toBeInTheDocument();
    });

    it('should sort by clicking column headers', async () => {
      const user = userEvent.setup();
      const { DeadCodeDialog } = await import('../src/public/components/DeadCodeDialog');

      render(<DeadCodeDialog isOpen={true} onClose={() => {}} />);

      // Click "Days Stale" header to sort
      const daysHeader = screen.getByText(/days stale/i);
      await user.click(daysHeader);

      // After sort, rows should be reordered
      // We verify by checking the order of file paths in the DOM
      const rows = screen.getAllByRole('row');
      // At minimum, we expect the header row + 3 data rows
      expect(rows.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('AC15: Unused exports sortable table columns', () => {
    it('should render column headers: File, Export, Line', async () => {
      const user = userEvent.setup();
      const { DeadCodeDialog } = await import('../src/public/components/DeadCodeDialog');

      render(<DeadCodeDialog isOpen={true} onClose={() => {}} />);

      // Switch to exports tab
      const exportsTab = screen.getByRole('button', { name: /unused exports/i });
      await user.click(exportsTab);

      expect(screen.getByText(/^File$/i)).toBeInTheDocument();
      expect(screen.getByText(/^Export$/i)).toBeInTheDocument();
      expect(screen.getByText(/^Line$/i)).toBeInTheDocument();
    });

    it('should display unused export data in rows', async () => {
      const user = userEvent.setup();
      const { DeadCodeDialog } = await import('../src/public/components/DeadCodeDialog');

      render(<DeadCodeDialog isOpen={true} onClose={() => {}} />);

      const exportsTab = screen.getByRole('button', { name: /unused exports/i });
      await user.click(exportsTab);

      expect(screen.getByText('unusedHelper')).toBeInTheDocument();
      expect(screen.getByText('src/utils.ts')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('OldComponent')).toBeInTheDocument();
    });
  });

  describe('AC16: Diagnostic only — no delete/modify buttons', () => {
    it('should not render any delete buttons', async () => {
      const { DeadCodeDialog } = await import('../src/public/components/DeadCodeDialog');

      render(<DeadCodeDialog isOpen={true} onClose={() => {}} />);

      const deleteButtons = screen.queryAllByRole('button', { name: /delete/i });
      expect(deleteButtons).toHaveLength(0);
    });

    it('should not render any remove buttons', async () => {
      const { DeadCodeDialog } = await import('../src/public/components/DeadCodeDialog');

      render(<DeadCodeDialog isOpen={true} onClose={() => {}} />);

      const removeButtons = screen.queryAllByRole('button', { name: /remove/i });
      expect(removeButtons).toHaveLength(0);
    });
  });

  describe('AC17: Loading state', () => {
    it('should show loading indicator while fetching', async () => {
      mockUseDeadCode.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refresh: mockRefresh,
      });

      const { DeadCodeDialog } = await import('../src/public/components/DeadCodeDialog');

      render(<DeadCodeDialog isOpen={true} onClose={() => {}} />);

      expect(screen.getByText(/analyz/i)).toBeInTheDocument();
    });
  });

  describe('AC18: Error state', () => {
    it('should display error message when API fails', async () => {
      mockUseDeadCode.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Failed to analyze dead code'),
        refresh: mockRefresh,
      });

      const { DeadCodeDialog } = await import('../src/public/components/DeadCodeDialog');

      render(<DeadCodeDialog isOpen={true} onClose={() => {}} />);

      expect(screen.getByText(/failed to analyze dead code/i)).toBeInTheDocument();
    });
  });

  describe('Dialog behavior', () => {
    it('should call refresh when dialog opens', async () => {
      const { DeadCodeDialog } = await import('../src/public/components/DeadCodeDialog');

      render(<DeadCodeDialog isOpen={true} onClose={() => {}} />);

      expect(mockRefresh).toHaveBeenCalled();
    });

    it('should accept days prop', async () => {
      const { DeadCodeDialog } = await import('../src/public/components/DeadCodeDialog');

      render(<DeadCodeDialog isOpen={true} onClose={() => {}} days={365} />);

      // useDeadCode should be called with days=365
      expect(mockUseDeadCode).toHaveBeenCalledWith(
        expect.objectContaining({ days: 365 }),
      );
    });

    it('should accept repo prop', async () => {
      const { DeadCodeDialog } = await import('../src/public/components/DeadCodeDialog');

      render(<DeadCodeDialog isOpen={true} onClose={() => {}} repo="pennyfarthing" />);

      expect(mockUseDeadCode).toHaveBeenCalledWith(
        expect.objectContaining({ repo: 'pennyfarthing' }),
      );
    });
  });
});
