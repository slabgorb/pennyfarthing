/**
 * MSSCI-14460: useDeadCode React hook tests (Story 81-3)
 *
 * Tests the React hook that fetches dead code analysis from the API.
 * Pattern mirrors useHotspots.ts / useAgentLoad.ts.
 *
 * Acceptance Criteria tested:
 * - AC9: useDeadCode provides { data, isLoading, error, refresh } matching UseDeadCodeReturn
 * - AC10: Hook aborts in-flight requests on unmount via AbortController
 * - AC11: Hook passes days, repo, layer as query params to /api/dead-code
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDeadCode } from '../src/public/hooks/useDeadCode.js';
import type { DeadCodeData, UseDeadCodeReturn } from '../src/public/hooks/useDeadCode.js';

// --- Mock Data ---

const MOCK_DEAD_CODE_RESPONSE: DeadCodeData = {
  success: true,
  repo_name: 'pennyfarthing',
  repo_path: '/test/project/pennyfarthing',
  time_window_days: 180,
  stale_files: [
    {
      path: 'src/old-util.ts',
      last_commit_date: '2025-06-01T00:00:00Z',
      days_since_last_commit: 250,
      size_bytes: 1024,
    },
  ],
  total_files: 1,
  unused_exports: [
    {
      symbol: 'unusedHelper',
      file: 'src/utils.ts',
      line: 42,
      export_type: 'named',
    },
  ],
  error: null,
};

// --- Tests ---

describe('MSSCI-14460: useDeadCode hook (Story 81-3)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AC9: Hook return shape', () => {
    it('should return { data, isLoading, error, refresh }', () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_DEAD_CODE_RESPONSE),
      });

      const { result } = renderHook(() =>
        useDeadCode({ days: 180 }),
      );

      expect(result.current).toHaveProperty('data');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('refresh');
    });

    it('should start with null data, not loading, no error', () => {
      const { result } = renderHook(() =>
        useDeadCode({ days: 180 }),
      );

      expect(result.current.data).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should set isLoading=true during fetch', async () => {
      let resolvePromise: (value: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      fetchSpy.mockReturnValue(pendingPromise);

      const { result } = renderHook(() =>
        useDeadCode({ days: 180 }),
      );

      act(() => {
        result.current.refresh();
      });

      expect(result.current.isLoading).toBe(true);

      // Resolve to clean up
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve(MOCK_DEAD_CODE_RESPONSE),
      });
    });

    it('should populate data after successful fetch', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_DEAD_CODE_RESPONSE),
      });

      const { result } = renderHook(() =>
        useDeadCode({ days: 180 }),
      );

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.data).not.toBeNull();
      });

      expect(result.current.data?.success).toBe(true);
      expect(result.current.data?.stale_files).toHaveLength(1);
      expect(result.current.data?.unused_exports).toHaveLength(1);
      expect(result.current.isLoading).toBe(false);
    });

    it('should set error on HTTP failure', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const { result } = renderHook(() =>
        useDeadCode({ days: 180 }),
      );

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error?.message).toContain('500');
      expect(result.current.isLoading).toBe(false);
    });

    it('should set error on network failure', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useDeadCode({ days: 180 }),
      );

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error?.message).toContain('Network error');
    });
  });

  describe('AC10: AbortController cleanup on unmount', () => {
    it('should abort in-flight requests on unmount', async () => {
      let abortSignal: AbortSignal | undefined;

      fetchSpy.mockImplementation((_url: string, opts: any) => {
        abortSignal = opts?.signal;
        return new Promise(() => {}); // Never resolves
      });

      const { result, unmount } = renderHook(() =>
        useDeadCode({ days: 180 }),
      );

      act(() => {
        result.current.refresh();
      });

      expect(abortSignal).toBeDefined();
      expect(abortSignal?.aborted).toBe(false);

      unmount();

      expect(abortSignal?.aborted).toBe(true);
    });

    it('should not set state after unmount (no React warnings)', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      fetchSpy.mockImplementation(() =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: () => Promise.resolve(MOCK_DEAD_CODE_RESPONSE),
              }),
            50,
          ),
        ),
      );

      const { result, unmount } = renderHook(() =>
        useDeadCode({ days: 180 }),
      );

      act(() => {
        result.current.refresh();
      });

      unmount();

      // Wait for the fetch to resolve after unmount
      await new Promise((resolve) => setTimeout(resolve, 100));

      // No React "Can't perform state update on unmounted component" warnings
      const reactWarnings = consoleError.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('unmounted'),
      );
      expect(reactWarnings).toHaveLength(0);

      consoleError.mockRestore();
    });
  });

  describe('AC11: Query parameter handling', () => {
    it('should pass days as query param', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_DEAD_CODE_RESPONSE),
      });

      const { result } = renderHook(() =>
        useDeadCode({ days: 365 }),
      );

      act(() => {
        result.current.refresh();
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('days=365'),
        expect.any(Object),
      );
    });

    it('should pass layer as query param defaulting to "all"', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_DEAD_CODE_RESPONSE),
      });

      const { result } = renderHook(() =>
        useDeadCode({ days: 180 }),
      );

      act(() => {
        result.current.refresh();
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('layer=all'),
        expect.any(Object),
      );
    });

    it('should pass specific layer when provided', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_DEAD_CODE_RESPONSE),
      });

      const { result } = renderHook(() =>
        useDeadCode({ days: 180, layer: 'stale' }),
      );

      act(() => {
        result.current.refresh();
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('layer=stale'),
        expect.any(Object),
      );
    });

    it('should pass repo when provided', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_DEAD_CODE_RESPONSE),
      });

      const { result } = renderHook(() =>
        useDeadCode({ days: 180, repo: 'pennyfarthing' }),
      );

      act(() => {
        result.current.refresh();
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('repo=pennyfarthing'),
        expect.any(Object),
      );
    });

    it('should not include repo when not provided', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_DEAD_CODE_RESPONSE),
      });

      const { result } = renderHook(() =>
        useDeadCode({ days: 180 }),
      );

      act(() => {
        result.current.refresh();
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.not.stringContaining('repo='),
        expect.any(Object),
      );
    });

    it('should fetch from /api/dead-code endpoint', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_DEAD_CODE_RESPONSE),
      });

      const { result } = renderHook(() =>
        useDeadCode({ days: 180 }),
      );

      act(() => {
        result.current.refresh();
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/dead-code'),
        expect.any(Object),
      );
    });
  });

  describe('Refresh behavior', () => {
    it('should abort previous request when refresh is called again', async () => {
      let abortSignals: AbortSignal[] = [];

      fetchSpy.mockImplementation((_url: string, opts: any) => {
        abortSignals.push(opts?.signal);
        return new Promise(() => {}); // Never resolves
      });

      const { result } = renderHook(() =>
        useDeadCode({ days: 180 }),
      );

      act(() => {
        result.current.refresh();
      });

      act(() => {
        result.current.refresh();
      });

      // First signal should be aborted, second should not
      expect(abortSignals).toHaveLength(2);
      expect(abortSignals[0].aborted).toBe(true);
      expect(abortSignals[1].aborted).toBe(false);
    });
  });
});
