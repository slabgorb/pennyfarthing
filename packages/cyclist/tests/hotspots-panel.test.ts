/**
 * Hotspots Panel and Hook Tests
 *
 * Tests for:
 * - useHotspots hook state transitions
 * - HotspotsPanel rendering (loading/error/data states)
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// =============================================================================
// useHotspots Hook Tests
// =============================================================================

// Mock fetch globally for hook tests
const mockFetchResponse = (data: unknown, ok = true, status = 200) => {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: () => Promise.resolve(data),
  });
};

describe('useHotspots', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('starts with no data and not loading', async () => {
    // Lazy import to avoid hoisting issues
    const { useHotspots } = await import('../src/public/hooks/useHotspots');
    const { result } = renderHook(() => useHotspots({ days: 90 }));

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetches data on refresh', async () => {
    const mockData = {
      success: true,
      repo_name: 'test-repo',
      time_window_days: 90,
      commit_count: 42,
      file_hotspots: [
        { path: 'src/app.ts', change_count: 10, bug_fix_count: 3, author_count: 2, churn: 500, hotspot_score: 75.0 },
      ],
      directory_hotspots: [
        { path: 'src', file_count: 5, total_changes: 30, hotspot_score: 60.0 },
      ],
    };

    globalThis.fetch = mockFetchResponse(mockData);

    const { useHotspots } = await import('../src/public/hooks/useHotspots');
    const { result } = renderHook(() => useHotspots({ days: 90 }));

    // Trigger refresh
    act(() => {
      result.current.refresh();
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeTruthy();
    expect(result.current.data!.success).toBe(true);
    expect(result.current.data!.commit_count).toBe(42);
    expect(result.current.error).toBeNull();
  });

  it('handles fetch errors', async () => {
    globalThis.fetch = mockFetchResponse(null, false, 500);

    const { useHotspots } = await import('../src/public/hooks/useHotspots');
    const { result } = renderHook(() => useHotspots({ days: 30 }));

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeNull();
  });

  it('passes days and repo as query params', async () => {
    const fetchSpy = mockFetchResponse({ success: true, file_hotspots: [] });
    globalThis.fetch = fetchSpy;

    const { useHotspots } = await import('../src/public/hooks/useHotspots');
    const { result } = renderHook(() => useHotspots({ days: 60, repo: 'pennyfarthing' }));

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('days=60'),
      expect.anything(),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('repo=pennyfarthing'),
      expect.anything(),
    );
  });
});

// =============================================================================
// HotspotsPanel Component Tests
// =============================================================================

describe('HotspotsPanel', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders empty state with analyze button', async () => {
    const { HotspotsPanel } = await import('../src/public/components/panels/HotspotsPanel');
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(HotspotsPanel));

    // Should show "Analyze" button
    expect(screen.getByRole('button', { name: /analyze/i })).toBeTruthy();
    // Should show empty state message
    expect(screen.getByText(/click/i)).toBeTruthy();
  });

  it('renders time window buttons', async () => {
    const { HotspotsPanel } = await import('../src/public/components/panels/HotspotsPanel');
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(HotspotsPanel));

    expect(screen.getByText('30d')).toBeTruthy();
    expect(screen.getByText('60d')).toBeTruthy();
    expect(screen.getByText('90d')).toBeTruthy();
  });

  it('renders view mode toggles', async () => {
    const { HotspotsPanel } = await import('../src/public/components/panels/HotspotsPanel');
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(HotspotsPanel));

    expect(screen.getByText('Files')).toBeTruthy();
    expect(screen.getByText('Dirs')).toBeTruthy();
  });

  it('has correct test id', async () => {
    const { HotspotsPanel } = await import('../src/public/components/panels/HotspotsPanel');
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(HotspotsPanel));

    expect(screen.getByTestId('hotspots-panel')).toBeTruthy();
  });
});
