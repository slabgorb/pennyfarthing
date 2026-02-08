/**
 * MSSCI-14444: Hotspot skip orchestrator repos by type — Story 79-4
 *
 * Tests the useHotspots hook's new skipTypes option and the
 * default behavior of skipping orchestrator repos.
 *
 * Acceptance Criteria tested:
 * - AC4: useHotspots hook passes --skip-type orchestrator by default
 * - AC5: HotspotsDialog "Include orchestrator" checkbox toggles skip
 * - AC7: Existing tests continue to pass (backward compatibility)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import {
  useHotspots,
  type UseHotspotsOptions,
} from '../src/public/hooks/useHotspots.js';

// Mock response matching MultiRepoHotspotResult shape
const MOCK_MULTI_REPO_RESPONSE = {
  success: true,
  repo_results: [
    {
      success: true,
      repo_name: 'pennyfarthing',
      repo_path: '/tmp/pennyfarthing',
      time_window_days: 90,
      commit_count: 42,
      file_hotspots: [
        {
          path: 'src/app.ts',
          change_count: 10,
          bug_fix_count: 3,
          author_count: 2,
          lines_added: 100,
          lines_deleted: 20,
          churn: 120,
          last_changed: '2026-02-01',
          hotspot_score: 75.0,
        },
      ],
      directory_hotspots: [],
    },
  ],
};

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);

  fetchSpy.mockImplementation((_url: string, _opts?: RequestInit) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(MOCK_MULTI_REPO_RESPONSE),
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useHotspots skipTypes option (Story 79-4)', () => {
  it('should accept skipTypes in UseHotspotsOptions', () => {
    // The options interface should accept skipTypes as an optional string array
    const options: UseHotspotsOptions = {
      days: 90,
      skipTypes: ['orchestrator'],
    };
    const { result } = renderHook(() => useHotspots(options));
    expect(result.current).toBeDefined();
    expect(result.current.data).toBeNull();
  });

  it('should pass skip_type=orchestrator by default when refreshing', async () => {
    const { result } = renderHook(() => useHotspots({ days: 90 }));

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    const fetchUrl = fetchSpy.mock.calls[0][0] as string;
    const params = new URL(fetchUrl, 'http://localhost').searchParams;

    // By default, should include skip_type=orchestrator
    expect(params.get('skip_type')).toBe('orchestrator');
  });

  it('should NOT pass skip_type when includeOrchestrator is true', async () => {
    const { result } = renderHook(() =>
      useHotspots({ days: 90, includeOrchestrator: true }),
    );

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    const fetchUrl = fetchSpy.mock.calls[0][0] as string;
    const params = new URL(fetchUrl, 'http://localhost').searchParams;

    // When includeOrchestrator is true, skip_type should NOT be present
    expect(params.has('skip_type')).toBe(false);
  });

  it('should pass custom skipTypes values to the API', async () => {
    const { result } = renderHook(() =>
      useHotspots({ days: 90, skipTypes: ['orchestrator', 'docs'] }),
    );

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    const fetchUrl = fetchSpy.mock.calls[0][0] as string;
    // Should include both skip_type params
    expect(fetchUrl).toContain('skip_type=orchestrator');
    expect(fetchUrl).toContain('skip_type=docs');
  });

  it('should maintain backward compatibility with existing options', async () => {
    // Existing options (days + repo) should still work
    const { result } = renderHook(() =>
      useHotspots({ days: 60, repo: 'pennyfarthing' }),
    );

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    const fetchUrl = fetchSpy.mock.calls[0][0] as string;
    const params = new URL(fetchUrl, 'http://localhost').searchParams;
    expect(params.get('days')).toBe('60');
    expect(params.get('repo')).toBe('pennyfarthing');
  });

  it('should update fetch URL when skipTypes changes', async () => {
    const { result, rerender } = renderHook(
      (props: UseHotspotsOptions) => useHotspots(props),
      { initialProps: { days: 90, skipTypes: ['orchestrator'] } },
    );

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    const firstUrl = fetchSpy.mock.calls[0][0] as string;
    expect(firstUrl).toContain('skip_type=orchestrator');

    // Rerender with different skipTypes (simulating checkbox toggle)
    rerender({ days: 90, skipTypes: [] });

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    const secondUrl = fetchSpy.mock.calls[1][0] as string;
    expect(secondUrl).not.toContain('skip_type');
  });
});
