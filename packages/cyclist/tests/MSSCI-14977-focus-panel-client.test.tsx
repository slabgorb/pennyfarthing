/**
 * @vitest-environment happy-dom
 */

/**
 * MSSCI-14977: BikeShow client panel focus via native Dockview maximize/setActive
 *
 * Story 104-3, Epic 104: /bc CLI Panel Focus
 *
 * Tests the useFocusPanel hook which:
 * - Connects to /ws/focus WebSocket endpoint
 * - On `update` messages: uses maximizeGroup (multi-group) or setActive (single-group)
 * - Ignores `init` messages (focus is ephemeral, not persistent)
 * - Resets via exitMaximizedGroup (multi-group) or restoring previous active tab (single-group)
 * - Returns { focusedPanel, isInFocusMode }
 *
 * Acceptance Criteria:
 * - AC1: BikeShow connects to `/ws/focus` WebSocket endpoint on mount
 * - AC2: On `update` with panel name, panel is focused via native Dockview APIs
 * - AC3: Requested panel activates in focus mode
 * - AC4: On `update` with `null`, focus is reset via native Dockview APIs
 * - AC5: Successive focus calls update the focused panel without stash corruption
 * - AC6: Full focus/reset cycles work correctly
 * - AC7: Works in both BikeRack (single-group) and Cyclist (multi-group) mode
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { DockviewApi } from 'dockview-react';

import { useFocusPanel } from '../src/public/hooks/useFocusPanel';

// =============================================================================
// Test WebSocket Mock — explicit control over events
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

  send(_data: string) {
    // No-op
  }

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
    this.readyState = 1; // OPEN
    this.onopen?.();
  }

  simulateMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose() {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }

  // Static instance tracking
  static instances: TestWebSocket[] = [];
  static reset() {
    TestWebSocket.instances = [];
  }
  static last(): TestWebSocket {
    return TestWebSocket.instances[TestWebSocket.instances.length - 1];
  }
}

// =============================================================================
// Mock DockviewApi Factory
// =============================================================================

interface MockPanelApi {
  setActive: ReturnType<typeof vi.fn>;
}

interface MockPanel {
  id: string;
  api: MockPanelApi;
}

/**
 * Creates a mock DockviewApi with the native methods the hook actually uses:
 * - getPanel(id) - returns a mock panel with api.setActive()
 * - groups - array (length > 1 means multi-group/Cyclist mode)
 * - maximizeGroup(panel) - used for multi-group focus
 * - exitMaximizedGroup() - used for multi-group reset
 * - hasMaximizedGroup() - returns true if currently maximized
 * - activePanel - the currently active panel
 */
function createMockApi(opts: {
  panelIds?: string[];
  multiGroup?: boolean;
} = {}): DockviewApi {
  const { panelIds = ['sprint', 'git', 'diffs', 'todo', 'workflow'], multiGroup = false } = opts;

  let maximized = false;

  const panels: Record<string, MockPanel> = {};
  for (const id of panelIds) {
    panels[id] = { id, api: { setActive: vi.fn() } };
  }

  const groups = multiGroup
    ? [{ id: 'left' }, { id: 'center' }, { id: 'right' }]
    : [{ id: 'main-group' }];

  return {
    getPanel: vi.fn((id: string) => panels[id] ?? null),
    groups,
    activePanel: panels[panelIds[0]] ?? null,
    maximizeGroup: vi.fn(() => { maximized = true; }),
    exitMaximizedGroup: vi.fn(() => { maximized = false; }),
    hasMaximizedGroup: vi.fn(() => maximized),
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
    // happy-dom default is http:
    renderHook(() => useFocusPanel(api));

    expect(TestWebSocket.last().url).toMatch(/^ws:/);
  });

  it('should reconnect after WebSocket disconnects', () => {
    const api = createMockApi();
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();

    // Simulate server disconnect (onclose triggers reconnect)
    act(() => {
      ws.simulateClose();
    });

    // Advance past reconnect delay (2000ms in the implementation)
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Should have created a second WebSocket
    expect(TestWebSocket.instances.length).toBeGreaterThanOrEqual(2);
  });

  it('should clean up WebSocket on unmount', () => {
    const api = createMockApi();
    const { unmount } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();

    unmount();

    expect(ws.readyState).toBe(3); // CLOSED
  });

  it('should not crash if api is null', () => {
    renderHook(() => useFocusPanel(null));

    // Hook still creates a WebSocket connection to track focus state,
    // but won't perform layout operations without an API.
    // No crash = pass
    expect(true).toBe(true);
  });
});

// =============================================================================
// AC2: On update event, panel is focused via native Dockview APIs
// =============================================================================

describe('AC2: Panel focus via native Dockview on update event', () => {
  it('should call maximizeGroup on focus event in multi-group layout', () => {
    const api = createMockApi({ multiGroup: true });
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(api.maximizeGroup).toHaveBeenCalled();
  });

  it('should call panel.api.setActive() on focus event in single-group layout', () => {
    const api = createMockApi({ multiGroup: false });
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    const panel = (api.getPanel as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(panel.api.setActive).toHaveBeenCalled();
  });

  it('should set isInFocusMode to true after focus event', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    expect(result.current.isInFocusMode).toBe(false);

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(result.current.isInFocusMode).toBe(true);
  });

  it('should ignore init messages entirely', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();

    // Send an init message with a focus value - hook should ignore it
    act(() => {
      ws.simulateMessage({ type: 'init', focus: 'git' });
    });

    expect(result.current.isInFocusMode).toBe(false);
    expect(result.current.focusedPanel).toBeNull();
    expect(api.maximizeGroup).not.toHaveBeenCalled();
  });

  it('should not call any API methods if getPanel returns null (unknown panel)', () => {
    const api = createMockApi({ panelIds: ['sprint', 'git'] });
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'nonexistent' });
    });

    // getPanel returned null, so no focus operations should happen
    expect(api.maximizeGroup).not.toHaveBeenCalled();
  });
});

// =============================================================================
// AC3: Requested panel activates in focus mode
// =============================================================================

describe('AC3: Single-panel focus activation', () => {
  it('should set focusedPanel to the requested panel ID', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'git' });
    });

    expect(result.current.focusedPanel).toBe('git');
  });

  it('should update focusedPanel when focus changes to a different panel', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(result.current.focusedPanel).toBe('sprint');

    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'diffs' });
    });

    expect(result.current.focusedPanel).toBe('diffs');
  });

  it('should call getPanel with the target panel ID', () => {
    const api = createMockApi();
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(api.getPanel).toHaveBeenCalledWith('sprint');
  });
});

// =============================================================================
// AC4: On update with null, focus is reset via native Dockview APIs
// =============================================================================

describe('AC4: Focus reset on null', () => {
  it('should call exitMaximizedGroup on reset in multi-group layout', () => {
    const api = createMockApi({ multiGroup: true });
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();

    // Enter focus mode
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    // Reset
    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    expect(api.exitMaximizedGroup).toHaveBeenCalled();
  });

  it('should restore previous active panel on reset in single-group layout', () => {
    const panelIds = ['sprint', 'git', 'diffs'];
    const api = createMockApi({ panelIds, multiGroup: false });
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();

    // Enter focus mode (activePanel is 'sprint' by default in mock)
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'git' });
    });

    // Reset - should restore previous active panel
    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    // getPanel should have been called with the previously active panel ID to restore it
    const getPanelCalls = (api.getPanel as ReturnType<typeof vi.fn>).mock.calls;
    const lastCall = getPanelCalls[getPanelCalls.length - 1];
    expect(lastCall[0]).toBe('sprint'); // restoring the original active panel
  });

  it('should set isInFocusMode to false after reset', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
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
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    expect(result.current.focusedPanel).toBeNull();
  });

  it('should be a no-op if reset received when not in focus mode (single-group)', () => {
    const api = createMockApi({ multiGroup: false });
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();

    // Not in focus mode — reset should be harmless
    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    expect(result.current.isInFocusMode).toBe(false);
    // hasMaximizedGroup returns false, and no previousActivePanelRef, so nothing happens
    expect(api.exitMaximizedGroup).not.toHaveBeenCalled();
  });
});

// =============================================================================
// AC5: Successive focus calls update correctly
// =============================================================================

describe('AC5: Successive focus calls', () => {
  it('should update focusedPanel on successive focus changes', () => {
    const api = createMockApi({ multiGroup: true });
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();

    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });
    expect(result.current.focusedPanel).toBe('sprint');

    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'git' });
    });
    expect(result.current.focusedPanel).toBe('git');

    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'diffs' });
    });
    expect(result.current.focusedPanel).toBe('diffs');

    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'todo' });
    });
    expect(result.current.focusedPanel).toBe('todo');

    expect(result.current.isInFocusMode).toBe(true);
  });

  it('should call maximizeGroup for each successive focus in multi-group mode', () => {
    const api = createMockApi({ multiGroup: true });
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();

    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'git' });
    });

    // maximizeGroup called for each focus
    expect(api.maximizeGroup).toHaveBeenCalledTimes(2);
  });

  it('should only stash previousActivePanel once in single-group mode', () => {
    const api = createMockApi({ multiGroup: false });
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();

    // First focus stashes the active panel
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'git' });
    });

    // Second focus should NOT overwrite the stashed panel
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'diffs' });
    });

    // Reset should restore the original active panel, not 'git'
    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    const getPanelCalls = (api.getPanel as ReturnType<typeof vi.fn>).mock.calls;
    const lastCall = getPanelCalls[getPanelCalls.length - 1];
    expect(lastCall[0]).toBe('sprint'); // the original activePanel
  });
});

// =============================================================================
// AC6: Full focus/reset cycles work correctly
// =============================================================================

describe('AC6: Full focus/reset cycles', () => {
  it('should complete full cycle: focus then reset', () => {
    const api = createMockApi({ multiGroup: true });
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();

    // Focus
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });
    expect(result.current.isInFocusMode).toBe(true);
    expect(result.current.focusedPanel).toBe('sprint');

    // Reset
    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });
    expect(result.current.isInFocusMode).toBe(false);
    expect(result.current.focusedPanel).toBeNull();
  });

  it('should complete multiple focus/reset cycles', () => {
    const api = createMockApi({ multiGroup: true });
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();

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

  it('should call maximizeGroup and exitMaximizedGroup in each cycle', () => {
    const api = createMockApi({ multiGroup: true });
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();

    // Cycle 1
    act(() => { ws.simulateMessage({ type: 'update', focus: 'sprint' }); });
    act(() => { ws.simulateMessage({ type: 'update', focus: null }); });

    // Cycle 2
    act(() => { ws.simulateMessage({ type: 'update', focus: 'git' }); });
    act(() => { ws.simulateMessage({ type: 'update', focus: null }); });

    expect(api.maximizeGroup).toHaveBeenCalledTimes(2);
    expect(api.exitMaximizedGroup).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// AC7: Works in both BikeRack (single-group) and Cyclist (multi-group) mode
// =============================================================================

describe('AC7: Works in both BikeRack and Cyclist modes', () => {
  it('should work with single-group layout (BikeRack) using setActive', () => {
    const api = createMockApi({ multiGroup: false });
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();

    // Focus
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(result.current.isInFocusMode).toBe(true);
    expect(result.current.focusedPanel).toBe('sprint');

    // Should NOT use maximize (single group)
    expect(api.maximizeGroup).not.toHaveBeenCalled();

    // Should use setActive
    const panel = (api.getPanel as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(panel.api.setActive).toHaveBeenCalled();

    // Reset
    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    expect(result.current.isInFocusMode).toBe(false);
    expect(api.exitMaximizedGroup).not.toHaveBeenCalled();
  });

  it('should work with multi-group layout (Cyclist) using maximizeGroup', () => {
    const panelIds = ['changed', 'diffs', 'debug', 'message', 'sprint', 'git', 'settings'];
    const api = createMockApi({ panelIds, multiGroup: true });
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();

    // Focus
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(result.current.isInFocusMode).toBe(true);
    expect(result.current.focusedPanel).toBe('sprint');

    // Should use maximizeGroup
    expect(api.maximizeGroup).toHaveBeenCalled();

    // Reset
    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    expect(result.current.isInFocusMode).toBe(false);
    expect(api.exitMaximizedGroup).toHaveBeenCalled();
  });

  it('should use the same hook interface regardless of layout mode', () => {
    // BikeRack hook (single group)
    const bikerackApi = createMockApi({ multiGroup: false });
    const { result: brResult } = renderHook(() => useFocusPanel(bikerackApi));

    // Cyclist hook (multi group)
    const cyclistApi = createMockApi({ multiGroup: true });
    const { result: cyResult } = renderHook(() => useFocusPanel(cyclistApi));

    // Both should have the same interface shape
    expect(brResult.current).toHaveProperty('focusedPanel');
    expect(brResult.current).toHaveProperty('isInFocusMode');

    expect(cyResult.current).toHaveProperty('focusedPanel');
    expect(cyResult.current).toHaveProperty('isInFocusMode');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge cases', () => {
  it('should handle rapid focus/reset cycles without corruption', () => {
    const api = createMockApi({ multiGroup: true });
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();

    // Rapid fire: focus -> reset -> focus -> reset -> focus
    act(() => { ws.simulateMessage({ type: 'update', focus: 'sprint' }); });
    act(() => { ws.simulateMessage({ type: 'update', focus: null }); });
    act(() => { ws.simulateMessage({ type: 'update', focus: 'git' }); });
    act(() => { ws.simulateMessage({ type: 'update', focus: null }); });
    act(() => { ws.simulateMessage({ type: 'update', focus: 'diffs' }); });

    // Should be in focus mode on 'diffs'
    expect(result.current.isInFocusMode).toBe(true);
    expect(result.current.focusedPanel).toBe('diffs');
  });

  it('should handle same panel focused twice gracefully', () => {
    const api = createMockApi({ multiGroup: true });
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();

    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    // Same panel again — should still work, panel stays focused
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(result.current.focusedPanel).toBe('sprint');
    expect(result.current.isInFocusMode).toBe(true);
  });

  it('should handle api becoming available after initial null', () => {
    const { result, rerender } = renderHook(
      ({ api }) => useFocusPanel(api),
      { initialProps: { api: null as DockviewApi | null } },
    );

    expect(result.current.isInFocusMode).toBe(false);

    // Api becomes available — hook uses apiRef so it picks up the new value
    const api = createMockApi({ multiGroup: true });
    rerender({ api });

    // Send an update message — should now work with the new api
    const ws = TestWebSocket.last();
    if (ws) {
      act(() => {
        ws.simulateMessage({ type: 'update', focus: 'sprint' });
      });

      expect(result.current.focusedPanel).toBe('sprint');
    }
  });

  it('should gracefully handle null api when focus message arrives', () => {
    const { result } = renderHook(() => useFocusPanel(null));

    const ws = TestWebSocket.last();
    if (ws) {
      // Should not crash
      act(() => {
        ws.simulateMessage({ type: 'update', focus: 'sprint' });
      });

      // State should remain unfocused since no API to operate on
      expect(result.current.isInFocusMode).toBe(false);
      expect(result.current.focusedPanel).toBeNull();
    }
  });

  it('should handle malformed WebSocket messages without crashing', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();

    // Send invalid JSON
    act(() => {
      ws.onmessage?.({ data: 'not valid json' });
    });

    // State should remain unchanged
    expect(result.current.isInFocusMode).toBe(false);
    expect(result.current.focusedPanel).toBeNull();
  });
});
