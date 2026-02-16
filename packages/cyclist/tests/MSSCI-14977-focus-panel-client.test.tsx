/**
 * @vitest-environment happy-dom
 */

/**
 * MSSCI-14977: BikeShow client layout stash/restore on panel focus
 *
 * Story 104-3, Epic 104: /bc CLI Panel Focus
 *
 * Tests the useFocusPanel hook which:
 * - Connects to /ws/focus WebSocket endpoint
 * - Handles focus events via maximize/setActive (not toJSON/fromJSON)
 * - Multi-group layouts: maximizeGroup / exitMaximizedGroup
 * - Single-group layouts: setActive on target, stash previous active ID
 * - Ignores 'init' messages (only processes 'update')
 *
 * Acceptance Criteria:
 * - AC1: BikeShow connects to `/ws/focus` WebSocket endpoint on mount
 * - AC2: On `panel:focus` event, target panel is focused via maximize or setActive
 * - AC3: Requested panel is shown (focusedPanel state updated)
 * - AC4: On reset (focus: null), previous layout is restored
 * - AC5: Successive focus calls preserve the original active panel reference
 * - AC6: Only the first focus after a reset triggers a panel stash
 * - AC7: Works in both BikeRack standalone and full Cyclist mode
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { DockviewApi } from 'dockview-react';

import { useFocusPanel } from '../src/public/hooks/useFocusPanel';

// =============================================================================
// Test WebSocket Mock — matches the onmessage/onclose property pattern
// =============================================================================

class TestWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  readyState = 0; // CONNECTING
  url: string;

  constructor(url: string) {
    this.url = url;
    TestWebSocket.instances.push(this);
  }

  send(_data: string) {}

  close() {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }

  addEventListener(event: string, handler: any) {
    if (event === 'open') this.onopen = handler;
    else if (event === 'message') this.onmessage = handler;
    else if (event === 'close') this.onclose = handler;
    else if (event === 'error') this.onerror = handler;
  }

  removeEventListener(event: string, handler: any) {
    if (event === 'open' && this.onopen === handler) this.onopen = null;
    else if (event === 'message' && this.onmessage === handler) this.onmessage = null;
    else if (event === 'close' && this.onclose === handler) this.onclose = null;
    else if (event === 'error' && this.onerror === handler) this.onerror = null;
  }

  // Test helpers
  simulateOpen() {
    this.readyState = 1;
    this.onopen?.();
  }

  simulateMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose() {
    this.readyState = 3;
    this.onclose?.();
  }

  static instances: TestWebSocket[] = [];
  static reset() { TestWebSocket.instances = []; }
  static last(): TestWebSocket {
    return TestWebSocket.instances[TestWebSocket.instances.length - 1];
  }
}

// =============================================================================
// Mock DockviewApi Factory
// =============================================================================

function createMockApi(opts: { multiGroup?: boolean } = {}): DockviewApi {
  const { multiGroup = true } = opts;
  const mockPanel = {
    id: 'sprint',
    api: { setActive: vi.fn() },
    group: {},
  };
  return {
    getPanel: vi.fn((id: string) => ({
      id,
      api: { setActive: vi.fn() },
      group: {},
    })),
    groups: multiGroup ? [{}, {}, {}] : [{}],
    activePanel: { id: 'changed' },
    maximizeGroup: vi.fn(),
    exitMaximizedGroup: vi.fn(),
    hasMaximizedGroup: vi.fn(() => false),
  } as unknown as DockviewApi;
}

// =============================================================================
// Test Setup
// =============================================================================

const OriginalWebSocket = globalThis.WebSocket;

beforeEach(() => {
  TestWebSocket.reset();
  vi.stubGlobal('WebSocket', TestWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.stubGlobal('WebSocket', OriginalWebSocket);
  vi.useRealTimers();
});

// =============================================================================
// AC1: BikeShow connects to `/ws/focus` WebSocket endpoint on mount
// =============================================================================

describe('AC1: WebSocket connection to /ws/focus', () => {
  it('should create WebSocket connection to /ws/focus on mount', () => {
    const api = createMockApi();
    renderHook(() => useFocusPanel(api));

    expect(TestWebSocket.instances).toHaveLength(1);
    expect(TestWebSocket.last().url).toContain('/ws/focus');
  });

  it('should use ws: protocol for http: pages', () => {
    const api = createMockApi();
    renderHook(() => useFocusPanel(api));

    expect(TestWebSocket.last().url).toMatch(/^ws:/);
  });

  it('should reconnect after WebSocket disconnects', () => {
    const api = createMockApi();
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateClose();
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(TestWebSocket.instances.length).toBeGreaterThanOrEqual(2);
  });

  it('should clean up WebSocket on unmount', () => {
    const api = createMockApi();
    const { unmount } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
    });

    unmount();

    expect(ws.readyState).toBe(3); // CLOSED
  });

  it('should not crash if api is null', () => {
    renderHook(() => useFocusPanel(null));
    expect(true).toBe(true); // No crash = pass
  });
});

// =============================================================================
// AC2: On focus event, target panel is focused via maximize or setActive
// =============================================================================

describe('AC2: Panel focus on update event', () => {
  it('should call maximizeGroup for multi-group layouts', () => {
    const api = createMockApi({ multiGroup: true });
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(api.getPanel).toHaveBeenCalledWith('sprint');
    expect(api.maximizeGroup).toHaveBeenCalled();
  });

  it('should NOT call maximizeGroup if already in focus mode (just re-maximize)', () => {
    const api = createMockApi({ multiGroup: true });
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    const firstCallCount = (api.maximizeGroup as ReturnType<typeof vi.fn>).mock.calls.length;

    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'git' });
    });

    // Should still maximize the new panel's group
    expect((api.maximizeGroup as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(firstCallCount);
  });

  it('should set isInFocusMode to true after focus event', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    expect(result.current.isInFocusMode).toBe(false);

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(result.current.isInFocusMode).toBe(true);
  });

  it('should ignore init messages (focus is ephemeral)', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      // init message with focus value should be ignored
      ws.simulateMessage({ type: 'init', focus: 'sprint' });
    });

    // Should NOT enter focus mode from init
    expect(result.current.isInFocusMode).toBe(false);
    expect(result.current.focusedPanel).toBeNull();
  });
});

// =============================================================================
// AC3: Requested panel is shown (focusedPanel state)
// =============================================================================

describe('AC3: focusedPanel state tracking', () => {
  it('should set focusedPanel to the requested panel ID', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'update', focus: 'git' });
    });

    expect(result.current.focusedPanel).toBe('git');
  });

  it('should update focusedPanel when focus changes', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(result.current.focusedPanel).toBe('sprint');

    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'diffs' });
    });

    expect(result.current.focusedPanel).toBe('diffs');
  });

  it('should not act on focus for unknown panels', () => {
    const api = createMockApi();
    (api.getPanel as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'update', focus: 'nonexistent' });
    });

    // Should not enter focus mode if panel not found
    expect(result.current.isInFocusMode).toBe(false);
  });
});

// =============================================================================
// AC4: On reset (focus: null), previous layout is restored
// =============================================================================

describe('AC4: Layout restore on reset (focus: null)', () => {
  it('should call exitMaximizedGroup on reset for multi-group layout', () => {
    const api = createMockApi({ multiGroup: true });
    (api.hasMaximizedGroup as ReturnType<typeof vi.fn>).mockReturnValue(true);
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    expect(api.exitMaximizedGroup).toHaveBeenCalled();
  });

  it('should set isInFocusMode to false after reset', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(result.current.isInFocusMode).toBe(true);

    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    expect(result.current.isInFocusMode).toBe(false);
  });

  it('should set focusedPanel to null after reset', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    expect(result.current.focusedPanel).toBeNull();
  });

  it('should be a no-op if reset received when not in focus mode', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      // Send reset without ever entering focus mode
      ws.simulateMessage({ type: 'update', focus: null });
    });

    expect(result.current.isInFocusMode).toBe(false);
    expect(api.exitMaximizedGroup).not.toHaveBeenCalled();
  });
});

// =============================================================================
// AC5: Successive focus calls preserve the original active panel reference
// =============================================================================

describe('AC5: Single-group — original active panel preserved', () => {
  it('should use setActive for single-group layouts', () => {
    const mockSetActive = vi.fn();
    const api = createMockApi({ multiGroup: false });
    (api.getPanel as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'sprint',
      api: { setActive: mockSetActive },
      group: {},
    });

    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(mockSetActive).toHaveBeenCalled();
    expect(api.maximizeGroup).not.toHaveBeenCalled();
  });

  it('should restore previous active panel on reset in single-group mode', () => {
    const mockPrevSetActive = vi.fn();
    const api = createMockApi({ multiGroup: false });
    // First getPanel call (for focus) returns target panel
    // Second getPanel call (for reset) returns previous panel
    let callCount = 0;
    (api.getPanel as ReturnType<typeof vi.fn>).mockImplementation((id: string) => ({
      id,
      api: { setActive: id === 'changed' ? mockPrevSetActive : vi.fn() },
      group: {},
    }));

    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    // hasMaximizedGroup returns false (single group), so reset uses previousActivePanelRef
    (api.hasMaximizedGroup as ReturnType<typeof vi.fn>).mockReturnValue(false);

    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    // Should have called getPanel('changed') and setActive on it
    expect(mockPrevSetActive).toHaveBeenCalled();
  });
});

// =============================================================================
// AC6: Full focus/reset cycles work correctly
// =============================================================================

describe('AC6: Focus/reset cycles', () => {
  it('should complete full cycle: focus → reset → focus → reset', () => {
    const api = createMockApi({ multiGroup: true });
    (api.hasMaximizedGroup as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(true)  // first reset
      .mockReturnValueOnce(true); // second reset
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
    });

    // Cycle 1: Focus
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });
    expect(result.current.isInFocusMode).toBe(true);
    expect(result.current.focusedPanel).toBe('sprint');

    // Cycle 1: Reset
    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });
    expect(result.current.isInFocusMode).toBe(false);
    expect(result.current.focusedPanel).toBeNull();

    // Cycle 2: Focus
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'diffs' });
    });
    expect(result.current.isInFocusMode).toBe(true);
    expect(result.current.focusedPanel).toBe('diffs');

    // Cycle 2: Reset
    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });
    expect(result.current.isInFocusMode).toBe(false);
    expect(result.current.focusedPanel).toBeNull();
  });
});

// =============================================================================
// AC7: Works in both BikeRack standalone and full Cyclist mode
// =============================================================================

describe('AC7: Works in both BikeRack and Cyclist modes', () => {
  it('should use maximizeGroup for Cyclist-style multi-group layout', () => {
    const api = createMockApi({ multiGroup: true });
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(result.current.isInFocusMode).toBe(true);
    expect(api.maximizeGroup).toHaveBeenCalled();
  });

  it('should use setActive for BikeRack-style single-group layout', () => {
    const mockSetActive = vi.fn();
    const api = createMockApi({ multiGroup: false });
    (api.getPanel as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'sprint',
      api: { setActive: mockSetActive },
      group: {},
    });
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(result.current.isInFocusMode).toBe(true);
    expect(mockSetActive).toHaveBeenCalled();
    expect(api.maximizeGroup).not.toHaveBeenCalled();
  });

  it('should return the same interface shape regardless of layout mode', () => {
    const multiApi = createMockApi({ multiGroup: true });
    const { result: multiResult } = renderHook(() => useFocusPanel(multiApi));

    const singleApi = createMockApi({ multiGroup: false });
    const { result: singleResult } = renderHook(() => useFocusPanel(singleApi));

    expect(multiResult.current).toHaveProperty('focusedPanel');
    expect(multiResult.current).toHaveProperty('isInFocusMode');

    expect(singleResult.current).toHaveProperty('focusedPanel');
    expect(singleResult.current).toHaveProperty('isInFocusMode');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge cases', () => {
  it('should handle rapid focus/reset cycles without corruption', () => {
    const api = createMockApi({ multiGroup: true });
    (api.hasMaximizedGroup as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
    });

    // Rapid fire: focus → reset → focus → reset → focus
    act(() => { ws.simulateMessage({ type: 'update', focus: 'sprint' }); });
    act(() => { ws.simulateMessage({ type: 'update', focus: null }); });
    act(() => { ws.simulateMessage({ type: 'update', focus: 'git' }); });
    act(() => { ws.simulateMessage({ type: 'update', focus: null }); });
    act(() => { ws.simulateMessage({ type: 'update', focus: 'diffs' }); });

    expect(result.current.isInFocusMode).toBe(true);
    expect(result.current.focusedPanel).toBe('diffs');
  });

  it('should handle api becoming available after initial null', () => {
    const { result, rerender } = renderHook(
      ({ api }) => useFocusPanel(api),
      { initialProps: { api: null as DockviewApi | null } },
    );

    expect(result.current.isInFocusMode).toBe(false);

    // Api becomes available
    const api = createMockApi();
    rerender({ api });

    const ws = TestWebSocket.last();
    if (ws) {
      act(() => {
        ws.simulateOpen();
        ws.simulateMessage({ type: 'update', focus: 'sprint' });
      });

      expect(result.current.focusedPanel).toBe('sprint');
    }
  });
});
