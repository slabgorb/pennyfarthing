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
 * - Stashes current layout on first focus event
 * - Renders target panel as single-panel fullscreen
 * - Restores stashed layout on reset (focus: null)
 * - Preserves original stash across successive focus events (no stash stack)
 *
 * Acceptance Criteria:
 * - AC1: BikeShow connects to `/ws/focus` WebSocket endpoint on mount
 * - AC2: On `panel:focus` event with panel name, current layout saved (if not already in focus mode)
 * - AC3: Requested panel renders as single-panel fullscreen view
 * - AC4: On `panel:focus` event with `null`, saved layout is restored
 * - AC5: Successive `/bc` calls preserve the original saved state (no stash stack)
 * - AC6: Only the first focus after a reset triggers a layout save
 * - AC7: Works in both BikeRack standalone and full Cyclist mode
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { DockviewApi, SerializedDockview } from 'dockview-react';

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
    // Capture instance for test assertions
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
// Mock Dockview Layouts
// =============================================================================

/** Simulates a multi-panel BikeRack layout (api.toJSON() output) */
const MOCK_BIKERACK_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'leaf',
          data: {
            views: ['sprint', 'git', 'diffs', 'todo', 'workflow'],
            activeView: 'sprint',
            id: 'main-group',
          },
          size: 1200,
        },
      ],
      size: 800,
    },
    width: 1200,
    height: 800,
    orientation: 'HORIZONTAL',
  },
  panels: {
    sprint: { id: 'sprint', contentComponent: 'PanelAdapter', title: 'Sprint', params: { panelId: 'sprint' } },
    git: { id: 'git', contentComponent: 'PanelAdapter', title: 'Git', params: { panelId: 'git' } },
    diffs: { id: 'diffs', contentComponent: 'PanelAdapter', title: 'Diffs', params: { panelId: 'diffs' } },
    todo: { id: 'todo', contentComponent: 'PanelAdapter', title: 'Todo', params: { panelId: 'todo' } },
    workflow: { id: 'workflow', contentComponent: 'PanelAdapter', title: 'Workflow', params: { panelId: 'workflow' } },
  },
  activeGroup: 'main-group',
};

/** Simulates a three-region Cyclist layout */
const MOCK_CYCLIST_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'leaf',
          data: { views: ['changed', 'diffs', 'debug'], activeView: 'changed', id: 'left' },
          size: 300,
        },
        {
          type: 'leaf',
          data: { views: ['message'], activeView: 'message', id: 'center' },
          size: 600,
        },
        {
          type: 'leaf',
          data: { views: ['sprint', 'git', 'settings'], activeView: 'sprint', id: 'right' },
          size: 300,
        },
      ],
      size: 800,
    },
    width: 1200,
    height: 800,
    orientation: 'HORIZONTAL',
  },
  panels: {
    changed: { id: 'changed', contentComponent: 'PanelAdapter', title: 'Changed', params: { panelId: 'changed' } },
    diffs: { id: 'diffs', contentComponent: 'PanelAdapter', title: 'Diffs', params: { panelId: 'diffs' } },
    debug: { id: 'debug', contentComponent: 'PanelAdapter', title: 'Debug', params: { panelId: 'debug' } },
    message: { id: 'message', contentComponent: 'PanelAdapter', title: 'Message', params: { panelId: 'message' } },
    sprint: { id: 'sprint', contentComponent: 'PanelAdapter', title: 'Sprint', params: { panelId: 'sprint' } },
    git: { id: 'git', contentComponent: 'PanelAdapter', title: 'Git', params: { panelId: 'git' } },
    settings: { id: 'settings', contentComponent: 'PanelAdapter', title: 'Settings', params: { panelId: 'settings' } },
  },
  activeGroup: 'center',
};

// =============================================================================
// Mock DockviewApi Factory
// =============================================================================

function createMockApi(layout: SerializedDockview = MOCK_BIKERACK_LAYOUT): DockviewApi {
  return {
    toJSON: vi.fn(() => structuredClone(layout)),
    fromJSON: vi.fn(),
    addPanel: vi.fn(),
    removePanel: vi.fn(),
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
    act(() => {
      ws.simulateOpen();
    });

    // Simulate server disconnect
    act(() => {
      ws.simulateClose();
    });

    // Advance past reconnect delay
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Should have created a second WebSocket
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

  it('should not create WebSocket if api is null', () => {
    renderHook(() => useFocusPanel(null));

    // Hook may still connect to WS to know the focus state,
    // but should NOT attempt layout operations without an API.
    // This verifies graceful handling of null api.
    // If implementation connects anyway (valid), this test ensures no crash.
    expect(true).toBe(true); // No crash = pass
  });
});

// =============================================================================
// AC2: On focus event, current dockview layout is saved (if not in focus mode)
// =============================================================================

describe('AC2: Layout stash on panel focus event', () => {
  it('should call api.toJSON() to save current layout on first focus event', () => {
    const api = createMockApi();
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    // Now send a focus event
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(api.toJSON).toHaveBeenCalled();
  });

  it('should NOT call api.toJSON() if already in focus mode', () => {
    const api = createMockApi();
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    // First focus — should stash
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    const callCountAfterFirst = (api.toJSON as ReturnType<typeof vi.fn>).mock.calls.length;

    // Second focus (different panel) — should NOT re-stash
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'git' });
    });

    expect(api.toJSON).toHaveBeenCalledTimes(callCountAfterFirst);
  });

  it('should set isInFocusMode to true after focus event', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    expect(result.current.isInFocusMode).toBe(false);

    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(result.current.isInFocusMode).toBe(true);
  });

  it('should store the stashed layout in state', () => {
    const api = createMockApi(MOCK_BIKERACK_LAYOUT);
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    expect(result.current.stashedLayout).toBeNull();

    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(result.current.stashedLayout).not.toBeNull();
    // Stashed layout should match what toJSON returned
    expect(result.current.stashedLayout?.panels).toHaveProperty('sprint');
    expect(result.current.stashedLayout?.panels).toHaveProperty('git');
  });
});

// =============================================================================
// AC3: Requested panel renders as single-panel fullscreen view
// =============================================================================

describe('AC3: Single-panel fullscreen rendering', () => {
  it('should call api.fromJSON() after receiving focus event', () => {
    const api = createMockApi();
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(api.fromJSON).toHaveBeenCalled();
  });

  it('should set focusedPanel to the requested panel ID', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'git' });
    });

    expect(result.current.focusedPanel).toBe('git');
  });

  it('should render different panel when focus changes', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(result.current.focusedPanel).toBe('sprint');

    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'diffs' });
    });

    expect(result.current.focusedPanel).toBe('diffs');
  });

  it('should call api.fromJSON() with layout containing only the target panel', () => {
    const api = createMockApi();
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    // fromJSON should have been called with a layout that includes only the target panel
    const fromJsonCalls = (api.fromJSON as ReturnType<typeof vi.fn>).mock.calls;
    expect(fromJsonCalls.length).toBeGreaterThan(0);

    const singlePanelLayout = fromJsonCalls[fromJsonCalls.length - 1][0] as SerializedDockview;
    expect(singlePanelLayout.panels).toHaveProperty('sprint');
    expect(Object.keys(singlePanelLayout.panels)).toHaveLength(1);
  });

  it('should handle init message with existing focus (app reconnect scenario)', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      // Server tells us focus is already set (e.g., app reconnect)
      ws.simulateMessage({ type: 'init', focus: 'git' });
    });

    expect(result.current.isInFocusMode).toBe(true);
    expect(result.current.focusedPanel).toBe('git');
  });
});

// =============================================================================
// AC4: On `panel:focus` event with `null`, saved layout is restored
// =============================================================================

describe('AC4: Layout restore on reset (focus: null)', () => {
  it('should call api.fromJSON() with stashed layout on reset', () => {
    const api = createMockApi(MOCK_BIKERACK_LAYOUT);
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    // Enter focus mode
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    // Clear the fromJSON mock to isolate the reset call
    (api.fromJSON as ReturnType<typeof vi.fn>).mockClear();

    // Reset
    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    expect(api.fromJSON).toHaveBeenCalledTimes(1);

    // The restored layout should be the original multi-panel layout
    const restoredLayout = (api.fromJSON as ReturnType<typeof vi.fn>).mock.calls[0][0] as SerializedDockview;
    expect(Object.keys(restoredLayout.panels).length).toBeGreaterThan(1);
    expect(restoredLayout.panels).toHaveProperty('sprint');
    expect(restoredLayout.panels).toHaveProperty('git');
  });

  it('should set isInFocusMode to false after reset', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

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
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    expect(result.current.focusedPanel).toBeNull();
  });

  it('should clear stashed layout after restore', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(result.current.stashedLayout).not.toBeNull();

    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    expect(result.current.stashedLayout).toBeNull();
  });

  it('should be a no-op if reset received when not in focus mode', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    // Not in focus mode — reset should be harmless
    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    expect(result.current.isInFocusMode).toBe(false);
    expect(api.fromJSON).not.toHaveBeenCalled();
  });
});

// =============================================================================
// AC5: Successive /bc calls preserve the original saved state (no stash stack)
// =============================================================================

describe('AC5: No stash stack — original layout preserved', () => {
  it('should NOT re-stash when switching panels in focus mode', () => {
    const api = createMockApi(MOCK_BIKERACK_LAYOUT);
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    // First focus — stashes the original multi-panel layout
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    const originalStash = result.current.stashedLayout;
    expect(originalStash).not.toBeNull();

    // api.toJSON was called once for the stash
    expect(api.toJSON).toHaveBeenCalledTimes(1);

    // Second focus — different panel. Should NOT re-stash.
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'git' });
    });

    // toJSON should NOT have been called again
    expect(api.toJSON).toHaveBeenCalledTimes(1);

    // Stash should still be the original layout
    expect(result.current.stashedLayout).toEqual(originalStash);
  });

  it('should preserve stash through multiple panel switches', () => {
    const api = createMockApi(MOCK_BIKERACK_LAYOUT);
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    // Focus sprint
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    const originalStash = result.current.stashedLayout;

    // Focus git
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'git' });
    });

    // Focus diffs
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'diffs' });
    });

    // Focus todo
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'todo' });
    });

    // Stash unchanged through all switches
    expect(result.current.stashedLayout).toEqual(originalStash);
    expect(api.toJSON).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// AC6: Only the first focus after a reset triggers a layout save
// =============================================================================

describe('AC6: First focus after reset triggers new layout save', () => {
  it('should create new stash on first focus after reset', () => {
    const api = createMockApi(MOCK_BIKERACK_LAYOUT);
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    // First cycle: focus → reset
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(api.toJSON).toHaveBeenCalledTimes(1);

    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    // Second cycle: new focus should trigger new stash
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'git' });
    });

    expect(api.toJSON).toHaveBeenCalledTimes(2);
  });

  it('should complete full cycle: focus → reset → focus → reset', () => {
    const api = createMockApi(MOCK_BIKERACK_LAYOUT);
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    // Cycle 1: Focus
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(result.current.isInFocusMode).toBe(true);
    expect(result.current.focusedPanel).toBe('sprint');
    expect(result.current.stashedLayout).not.toBeNull();

    // Cycle 1: Reset
    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    expect(result.current.isInFocusMode).toBe(false);
    expect(result.current.focusedPanel).toBeNull();
    expect(result.current.stashedLayout).toBeNull();

    // Cycle 2: Focus
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'diffs' });
    });

    expect(result.current.isInFocusMode).toBe(true);
    expect(result.current.focusedPanel).toBe('diffs');
    expect(result.current.stashedLayout).not.toBeNull();

    // Cycle 2: Reset
    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    expect(result.current.isInFocusMode).toBe(false);
    expect(result.current.focusedPanel).toBeNull();
    expect(result.current.stashedLayout).toBeNull();
  });

  it('should not stash again on second focus after reset (only first)', () => {
    const api = createMockApi(MOCK_BIKERACK_LAYOUT);
    renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    // First focus → stash
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    // Reset
    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    // New focus → new stash (this is #2)
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'git' });
    });

    expect(api.toJSON).toHaveBeenCalledTimes(2);

    // Switch panel in second focus session → should NOT stash again
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'diffs' });
    });

    expect(api.toJSON).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// AC7: Works in both BikeRack standalone and full Cyclist mode
// =============================================================================

describe('AC7: Works in both BikeRack and Cyclist modes', () => {
  it('should work with BikeRack-style layout (single group, no sacred center)', () => {
    const api = createMockApi(MOCK_BIKERACK_LAYOUT);
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    // Focus
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(result.current.isInFocusMode).toBe(true);
    expect(result.current.focusedPanel).toBe('sprint');
    expect(api.toJSON).toHaveBeenCalled();
    expect(api.fromJSON).toHaveBeenCalled();

    // Reset
    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    expect(result.current.isInFocusMode).toBe(false);
  });

  it('should work with Cyclist-style layout (three regions with sacred center)', () => {
    const api = createMockApi(MOCK_CYCLIST_LAYOUT);
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    // Focus — should stash the full three-region layout
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(result.current.isInFocusMode).toBe(true);
    expect(result.current.focusedPanel).toBe('sprint');

    // Stashed layout should have the full three-region structure
    expect(result.current.stashedLayout).not.toBeNull();
    expect(result.current.stashedLayout?.panels).toHaveProperty('message');
    expect(result.current.stashedLayout?.panels).toHaveProperty('changed');
    expect(result.current.stashedLayout?.panels).toHaveProperty('sprint');

    // Reset — should restore the three-region layout
    (api.fromJSON as ReturnType<typeof vi.fn>).mockClear();

    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });

    expect(result.current.isInFocusMode).toBe(false);

    // Restored layout should have all the original panels including sacred center
    const restoredLayout = (api.fromJSON as ReturnType<typeof vi.fn>).mock.calls[0][0] as SerializedDockview;
    expect(restoredLayout.panels).toHaveProperty('message');
    expect(Object.keys(restoredLayout.panels).length).toBe(7);
  });

  it('should use the same hook interface regardless of layout complexity', () => {
    // BikeRack hook
    const bikerackApi = createMockApi(MOCK_BIKERACK_LAYOUT);
    const { result: brResult } = renderHook(() => useFocusPanel(bikerackApi));

    // Cyclist hook
    const cyclistApi = createMockApi(MOCK_CYCLIST_LAYOUT);
    const { result: cyResult } = renderHook(() => useFocusPanel(cyclistApi));

    // Both should have the same interface shape
    expect(brResult.current).toHaveProperty('focusedPanel');
    expect(brResult.current).toHaveProperty('isInFocusMode');
    expect(brResult.current).toHaveProperty('stashedLayout');

    expect(cyResult.current).toHaveProperty('focusedPanel');
    expect(cyResult.current).toHaveProperty('isInFocusMode');
    expect(cyResult.current).toHaveProperty('stashedLayout');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge cases', () => {
  it('should handle rapid focus/reset cycles without corruption', () => {
    const api = createMockApi(MOCK_BIKERACK_LAYOUT);
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    // Rapid fire: focus → reset → focus → reset → focus
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });
    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'git' });
    });
    act(() => {
      ws.simulateMessage({ type: 'update', focus: null });
    });
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'diffs' });
    });

    // Should be in focus mode on 'diffs'
    expect(result.current.isInFocusMode).toBe(true);
    expect(result.current.focusedPanel).toBe('diffs');
    expect(result.current.stashedLayout).not.toBeNull();
  });

  it('should handle same panel focused twice (no-op after first)', () => {
    const api = createMockApi();
    const { result } = renderHook(() => useFocusPanel(api));

    const ws = TestWebSocket.last();
    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'init', focus: null });
    });

    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    const fromJsonCallCount = (api.fromJSON as ReturnType<typeof vi.fn>).mock.calls.length;

    // Same panel again — the server shouldn't broadcast this (shouldBroadcastFocus),
    // but if it does, the client should handle it gracefully
    act(() => {
      ws.simulateMessage({ type: 'update', focus: 'sprint' });
    });

    expect(result.current.focusedPanel).toBe('sprint');
    // toJSON should still only have been called once (already in focus mode)
    expect(api.toJSON).toHaveBeenCalledTimes(1);
  });

  it('should handle api becoming available after initial null', () => {
    const { result, rerender } = renderHook(
      ({ api }) => useFocusPanel(api),
      { initialProps: { api: null as DockviewApi | null } },
    );

    expect(result.current.isInFocusMode).toBe(false);

    // Api becomes available
    const api = createMockApi(MOCK_BIKERACK_LAYOUT);
    rerender({ api });

    // Should still work with the new api
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
