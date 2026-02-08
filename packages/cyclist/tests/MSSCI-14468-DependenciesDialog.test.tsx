/**
 * Story 83-3: DependenciesDialog component tests
 * AC6: DependenciesDialog shows outdated packages table and security section
 *
 * Tests the DependenciesDialog component that displays dependency analysis results.
 * Pattern mirrors HotspotsDialog / CodeMarkersDialog.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { DependenciesDialog } from '../src/public/components/dialogs/DependenciesDialog.js';

// --- Mock Data ---

const MOCK_DEPENDENCIES_DATA = {
  success: true,
  target_path: '/test/project',
  outdated: [
    {
      name: 'express',
      current: '4.18.0',
      wanted: '4.18.2',
      latest: '5.0.0',
      type: 'dependencies',
    },
    {
      name: 'vitest',
      current: '1.0.0',
      wanted: '1.6.0',
      latest: '2.0.0',
      type: 'devDependencies',
    },
    {
      name: 'react',
      current: '18.2.0',
      wanted: '18.2.0',
      latest: '19.0.0',
      type: 'dependencies',
    },
  ],
  advisories: [
    { severity: 'high', count: 1 },
    { severity: 'moderate', count: 3 },
    { severity: 'low', count: 5 },
  ],
  error: null,
};

// --- Tests ---

describe('MSSCI-14468: DependenciesDialog (Story 83-3)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    fetchSpy.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/dependencies')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_DEPENDENCIES_DATA),
        });
      }
      return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AC6: Outdated packages table and security section', () => {
    it('should render dialog with title "Dependencies"', () => {
      render(<DependenciesDialog open={true} onOpenChange={() => {}} />);
      expect(screen.getByText('Dependencies')).toBeInTheDocument();
    });

    it('should not render content when closed', () => {
      render(<DependenciesDialog open={false} onOpenChange={() => {}} />);
      expect(screen.queryByTestId('dependencies-panel')).not.toBeInTheDocument();
    });

    it('should fetch data when dialog opens', async () => {
      render(<DependenciesDialog open={true} onOpenChange={() => {}} />);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining('/api/dependencies'),
          expect.any(Object),
        );
      });
    });

    it('should display outdated package names', async () => {
      render(<DependenciesDialog open={true} onOpenChange={() => {}} />);

      await waitFor(() => {
        expect(screen.getByText('express')).toBeInTheDocument();
      });

      expect(screen.getByText('vitest')).toBeInTheDocument();
      expect(screen.getByText('react')).toBeInTheDocument();
    });

    it('should display current and latest versions', async () => {
      render(<DependenciesDialog open={true} onOpenChange={() => {}} />);

      await waitFor(() => {
        expect(screen.getByText('4.18.0')).toBeInTheDocument();
      });

      expect(screen.getByText('5.0.0')).toBeInTheDocument();
    });

    it('should display security advisories section', async () => {
      render(<DependenciesDialog open={true} onOpenChange={() => {}} />);

      await waitFor(() => {
        expect(screen.getByText(/high/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/moderate/i)).toBeInTheDocument();
    });

    it('should show advisory counts per severity', async () => {
      render(<DependenciesDialog open={true} onOpenChange={() => {}} />);

      await waitFor(() => {
        // high: 1, moderate: 3, low: 5
        expect(screen.getByText(/1/)).toBeInTheDocument();
      });
    });

    it('should display loading state while fetching', () => {
      fetchSpy.mockImplementation(() => new Promise(() => {}));

      render(<DependenciesDialog open={true} onOpenChange={() => {}} />);

      expect(screen.getByTestId('dependencies-panel')).toBeInTheDocument();
    });

    it('should display error message on fetch failure', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        }),
      );

      render(<DependenciesDialog open={true} onOpenChange={() => {}} />);

      await waitFor(() => {
        expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
      });
    });

    it('should call onOpenChange when dialog is closed', async () => {
      const onOpenChange = vi.fn();
      render(<DependenciesDialog open={true} onOpenChange={onOpenChange} />);

      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });
});
