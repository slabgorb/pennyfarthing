/**
 * Story 80-3: useCodeMarkers React hook tests
 * AC2: useCodeMarkers React hook handles fetch, loading, error states with AbortController
 *
 * Tests the useCodeMarkers hook that wraps the /api/code-markers endpoint.
 * Pattern mirrors useHotspots / useAgentLoad hooks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useCodeMarkers } from '../src/public/hooks/useCodeMarkers.js';
import type { CodeMarkersData, UseCodeMarkersOptions } from '../src/public/hooks/useCodeMarkers.js';

// --- Mock Data ---

const MOCK_CODE_MARKERS_DATA: CodeMarkersData = {
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
      author: 'testuser',
      date: '2025-11-15T10:30:00-05:00',
      age_days: 84,
      is_stale: false,
    },
    {
      path: 'src/utils.ts',
      line: 10,
      marker_type: 'FIXME',
      text: 'FIXME: handle edge case',
      author: 'testuser',
      date: '2025-06-01T10:00:00-05:00',
      age_days: 252,
      is_stale: true,
    },
  ],
  summary: {
    total_markers: 2,
    stale_markers: 1,
    by_type: { TODO: 1, FIXME: 1 },
  },
  error: null,
};

// --- Tests ---

describe('MSSCI-14456: useCodeMarkers Hook (Story 80-3)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    // Default: successful response
    fetchSpy.mockImplementation((url: string, _opts?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/code-markers')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_CODE_MARKERS_DATA),
        });
      }
      return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AC2: Hook handles fetch, loading, error states with AbortController', () => {
    it('should return data as null initially', () => {
      const { result } = renderHook(() =>
        useCodeMarkers({ days: 90, repo: 'pennyfarthing' }),
      );
      expect(result.current.data).toBeNull();
    });

    it('should return isLoading as false initially', () => {
      const { result } = renderHook(() =>
        useCodeMarkers({ days: 90, repo: 'pennyfarthing' }),
      );
      expect(result.current.isLoading).toBe(false);
    });

    it('should return error as null initially', () => {
      const { result } = renderHook(() =>
        useCodeMarkers({ days: 90, repo: 'pennyfarthing' }),
      );
      expect(result.current.error).toBeNull();
    });

    it('should provide a refresh callback', () => {
      const { result } = renderHook(() =>
        useCodeMarkers({ days: 90, repo: 'pennyfarthing' }),
      );
      expect(typeof result.current.refresh).toBe('function');
    });

    it('should set isLoading to true when refresh is called', async () => {
      // Never-resolving fetch to capture loading state
      fetchSpy.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() =>
        useCodeMarkers({ days: 90, repo: 'pennyfarthing' }),
      );

      act(() => {
        result.current.refresh();
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('should populate data after successful refresh', async () => {
      const { result } = renderHook(() =>
        useCodeMarkers({ days: 90, repo: 'pennyfarthing' }),
      );

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.data).not.toBeNull();
      });

      expect(result.current.data!.markers).toHaveLength(2);
      expect(result.current.data!.summary.total_markers).toBe(2);
      expect(result.current.isLoading).toBe(false);
    });

    it('should set error on HTTP failure', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        }),
      );

      const { result } = renderHook(() =>
        useCodeMarkers({ days: 90, repo: 'pennyfarthing' }),
      );

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error!.message).toContain('500');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeNull();
    });

    it('should set error on network failure', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.reject(new Error('Network error')),
      );

      const { result } = renderHook(() =>
        useCodeMarkers({ days: 90, repo: 'pennyfarthing' }),
      );

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error!.message).toBe('Network error');
      expect(result.current.isLoading).toBe(false);
    });

    it('should abort in-flight fetch when hook unmounts', async () => {
      let abortSignal: AbortSignal | undefined;

      fetchSpy.mockImplementation((_url: string, opts?: RequestInit) => {
        abortSignal = opts?.signal || undefined;
        return new Promise(() => {}); // Never resolves
      });

      const { result, unmount } = renderHook(() =>
        useCodeMarkers({ days: 90, repo: 'pennyfarthing' }),
      );

      act(() => {
        result.current.refresh();
      });

      unmount();

      expect(abortSignal).toBeDefined();
      expect(abortSignal!.aborted).toBe(true);
    });

    it('should abort previous request when refresh is called again', async () => {
      let firstSignal: AbortSignal | undefined;
      let callCount = 0;

      fetchSpy.mockImplementation((_url: string, opts?: RequestInit) => {
        callCount++;
        if (callCount === 1) {
          firstSignal = opts?.signal;
          return new Promise(() => {}); // First call never resolves
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_CODE_MARKERS_DATA),
        });
      });

      const { result } = renderHook(() =>
        useCodeMarkers({ days: 90, repo: 'pennyfarthing' }),
      );

      // First refresh
      act(() => {
        result.current.refresh();
      });

      // Second refresh should abort first
      act(() => {
        result.current.refresh();
      });

      expect(firstSignal).toBeDefined();
      expect(firstSignal!.aborted).toBe(true);
    });

    it('should not set error state on AbortError', async () => {
      fetchSpy.mockImplementation((_url: string, opts?: RequestInit) => {
        const error = new DOMException('The operation was aborted', 'AbortError');
        return Promise.reject(error);
      });

      const { result } = renderHook(() =>
        useCodeMarkers({ days: 90, repo: 'pennyfarthing' }),
      );

      act(() => {
        result.current.refresh();
      });

      // Give time for the rejection to process
      await new Promise((r) => setTimeout(r, 50));

      // AbortError should NOT set error state
      expect(result.current.error).toBeNull();
    });

    it('should build URL with days parameter', async () => {
      const { result } = renderHook(() =>
        useCodeMarkers({ days: 30, repo: 'pennyfarthing' }),
      );

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
      });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('days=30');
    });

    it('should build URL with repo parameter', async () => {
      const { result } = renderHook(() =>
        useCodeMarkers({ days: 90, repo: 'pennyfarthing' }),
      );

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
      });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('repo=pennyfarthing');
    });

    it('should build URL with type parameter when provided', async () => {
      const { result } = renderHook(() =>
        useCodeMarkers({ days: 90, repo: 'pennyfarthing', type: 'stale' }),
      );

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
      });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('type=stale');
    });

    it('should omit type parameter when not provided', async () => {
      const { result } = renderHook(() =>
        useCodeMarkers({ days: 90, repo: 'pennyfarthing' }),
      );

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
      });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).not.toContain('type=');
    });
  });
});
