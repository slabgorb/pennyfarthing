/**
 * 84-2: useHealthScore Hook Tests
 *
 * Tests for the React hook that fetches health score data
 * with loading/error/data states and 60-second auto-polling.
 *
 * Story: MSSCI-14471 - Health score API + gauge component
 * Epic: epic-84 (Composite Health Score)
 *
 * Acceptance Criteria covered:
 * - AC3: useHealthScore.ts React hook with loading/error/data states
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Module under test — to be implemented
import { useHealthScore } from '../src/public/hooks/useHealthScore';
import type { HealthScoreData } from '../src/public/hooks/useHealthScore';

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  vi.useRealTimers();
});

const MOCK_HEALTH_SCORE: HealthScoreData = {
  success: true,
  composite_score: 72.3,
  dimensions: [
    { name: 'churn', score: 54.8, weight: 0.15 },
    { name: 'todo_density', score: 74.0, weight: 0.15 },
    { name: 'complexity', score: 88.0, weight: 0.15 },
    { name: 'test_gaps', score: 75.0, weight: 0.15 },
    { name: 'dead_code', score: 95.0, weight: 0.10 },
    { name: 'deprecation_debt', score: 85.0, weight: 0.10 },
    { name: 'dependency_freshness', score: 68.0, weight: 0.10 },
    { name: 'agent_context_efficiency', score: 60.0, weight: 0.10 },
  ],
  cached: false,
};

// ============================================================================
// AC3: Hook exports and basic structure
// ============================================================================

describe('AC3: useHealthScore hook with loading/error/data states', () => {
  it('should export useHealthScore as a function', () => {
    expect(useHealthScore).toBeDefined();
    expect(typeof useHealthScore).toBe('function');
  });

  it('should export HealthScoreData type', () => {
    // Type check — if this compiles, the type exists
    const _data: HealthScoreData = MOCK_HEALTH_SCORE;
    expect(_data.success).toBe(true);
  });

  it('should return { data, isLoading, error, refresh }', () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_HEALTH_SCORE),
    });

    const { result } = renderHook(() => useHealthScore());

    expect(result.current).toHaveProperty('data');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('refresh');
    expect(typeof result.current.refresh).toBe('function');
  });

  it('should start in loading state when refresh is called', async () => {
    // First mock consumed by auto-fetch on mount
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_HEALTH_SCORE),
    });
    // Second mock for manual refresh() call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_HEALTH_SCORE),
    });

    const { result } = renderHook(() => useHealthScore());

    act(() => {
      result.current.refresh();
    });

    // Should be loading after refresh is called
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should populate data on successful fetch', async () => {
    // First mock consumed by auto-fetch on mount
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_HEALTH_SCORE),
    });
    // Second mock for manual refresh() call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_HEALTH_SCORE),
    });

    const { result } = renderHook(() => useHealthScore());

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });

    expect(result.current.data?.success).toBe(true);
    expect(result.current.data?.composite_score).toBe(72.3);
    expect(result.current.data?.dimensions).toHaveLength(8);
    expect(result.current.error).toBeNull();
  });

  it('should set error state on fetch failure', async () => {
    // Auto-fetch on mount succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_HEALTH_SCORE),
    });
    // Manual refresh returns error
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const { result } = renderHook(() => useHealthScore());

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    // Data from auto-fetch is kept (stale-while-error pattern)
    expect(result.current.data).not.toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('should set error state on network error', async () => {
    // Auto-fetch on mount succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_HEALTH_SCORE),
    });
    // Manual refresh throws network error
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useHealthScore());

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.error?.message).toBe('Network error');
  });

  it('should fetch from /api/health-score', async () => {
    // Auto-fetch on mount
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_HEALTH_SCORE),
    });
    // Manual refresh
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_HEALTH_SCORE),
    });

    const { result } = renderHook(() => useHealthScore());

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/health-score',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('should abort in-flight request on unmount', async () => {
    let abortSignal: AbortSignal | undefined;

    mockFetch.mockImplementation((_url: any, opts: any) => {
      abortSignal = opts?.signal;
      return new Promise(() => {}); // Never resolves
    });

    const { result, unmount } = renderHook(() => useHealthScore());

    act(() => {
      result.current.refresh();
    });

    unmount();

    expect(abortSignal?.aborted).toBe(true);
  });

  it('should ignore AbortError and not set error state', async () => {
    mockFetch.mockImplementation((_url: any, opts: any) => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    });

    const { result } = renderHook(() => useHealthScore());

    act(() => {
      result.current.refresh();
    });

    // Give time for the error to potentially propagate
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // AbortError should not set the error state
    expect(result.current.error).toBeNull();
  });

});
