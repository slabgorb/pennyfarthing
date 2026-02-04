/**
 * MSSCI-14209: useSprint Hook Unit Tests
 *
 * Tests for useSprint.ts - the React hook that:
 * - Connects to /ws/sprint WebSocket endpoint
 * - Manages sprint data state
 * - Handles reconnection on disconnect
 * - Merges partial updates
 *
 * Story: MSSCI-14209
 * Epic: MSSCI-14186 (Dockview Panel Migration)
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// =============================================================================
// Test Data Types
// =============================================================================

interface MockSprintData {
  currentStory: { id: string; title: string; points: number; status: string; jiraKey: string | null } | null;
  nextStory: { id: string; title: string; points: number; status: string; jiraKey: string | null } | null;
  epics: Array<{
    id: string;
    title: string;
    jiraKey: string | null;
    stories: Array<{ id: string; title: string; points: number; status: string; jiraKey: string | null }>;
  }>;
  futureEpics: Array<{
    id: string;
    title: string;
    description: string;
    estimatedPoints: number;
    status: string;
  }>;
  sprint: {
    number: number;
    name: string;
    done: number;
    remaining: number;
    inProgress: number;
    endDate: string;
  };
}

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockSprintData(overrides: Partial<MockSprintData> = {}): MockSprintData {
  return {
    currentStory: {
      id: 'MSSCI-14209',
      title: 'Sprint panel metadata',
      points: 5,
      status: 'in_progress',
      jiraKey: 'MSSCI-14209',
    },
    nextStory: null,
    epics: [
      {
        id: 'epic-76',
        title: 'Dockview Panel Migration',
        jiraKey: 'MSSCI-14186',
        stories: [
          { id: 'MSSCI-14209', title: 'Sprint panel metadata', points: 5, status: 'in_progress', jiraKey: 'MSSCI-14209' },
        ],
      },
    ],
    futureEpics: [],
    sprint: {
      number: 2606,
      name: 'TO Sprint 2606',
      done: 40,
      remaining: 10,
      inProgress: 5,
      endDate: '2026-02-15',
    },
    ...overrides,
  };
}

// =============================================================================
// Mock WebSocket Setup
// =============================================================================

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static lastUrl: string = '';

  url: string;
  readyState: number = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.lastUrl = url;
    MockWebSocket.instances.push(this);

    // Simulate async connection
    setTimeout(() => {
      this.readyState = 1; // OPEN
      this.onopen?.();
    }, 0);
  }

  send(data: string) {
    // Mock send - no-op for these tests
  }

  close() {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }

  // Test helpers
  simulateMessage(data: object) {
    if (this.readyState === 1 && this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  simulateClose() {
    this.readyState = 3;
    this.onclose?.();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  MockWebSocket.instances = [];
  MockWebSocket.lastUrl = '';
  (global as any).WebSocket = MockWebSocket;

  // Mock window.location for URL construction
  Object.defineProperty(window, 'location', {
    value: {
      protocol: 'http:',
      host: 'localhost:3000',
    },
    writable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  delete (global as any).WebSocket;
});

// =============================================================================
// WebSocket Connection Tests
// =============================================================================

describe('WebSocket Connection', () => {
  it('should connect to /ws/sprint on mount', async () => {
    const { useSprint } = await import('../src/public/hooks/useSprint');

    renderHook(() => useSprint());

    // Advance timers to allow connection
    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.lastUrl).toBe('ws://localhost:3000/ws/sprint');
  });

  it('should use wss: for https: protocol', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        protocol: 'https:',
        host: 'secure.example.com',
      },
      writable: true,
    });

    const { useSprint } = await import('../src/public/hooks/useSprint');

    renderHook(() => useSprint());

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    expect(MockWebSocket.lastUrl).toBe('wss://secure.example.com/ws/sprint');
  });

  it('should start with isLoading true', async () => {
    const { useSprint } = await import('../src/public/hooks/useSprint');

    const { result } = renderHook(() => useSprint());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should close WebSocket on unmount', async () => {
    const { useSprint } = await import('../src/public/hooks/useSprint');

    const { unmount } = renderHook(() => useSprint());

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const ws = MockWebSocket.instances[0];
    expect(ws.readyState).toBe(1); // OPEN

    unmount();

    expect(ws.readyState).toBe(3); // CLOSED
  });
});

// =============================================================================
// Data Handling Tests
// =============================================================================

describe('Data Handling', () => {
  it('should set data on init message', async () => {
    const { useSprint } = await import('../src/public/hooks/useSprint');

    const { result } = renderHook(() => useSprint());

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const ws = MockWebSocket.instances[0];
    const mockData = createMockSprintData();

    await act(async () => {
      ws.simulateMessage({ type: 'init', ...mockData });
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.sprint.name).toBe('TO Sprint 2606');
    expect(result.current.data?.currentStory?.id).toBe('MSSCI-14209');
  });

  it('should merge partial updates', async () => {
    const { useSprint } = await import('../src/public/hooks/useSprint');

    const { result } = renderHook(() => useSprint());

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const ws = MockWebSocket.instances[0];

    // Send initial data
    await act(async () => {
      ws.simulateMessage({ type: 'init', ...createMockSprintData() });
    });

    expect(result.current.data?.sprint.done).toBe(40);

    // Send partial update
    await act(async () => {
      ws.simulateMessage({
        type: 'update',
        sprint: {
          number: 2606,
          name: 'TO Sprint 2606',
          done: 45, // Updated
          remaining: 5,
          inProgress: 5,
          endDate: '2026-02-15',
        },
      });
    });

    // Should merge, keeping existing fields
    expect(result.current.data?.sprint.done).toBe(45);
    expect(result.current.data?.currentStory?.id).toBe('MSSCI-14209'); // Preserved
  });

  it('should update currentStory on update message', async () => {
    const { useSprint } = await import('../src/public/hooks/useSprint');

    const { result } = renderHook(() => useSprint());

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const ws = MockWebSocket.instances[0];

    await act(async () => {
      ws.simulateMessage({ type: 'init', ...createMockSprintData() });
    });

    expect(result.current.data?.currentStory?.id).toBe('MSSCI-14209');

    await act(async () => {
      ws.simulateMessage({
        type: 'update',
        currentStory: {
          id: 'MSSCI-14210',
          title: 'New Story',
          points: 3,
          status: 'in_progress',
          jiraKey: 'MSSCI-14210',
        },
      });
    });

    expect(result.current.data?.currentStory?.id).toBe('MSSCI-14210');
  });

  it('should ignore messages with unknown type', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { useSprint } = await import('../src/public/hooks/useSprint');

    const { result } = renderHook(() => useSprint());

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const ws = MockWebSocket.instances[0];

    await act(async () => {
      ws.simulateMessage({ type: 'init', ...createMockSprintData() });
    });

    const originalData = result.current.data;

    await act(async () => {
      ws.simulateMessage({ type: 'unknown', foo: 'bar' });
    });

    // Data should be unchanged
    expect(result.current.data).toEqual(originalData);

    consoleSpy.mockRestore();
  });

  it('should handle malformed JSON gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { useSprint } = await import('../src/public/hooks/useSprint');

    const { result } = renderHook(() => useSprint());

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const ws = MockWebSocket.instances[0];

    // Send malformed JSON directly
    await act(async () => {
      ws.onmessage?.({ data: 'not valid json {{{' });
    });

    // Should not crash, should still be loading
    expect(result.current.isLoading).toBe(true);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Error Handling', () => {
  it('should set error on WebSocket error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { useSprint } = await import('../src/public/hooks/useSprint');

    const { result } = renderHook(() => useSprint());

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const ws = MockWebSocket.instances[0];

    await act(async () => {
      ws.simulateError();
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe('WebSocket connection failed');

    consoleSpy.mockRestore();
  });

  it('should clear error on successful data', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { useSprint } = await import('../src/public/hooks/useSprint');

    const { result } = renderHook(() => useSprint());

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const ws = MockWebSocket.instances[0];

    // Trigger error first
    await act(async () => {
      ws.simulateError();
    });

    expect(result.current.error).not.toBeNull();

    // Then receive data
    await act(async () => {
      ws.simulateMessage({ type: 'init', ...createMockSprintData() });
    });

    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);

    consoleSpy.mockRestore();
  });
});

// =============================================================================
// Reconnection Tests
// =============================================================================

describe('Reconnection', () => {
  it('should attempt reconnect after disconnect', async () => {
    const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const { useSprint } = await import('../src/public/hooks/useSprint');

    renderHook(() => useSprint());

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    expect(MockWebSocket.instances).toHaveLength(1);

    const ws = MockWebSocket.instances[0];

    // Simulate disconnect
    await act(async () => {
      ws.simulateClose();
    });

    // Should schedule reconnect after 2000ms
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // New connection should be created
    expect(MockWebSocket.instances).toHaveLength(2);

    consoleSpy.mockRestore();
  });

  it('should not reconnect if unmounted during timeout', async () => {
    const { useSprint } = await import('../src/public/hooks/useSprint');

    const { unmount } = renderHook(() => useSprint());

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const ws = MockWebSocket.instances[0];

    // Simulate disconnect
    await act(async () => {
      ws.simulateClose();
    });

    // Unmount before reconnect timeout
    unmount();

    // Advance past reconnect timeout
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    // Should NOT create new connection
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('should maintain data across reconnection', async () => {
    const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const { useSprint } = await import('../src/public/hooks/useSprint');

    const { result } = renderHook(() => useSprint());

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const ws1 = MockWebSocket.instances[0];

    // Set initial data
    await act(async () => {
      ws1.simulateMessage({ type: 'init', ...createMockSprintData() });
    });

    expect(result.current.data?.sprint.name).toBe('TO Sprint 2606');

    // Simulate disconnect
    await act(async () => {
      ws1.simulateClose();
    });

    // Data should still be present
    expect(result.current.data?.sprint.name).toBe('TO Sprint 2606');

    // Reconnect
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // Data still present after reconnect
    expect(result.current.data?.sprint.name).toBe('TO Sprint 2606');

    consoleSpy.mockRestore();
  });
});

// =============================================================================
// NEW: Extended Type Support (MSSCI-14209)
// =============================================================================

describe('Extended Type Support (MSSCI-14209)', () => {
  it('should handle stories with hasContext field', async () => {
    const { useSprint } = await import('../src/public/hooks/useSprint');

    const { result } = renderHook(() => useSprint());

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const ws = MockWebSocket.instances[0];

    await act(async () => {
      ws.simulateMessage({
        type: 'init',
        ...createMockSprintData(),
        epics: [
          {
            id: 'epic-76',
            title: 'Test Epic',
            jiraKey: 'MSSCI-14186',
            hasContext: true,
            stories: [
              {
                id: 'MSSCI-14209',
                title: 'Story with context',
                points: 5,
                status: 'in_progress',
                jiraKey: 'MSSCI-14209',
                hasContext: true,
              },
              {
                id: 'MSSCI-14210',
                title: 'Story without context',
                points: 3,
                status: 'backlog',
                jiraKey: 'MSSCI-14210',
                hasContext: false,
              },
            ],
          },
        ],
      });
    });

    // This test verifies the hook can receive and store hasContext
    // Will FAIL until types are extended
    const epic = result.current.data?.epics[0];
    expect(epic).toHaveProperty('hasContext', true);
    expect(epic?.stories[0]).toHaveProperty('hasContext', true);
    expect(epic?.stories[1]).toHaveProperty('hasContext', false);
  });

  it('should handle blocked story status', async () => {
    const { useSprint } = await import('../src/public/hooks/useSprint');

    const { result } = renderHook(() => useSprint());

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const ws = MockWebSocket.instances[0];

    await act(async () => {
      ws.simulateMessage({
        type: 'init',
        ...createMockSprintData(),
        epics: [
          {
            id: 'epic-76',
            title: 'Test Epic',
            jiraKey: null,
            stories: [
              {
                id: 'BLOCKED-1',
                title: 'Blocked story',
                points: 3,
                status: 'blocked',
                jiraKey: 'MSSCI-14211',
              },
            ],
          },
        ],
      });
    });

    // Will FAIL until blocked status is added to type
    expect(result.current.data?.epics[0].stories[0].status).toBe('blocked');
  });
});
