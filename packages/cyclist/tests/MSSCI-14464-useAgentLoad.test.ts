/**
 * MSSCI-14464: Agent Load Analyzer — Story 82-3: useAgentLoad hook
 *
 * Tests the React hook that wraps the agent-load API endpoints.
 * Hook should provide: data fetching, loading/error states, refresh,
 * sidecar pruning, and cleanup on unmount.
 *
 * Acceptance Criteria tested:
 * - AC1: useAgentLoad() returns {data, isLoading, error, refresh, pruneSidecar, pruneResult}
 * - AC2: refresh() fetches from GET /api/agent-load and populates data
 * - AC3: pruneSidecar(agent, file) POSTs to /api/agent-load/prune-sidecar and auto-refreshes
 * - AC4: AbortController cancels in-flight requests on unmount
 * - AC12: Hook and types exported from hooks/index.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// This import will fail — the hook doesn't exist yet (RED state)
import { useAgentLoad } from '../src/public/hooks/useAgentLoad.js';
import type { AgentLoadData, AgentLoadEntry, PruneResult } from '../src/public/hooks/useAgentLoad.js';

// Sample API response matching the shape from GET /api/agent-load
const MOCK_AGENT_LOAD_RESPONSE: AgentLoadData = {
  agents: [
    {
      agent: 'sm',
      totalTokens: 5200,
      tokenCounts: { agent_definition: 2000, persona: 1200, sidecars: 800, behavior_guide: 1200 },
      components: [
        { name: 'agent_definition', tokens: 2000, source: '.pennyfarthing/agents/sm.md' },
        { name: 'persona', tokens: 1200, source: null },
        { name: 'sidecars', tokens: 800, source: '.pennyfarthing/sidecars/sm/' },
      ],
    },
    {
      agent: 'dev',
      totalTokens: 4800,
      tokenCounts: { agent_definition: 1800, persona: 1000, sidecars: 900, behavior_guide: 1100 },
      components: [
        { name: 'agent_definition', tokens: 1800, source: '.pennyfarthing/agents/dev.md' },
        { name: 'persona', tokens: 1000, source: null },
        { name: 'sidecars', tokens: 900, source: '.pennyfarthing/sidecars/dev/' },
      ],
    },
    {
      agent: 'tea',
      totalTokens: 4600,
      tokenCounts: { agent_definition: 1700, persona: 1100, sidecars: 700, behavior_guide: 1100 },
      components: [],
    },
    { agent: 'reviewer', totalTokens: 4400, tokenCounts: {}, components: [] },
    { agent: 'architect', totalTokens: 4200, tokenCounts: {}, components: [] },
    { agent: 'pm', totalTokens: 3800, tokenCounts: {}, components: [] },
    { agent: 'tech-writer', totalTokens: 3600, tokenCounts: {}, components: [] },
    { agent: 'ux-designer', totalTokens: 3400, tokenCounts: {}, components: [] },
    { agent: 'devops', totalTokens: 3200, tokenCounts: {}, components: [] },
    { agent: 'orchestrator', totalTokens: 3000, tokenCounts: {}, components: [] },
  ],
  cachedAt: '2026-02-08T00:00:00.000Z',
  totalAcrossAllAgents: 40200,
};

const MOCK_PRUNE_RESPONSE: PruneResult = {
  success: true,
  tokensFreed: 250,
  agent: 'dev',
  file: 'patterns.md',
};

describe('MSSCI-14464: useAgentLoad Hook (Story 82-3)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    // Default: GET returns agent load data
    fetchSpy.mockImplementation((url: string, _opts?: RequestInit) => {
      if (url === '/api/agent-load' && (!_opts || _opts.method === undefined)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_AGENT_LOAD_RESPONSE),
        });
      }
      if (url === '/api/agent-load/prune-sidecar') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_PRUNE_RESPONSE),
        });
      }
      return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // AC1: Return shape — {data, isLoading, error, refresh, pruneSidecar, pruneResult}
  // ===========================================================================

  describe('AC1: Hook return shape', () => {
    it('should return data as null initially', () => {
      const { result } = renderHook(() => useAgentLoad());
      expect(result.current.data).toBeNull();
    });

    it('should return isLoading as false initially', () => {
      const { result } = renderHook(() => useAgentLoad());
      expect(result.current.isLoading).toBe(false);
    });

    it('should return error as null initially', () => {
      const { result } = renderHook(() => useAgentLoad());
      expect(result.current.error).toBeNull();
    });

    it('should return refresh as a function', () => {
      const { result } = renderHook(() => useAgentLoad());
      expect(typeof result.current.refresh).toBe('function');
    });

    it('should return pruneSidecar as a function', () => {
      const { result } = renderHook(() => useAgentLoad());
      expect(typeof result.current.pruneSidecar).toBe('function');
    });

    it('should return pruneResult as null initially', () => {
      const { result } = renderHook(() => useAgentLoad());
      expect(result.current.pruneResult).toBeNull();
    });
  });

  // ===========================================================================
  // AC2: refresh() fetches from GET /api/agent-load
  // ===========================================================================

  describe('AC2: refresh() fetches agent load data', () => {
    it('should set isLoading to true when refresh is called', async () => {
      // Delay the response so we can observe loading state
      fetchSpy.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useAgentLoad());

      act(() => {
        result.current.refresh();
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('should populate data after successful refresh', async () => {
      const { result } = renderHook(() => useAgentLoad());

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.data).not.toBeNull();
      });

      expect(result.current.data!.agents).toHaveLength(10);
      expect(result.current.data!.totalAcrossAllAgents).toBe(40200);
      expect(result.current.data!.cachedAt).toBe('2026-02-08T00:00:00.000Z');
    });

    it('should set isLoading to false after successful refresh', async () => {
      const { result } = renderHook(() => useAgentLoad());

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).not.toBeNull();
    });

    it('should fetch from /api/agent-load endpoint', async () => {
      const { result } = renderHook(() => useAgentLoad());

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.data).not.toBeNull();
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/agent-load',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('should set error on HTTP failure', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const { result } = renderHook(() => useAgentLoad());

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeNull();
    });

    it('should set error on network failure', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useAgentLoad());

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error!.message).toBe('Network error');
    });

    it('should clear previous error on successful refresh', async () => {
      // First call fails
      fetchSpy.mockRejectedValueOnce(new Error('Temporary failure'));

      const { result } = renderHook(() => useAgentLoad());

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      // Second call succeeds (default mock)
      fetchSpy.mockImplementation((url: string) => {
        if (url === '/api/agent-load') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(MOCK_AGENT_LOAD_RESPONSE),
          });
        }
        return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
      });

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
        expect(result.current.data).not.toBeNull();
      });
    });
  });

  // ===========================================================================
  // AC3: pruneSidecar() POSTs and auto-refreshes
  // ===========================================================================

  describe('AC3: pruneSidecar() prunes and auto-refreshes', () => {
    it('should POST to /api/agent-load/prune-sidecar with agent and file', async () => {
      const { result } = renderHook(() => useAgentLoad());

      await act(async () => {
        await result.current.pruneSidecar('dev', 'patterns.md');
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/agent-load/prune-sidecar',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ agent: 'dev', file: 'patterns.md' }),
        }),
      );
    });

    it('should set pruneResult after successful prune', async () => {
      const { result } = renderHook(() => useAgentLoad());

      await act(async () => {
        await result.current.pruneSidecar('dev', 'patterns.md');
      });

      expect(result.current.pruneResult).not.toBeNull();
      expect(result.current.pruneResult!.success).toBe(true);
      expect(result.current.pruneResult!.tokensFreed).toBe(250);
      expect(result.current.pruneResult!.agent).toBe('dev');
      expect(result.current.pruneResult!.file).toBe('patterns.md');
    });

    it('should auto-refresh agent load data after successful prune', async () => {
      const { result } = renderHook(() => useAgentLoad());

      await act(async () => {
        await result.current.pruneSidecar('dev', 'patterns.md');
      });

      // Should have called fetch for both prune AND refresh
      const calls = fetchSpy.mock.calls.map((c: any[]) => c[0]);
      expect(calls).toContain('/api/agent-load/prune-sidecar');
      expect(calls).toContain('/api/agent-load');
    });

    it('should set pruneResult with error on prune failure', async () => {
      fetchSpy.mockImplementation((url: string) => {
        if (url === '/api/agent-load/prune-sidecar') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: false, error: 'Sidecar not found' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_AGENT_LOAD_RESPONSE),
        });
      });

      const { result } = renderHook(() => useAgentLoad());

      await act(async () => {
        await result.current.pruneSidecar('dev', 'patterns.md');
      });

      expect(result.current.pruneResult).not.toBeNull();
      expect(result.current.pruneResult!.success).toBe(false);
      expect(result.current.pruneResult!.error).toBeDefined();
    });

    it('should NOT auto-refresh if prune fails', async () => {
      fetchSpy.mockImplementation((url: string) => {
        if (url === '/api/agent-load/prune-sidecar') {
          return Promise.resolve({
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            json: () => Promise.resolve({ success: false, error: 'Invalid agent' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_AGENT_LOAD_RESPONSE),
        });
      });

      const { result } = renderHook(() => useAgentLoad());

      await act(async () => {
        await result.current.pruneSidecar('invalid', 'patterns.md');
      });

      // Only the prune call should have been made, no refresh
      const getCalls = fetchSpy.mock.calls.filter(
        (c: any[]) => c[0] === '/api/agent-load',
      );
      expect(getCalls).toHaveLength(0);
    });
  });

  // ===========================================================================
  // AC4: AbortController cancels in-flight requests on unmount
  // ===========================================================================

  describe('AC4: AbortController cleanup on unmount', () => {
    it('should abort in-flight fetch when hook unmounts', async () => {
      let abortSignal: AbortSignal | undefined;

      fetchSpy.mockImplementation((_url: string, opts?: RequestInit) => {
        abortSignal = opts?.signal || undefined;
        return new Promise(() => {}); // Never resolves
      });

      const { result, unmount } = renderHook(() => useAgentLoad());

      act(() => {
        result.current.refresh();
      });

      // Unmount should trigger abort
      unmount();

      expect(abortSignal).toBeDefined();
      expect(abortSignal!.aborted).toBe(true);
    });

    it('should not update state after unmount (no AbortError leak)', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      fetchSpy.mockImplementation((_url: string, opts?: RequestInit) => {
        return new Promise((resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      });

      const { result, unmount } = renderHook(() => useAgentLoad());

      act(() => {
        result.current.refresh();
      });

      unmount();

      // Wait a tick to ensure no state update errors
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not have logged "Can't perform a React state update on an unmounted component"
      const stateUpdateErrors = consoleErrorSpy.mock.calls.filter(
        (args) => args.some((a) => typeof a === 'string' && a.includes('unmounted')),
      );
      expect(stateUpdateErrors).toHaveLength(0);

      consoleErrorSpy.mockRestore();
    });

    it('should abort previous request when refresh is called again', async () => {
      const abortSignals: AbortSignal[] = [];

      fetchSpy.mockImplementation((_url: string, opts?: RequestInit) => {
        if (opts?.signal) abortSignals.push(opts.signal);
        return new Promise(() => {}); // Never resolves
      });

      const { result } = renderHook(() => useAgentLoad());

      // First refresh
      act(() => {
        result.current.refresh();
      });

      // Second refresh should abort the first
      act(() => {
        result.current.refresh();
      });

      expect(abortSignals).toHaveLength(2);
      expect(abortSignals[0].aborted).toBe(true); // First was aborted
    });
  });

  // ===========================================================================
  // AC12: Export from hooks/index.ts
  // ===========================================================================

  describe('AC12: Barrel export from hooks/index.ts', () => {
    it('should export useAgentLoad from hooks/index.ts', async () => {
      const hooksModule = await import('../src/public/hooks/index.js');
      expect(hooksModule).toHaveProperty('useAgentLoad');
      expect(typeof hooksModule.useAgentLoad).toBe('function');
    });
  });
});
