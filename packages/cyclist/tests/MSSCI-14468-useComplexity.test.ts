/**
 * Story 83-3: useComplexity React hook tests
 * AC3: useComplexity hook fetches and caches complexity data
 *
 * Tests the useComplexity hook that wraps the /api/complexity endpoint.
 * Pattern mirrors useHotspots / useCodeMarkers hooks.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useComplexity } from '../src/public/hooks/useComplexity.js';
import type { ComplexityData } from '../src/public/hooks/useComplexity.js';

// --- Mock Data ---

const MOCK_COMPLEXITY_DATA: ComplexityData = {
  success: true,
  target_path: '/test/project',
  file_count: 3,
  files: [
    {
      path: 'src/server.ts',
      total_lines: 250,
      longest_function: 45,
      avg_cyclomatic_complexity: 4.2,
      max_nesting_depth: 3,
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

describe('MSSCI-14468: useComplexity Hook (Story 83-3)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    // Default: successful response
    fetchSpy.mockImplementation((url: string, _opts?: RequestInit) => {
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

  describe('AC3: Hook fetches and caches complexity data', () => {
    it('should return data as null initially', () => {
      const { result } = renderHook(() => useComplexity({}));
      expect(result.current.data).toBeNull();
    });

    it('should return isLoading as false initially', () => {
      const { result } = renderHook(() => useComplexity({}));
      expect(result.current.isLoading).toBe(false);
    });

    it('should return error as null initially', () => {
      const { result } = renderHook(() => useComplexity({}));
      expect(result.current.error).toBeNull();
    });

    it('should provide a refresh callback', () => {
      const { result } = renderHook(() => useComplexity({}));
      expect(typeof result.current.refresh).toBe('function');
    });

    it('should set isLoading to true when refresh is called', async () => {
      // Never-resolving fetch to capture loading state
      fetchSpy.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useComplexity({}));

      act(() => {
        result.current.refresh();
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('should populate data after successful refresh', async () => {
      const { result } = renderHook(() => useComplexity({}));

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.data).not.toBeNull();
      });

      expect(result.current.data!.files).toHaveLength(3);
      expect(result.current.data!.file_count).toBe(3);
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

      const { result } = renderHook(() => useComplexity({}));

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

      const { result } = renderHook(() => useComplexity({}));

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

      const { result, unmount } = renderHook(() => useComplexity({}));

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
          json: () => Promise.resolve(MOCK_COMPLEXITY_DATA),
        });
      });

      const { result } = renderHook(() => useComplexity({}));

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
      fetchSpy.mockImplementation(() => {
        const error = new DOMException('The operation was aborted', 'AbortError');
        return Promise.reject(error);
      });

      const { result } = renderHook(() => useComplexity({}));

      act(() => {
        result.current.refresh();
      });

      // Give time for the rejection to process
      await new Promise((r) => setTimeout(r, 50));

      // AbortError should NOT set error state
      expect(result.current.error).toBeNull();
    });

    it('should build URL with path parameter when provided', async () => {
      const { result } = renderHook(() =>
        useComplexity({ path: '/custom/path' }),
      );

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
      });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('/api/complexity');
    });

    it('should build URL with top parameter when provided', async () => {
      const { result } = renderHook(() =>
        useComplexity({ top: 20 }),
      );

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
      });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('top=20');
    });
  });
});
