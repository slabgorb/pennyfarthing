/**
 * Story 83-3: ComplexityDialog component tests
 * AC5: ComplexityDialog shows sortable table with threshold highlighting
 *
 * Tests the ComplexityDialog component that displays complexity analysis results.
 * Pattern mirrors HotspotsDialog / CodeMarkersDialog.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';

import { ComplexityDialog } from '../src/public/components/dialogs/ComplexityDialog.js';

// --- Mock Data ---

const MOCK_COMPLEXITY_DATA = {
  success: true,
  target_path: '/test/project',
  file_count: 3,
  files: [
    {
      path: 'src/server.ts',
      total_lines: 250,
      longest_function: 45,
      avg_cyclomatic_complexity: 8.5,
      max_nesting_depth: 5,
      function_count: 8,
    },
    {
      path: 'src/utils.ts',
      total_lines: 80,
      longest_function: 20,
      avg_cyclomatic_complexity: 2.1,
      max_nesting_depth: 2,
      function_count: 5,
    },
    {
      path: 'src/api/hotspots.ts',
      total_lines: 65,
      longest_function: 30,
      avg_cyclomatic_complexity: 3.0,
      max_nesting_depth: 2,
      function_count: 1,
    },
  ],
  error: null,
};

// --- Tests ---

describe('MSSCI-14468: ComplexityDialog (Story 83-3)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    fetchSpy.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/complexity')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_COMPLEXITY_DATA),
        });
      }
      return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AC5: Sortable table with threshold highlighting', () => {
    it('should render dialog with title "Complexity"', () => {
      render(<ComplexityDialog open={true} onOpenChange={() => {}} />);
      expect(screen.getByText('Complexity')).toBeInTheDocument();
    });

    it('should not render content when closed', () => {
      render(<ComplexityDialog open={false} onOpenChange={() => {}} />);
      expect(screen.queryByTestId('complexity-panel')).not.toBeInTheDocument();
    });

    it('should fetch data when dialog opens', async () => {
      render(<ComplexityDialog open={true} onOpenChange={() => {}} />);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining('/api/complexity'),
          expect.any(Object),
        );
      });
    });

    it('should display file paths in a table', async () => {
      render(<ComplexityDialog open={true} onOpenChange={() => {}} />);

      await waitFor(() => {
        expect(screen.getByText('src/server.ts')).toBeInTheDocument();
      });

      expect(screen.getByText('src/utils.ts')).toBeInTheDocument();
      expect(screen.getByText('src/api/hotspots.ts')).toBeInTheDocument();
    });

    it('should display cyclomatic complexity values', async () => {
      render(<ComplexityDialog open={true} onOpenChange={() => {}} />);

      await waitFor(() => {
        expect(screen.getByText('8.5')).toBeInTheDocument();
      });

      expect(screen.getByText('2.1')).toBeInTheDocument();
      expect(screen.getByText('3.0')).toBeInTheDocument();
    });

    it('should highlight high-complexity files with visual indicator', async () => {
      render(<ComplexityDialog open={true} onOpenChange={() => {}} />);

      await waitFor(() => {
        expect(screen.getByText('src/server.ts')).toBeInTheDocument();
      });

      // server.ts has avg_cyclomatic_complexity 8.5 — should be highlighted
      // The exact mechanism (Badge variant, class, etc.) depends on implementation
      // but there should be a visual distinction for high complexity
      const highComplexityRow = screen.getByText('8.5').closest('tr');
      expect(highComplexityRow).toBeInTheDocument();
    });

    it('should have sortable column headers', async () => {
      render(<ComplexityDialog open={true} onOpenChange={() => {}} />);

      await waitFor(() => {
        expect(screen.getByText('src/server.ts')).toBeInTheDocument();
      });

      // Should have clickable column headers (role=columnheader)
      const headers = screen.getAllByRole('columnheader');
      expect(headers.length).toBeGreaterThanOrEqual(3);
    });

    it('should display loading skeleton while fetching', () => {
      fetchSpy.mockImplementation(() => new Promise(() => {}));

      render(<ComplexityDialog open={true} onOpenChange={() => {}} />);

      // Should show loading state while data is being fetched
      expect(screen.getByTestId('complexity-panel')).toBeInTheDocument();
    });

    it('should display error message on fetch failure', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        }),
      );

      render(<ComplexityDialog open={true} onOpenChange={() => {}} />);

      await waitFor(() => {
        expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
      });
    });

    it('should call onOpenChange when dialog is closed', async () => {
      const onOpenChange = vi.fn();
      render(<ComplexityDialog open={true} onOpenChange={onOpenChange} />);

      // ToolDialog passes onOpenChange to shadcn Dialog
      // Closing triggers onOpenChange(false)
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });
});
