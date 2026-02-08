/**
 * Story 83-3: useDependencies React hook tests
 * AC4: useDependencies hook fetches and caches dependencies data
 *
 * Tests the useDependencies hook that wraps the /api/dependencies endpoint.
 * Pattern mirrors useHotspots / useCodeMarkers hooks.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useDependencies } from '../src/public/hooks/useDependencies.js';
import type { DependenciesData } from '../src/public/hooks/useDependencies.js';

// --- Mock Data ---

const MOCK_DEPENDENCIES_DATA: DependenciesData = {
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
  ],
  advisories: [
    { severity: 'high', count: 1 },
    { severity: 'moderate', count: 3 },
  ],
  error: null,
};

// --- Tests ---

describe('MSSCI-14468: useDependencies Hook (Story 83-3)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    // Default: successful response
    fetchSpy.mockImplementation((url: string, _opts?: RequestInit) => {
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

  describe('AC4: Hook fetches and caches dependencies data', () => {
    it('should return data as null initially', () => {
      const { result } = renderHook(() => useDependencies({}));
      expect(result.current.data).toBeNull();
    });

    it('should return isLoading as false initially', () => {
      const { result } = renderHook(() => useDependencies({}));
      expect(result.current.isLoading).toBe(false);
    });

    it('should return error as null initially', () => {
      const { result } = renderHook(() => useDependencies({}));
      expect(result.current.error).toBeNull();
    });

    it('should provide a refresh callback', () => {
      const { result } = renderHook(() => useDependencies({}));
      expect(typeof result.current.refresh).toBe('function');
    });

    it('should set isLoading to true when refresh is called', async () => {
      // Never-resolving fetch to capture loading state
      fetchSpy.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useDependencies({}));

      act(() => {
        result.current.refresh();
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('should populate data after successful refresh', async () => {
      const { result } = renderHook(() => useDependencies({}));

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.data).not.toBeNull();
      });

      expect(result.current.data!.outdated).toHaveLength(2);
      expect(result.current.data!.advisories).toHaveLength(2);
      expect(result.current.data!.outdated[0].name).toBe('express');
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

      const { result } = renderHook(() => useDependencies({}));

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

      const { result } = renderHook(() => useDependencies({}));

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

      const { result, unmount } = renderHook(() => useDependencies({}));

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
          json: () => Promise.resolve(MOCK_DEPENDENCIES_DATA),
        });
      });

      const { result } = renderHook(() => useDependencies({}));

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

      const { result } = renderHook(() => useDependencies({}));

      act(() => {
        result.current.refresh();
      });

      // Give time for the rejection to process
      await new Promise((r) => setTimeout(r, 50));

      // AbortError should NOT set error state
      expect(result.current.error).toBeNull();
    });

    it('should build URL targeting /api/dependencies', async () => {
      const { result } = renderHook(() => useDependencies({}));

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
      });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('/api/dependencies');
    });
  });
});
