/**
 * MSSCI-12706: Layout Persistence Tests
 *
 * Tests for the layout persistence system that saves/restores panel layouts.
 * Story: MSSCI-12706 - Layout Persistence
 * Epic: epic-70 (Flexible Workspace)
 *
 * Updated to use native Dockview SerializedDockview format.
 *
 * Requirements:
 * - Save layout state to config.local.yaml on change
 * - Restore layout on startup
 * - Save complete Dockview state (grid, panels, active groups)
 * - Independent layouts per project
 * - Graceful handling of corrupted/missing config
 * - Debounced autosave
 *
 * Acceptance Criteria:
 * - AC1: Layout state saved to `.pennyfarthing/config.local.yaml` on change
 * - AC2: Layout state restored on app startup
 * - AC3: Saved state uses native Dockview SerializedDockview format
 * - AC4: Each project maintains independent layout (via REST API context)
 * - AC5: Graceful handling of corrupted/missing layout config
 * - AC6: Layout changes trigger autosave (debounced)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

// Hook to be implemented
import { useLayoutPersistence } from '../src/public/hooks/useLayoutPersistence';
import type { SerializedDockview } from 'dockview-react';

// ============================================================================
// Mock Setup - REST API based
// ============================================================================

// Mock fetch for REST API calls
const mockFetch = vi.fn();

beforeEach(() => {
  global.fetch = mockFetch;
  mockFetch.mockReset();
  // Default: return null layout (first-time user)
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ layout: null }),
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================================
// Test Fixtures - Native Dockview SerializedDockview format
// ============================================================================

// Mock native Dockview layout (matches api.toJSON() output)
const mockNativeDockviewLayout: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'leaf',
          data: {
            views: ['changed', 'diffs', 'debug'],
            activeView: 'changed',
            id: 'left-sidebar',
          },
          size: 300,
        },
        {
          type: 'leaf',
          data: {
            views: ['message'],
            activeView: 'message',
            id: 'center',
          },
          size: 600,
        },
        {
          type: 'leaf',
          data: {
            views: ['sprint', 'progress', 'git', 'settings'],
            activeView: 'sprint',
            id: 'right-sidebar',
          },
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
    progress: { id: 'progress', contentComponent: 'PanelAdapter', title: 'Progress', params: { panelId: 'progress' } },
    git: { id: 'git', contentComponent: 'PanelAdapter', title: 'Git', params: { panelId: 'git' } },
    settings: { id: 'settings', contentComponent: 'PanelAdapter', title: 'Settings', params: { panelId: 'settings' } },
  },
  activeGroup: 'center',
};

// Modified layout with different panel arrangement
const mockModifiedDockviewLayout: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'leaf',
          data: {
            views: ['diffs', 'changed'],  // Reordered, debug removed
            activeView: 'diffs',
            id: 'left-sidebar',
          },
          size: 400,  // Different width
        },
        {
          type: 'leaf',
          data: {
            views: ['message'],
            activeView: 'message',
            id: 'center',
          },
          size: 550,
        },
        {
          type: 'leaf',
          data: {
            views: ['progress', 'sprint', 'settings'],  // Reordered
            activeView: 'progress',
            id: 'right-sidebar',
          },
          size: 250,  // Different width
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
    message: { id: 'message', contentComponent: 'PanelAdapter', title: 'Message', params: { panelId: 'message' } },
    sprint: { id: 'sprint', contentComponent: 'PanelAdapter', title: 'Sprint', params: { panelId: 'sprint' } },
    progress: { id: 'progress', contentComponent: 'PanelAdapter', title: 'Progress', params: { panelId: 'progress' } },
    settings: { id: 'settings', contentComponent: 'PanelAdapter', title: 'Settings', params: { panelId: 'settings' } },
  },
  activeGroup: 'center',
};

// ============================================================================
// AC1: Layout state saved to config.local.yaml on change
// ============================================================================

describe('AC1: Layout state saved to config.local.yaml on change', () => {
  const TestComponent = ({ layout }: { layout: SerializedDockview }) => {
    const { saveLayout, isSaving } = useLayoutPersistence();
    return (
      <div>
        <button data-testid="save-btn" onClick={() => saveLayout(layout)}>
          Save
        </button>
        <div data-testid="saving-state">{isSaving.toString()}</div>
      </div>
    );
  };

  it('should call REST API PATCH when saveLayout is called', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<TestComponent layout={mockModifiedDockviewLayout} />);

    act(() => {
      screen.getByTestId('save-btn').click();
    });

    // Advance timers to trigger debounced save
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // Should have called PATCH /api/settings/layout
    const patchCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/settings/layout' && opts?.method === 'PATCH'
    );
    expect(patchCalls.length).toBe(1);
  });

  it('should pass native Dockview layout format to save', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<TestComponent layout={mockModifiedDockviewLayout} />);

    act(() => {
      screen.getByTestId('save-btn').click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const patchCall = mockFetch.mock.calls.find(
      ([url, opts]) => url === '/api/settings/layout' && opts?.method === 'PATCH'
    );
    const savedData = JSON.parse(patchCall[1].body);

    // Verify native Dockview structure
    expect(savedData.grid).toBeDefined();
    expect(savedData.panels).toBeDefined();
    expect(savedData.grid.width).toBe(1200);
  });

  it('should indicate saving state during save operation', async () => {
    mockFetch.mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({ ok: true, json: () => Promise.resolve({}) }), 100))
    );

    render(<TestComponent layout={mockModifiedDockviewLayout} />);

    act(() => {
      screen.getByTestId('save-btn').click();
    });

    // Advance past debounce but not past the save completion
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(screen.getByTestId('saving-state')).toHaveTextContent('true');
  });

  it('should set saving to false after save completes', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<TestComponent layout={mockModifiedDockviewLayout} />);

    act(() => {
      screen.getByTestId('save-btn').click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByTestId('saving-state')).toHaveTextContent('false');
  });
});

// ============================================================================
// AC2: Layout state restored on app startup
// ============================================================================

describe('AC2: Layout state restored on app startup', () => {
  const TestComponent = () => {
    const { layout, isLoading, error } = useLayoutPersistence();
    return (
      <div>
        <div data-testid="loading-state">{isLoading.toString()}</div>
        <div data-testid="has-layout">{layout ? 'yes' : 'no'}</div>
        <div data-testid="grid-width">{layout?.grid?.width}</div>
        <div data-testid="panel-count">{layout?.panels ? Object.keys(layout.panels).length : 0}</div>
        {error && <div data-testid="error">{error.message}</div>}
      </div>
    );
  };

  it('should fetch layout on mount via REST API', async () => {
    render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Should have called GET /api/settings/layout
    const getCalls = mockFetch.mock.calls.filter(
      ([url]) => url === '/api/settings/layout'
    );
    expect(getCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('should show loading state while fetching', async () => {
    mockFetch.mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: () => Promise.resolve({ layout: mockNativeDockviewLayout })
      }), 100))
    );

    render(<TestComponent />);

    expect(screen.getByTestId('loading-state')).toHaveTextContent('true');
  });

  it('should restore saved native Dockview layout', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ layout: mockNativeDockviewLayout })
    });

    render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId('has-layout')).toHaveTextContent('yes');
    expect(screen.getByTestId('grid-width')).toHaveTextContent('1200');
    expect(screen.getByTestId('panel-count')).toHaveTextContent('8');
  });

  it('should set loading to false after fetch completes', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ layout: mockNativeDockviewLayout })
    });

    render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId('loading-state')).toHaveTextContent('false');
  });
});

// ============================================================================
// AC3: Saved state uses native Dockview SerializedDockview format
// ============================================================================

describe('AC3: Saved state uses native Dockview format', () => {
  const TestComponent = ({ layout }: { layout: SerializedDockview }) => {
    const { saveLayout } = useLayoutPersistence();
    return (
      <button data-testid="save-btn" onClick={() => saveLayout(layout)}>
        Save
      </button>
    );
  };

  it('should save complete grid structure with panel positions', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<TestComponent layout={mockModifiedDockviewLayout} />);

    act(() => {
      screen.getByTestId('save-btn').click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const patchCall = mockFetch.mock.calls.find(
      ([url, opts]) => url === '/api/settings/layout' && opts?.method === 'PATCH'
    );
    const savedData = JSON.parse(patchCall[1].body);

    // Verify grid structure is preserved
    expect(savedData.grid.root.type).toBe('branch');
    expect(savedData.grid.root.data).toHaveLength(3); // 3 groups
  });

  it('should save sidebar sizes in grid structure', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<TestComponent layout={mockModifiedDockviewLayout} />);

    act(() => {
      screen.getByTestId('save-btn').click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const patchCall = mockFetch.mock.calls.find(
      ([url, opts]) => url === '/api/settings/layout' && opts?.method === 'PATCH'
    );
    const savedData = JSON.parse(patchCall[1].body);

    // Verify sizes are in the grid structure
    expect(savedData.grid.root.data[0].size).toBe(400); // Left sidebar width
    expect(savedData.grid.root.data[2].size).toBe(250); // Right sidebar width
  });

  it('should save panel definitions with params', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<TestComponent layout={mockModifiedDockviewLayout} />);

    act(() => {
      screen.getByTestId('save-btn').click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const patchCall = mockFetch.mock.calls.find(
      ([url, opts]) => url === '/api/settings/layout' && opts?.method === 'PATCH'
    );
    const savedData = JSON.parse(patchCall[1].body);

    // Verify panels object structure
    expect(savedData.panels).toBeDefined();
    expect(savedData.panels.changed.contentComponent).toBe('PanelAdapter');
    expect(savedData.panels.changed.params.panelId).toBe('changed');
  });

  it('should save active group for focus restoration', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<TestComponent layout={mockModifiedDockviewLayout} />);

    act(() => {
      screen.getByTestId('save-btn').click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const patchCall = mockFetch.mock.calls.find(
      ([url, opts]) => url === '/api/settings/layout' && opts?.method === 'PATCH'
    );
    const savedData = JSON.parse(patchCall[1].body);

    expect(savedData.activeGroup).toBeDefined();
  });
});

// ============================================================================
// AC4: Each project maintains independent layout (via REST API context)
// ============================================================================

describe('AC4: Each project maintains independent layout', () => {
  it('should fetch layout via project-scoped REST API', async () => {
    const TestComponent = () => {
      const { layout } = useLayoutPersistence();
      return <div data-testid="layout-loaded">{layout ? 'yes' : 'no'}</div>;
    };

    render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // REST API is project-scoped by server context
    expect(mockFetch).toHaveBeenCalledWith('/api/settings/layout');
  });

  it('should save layout via project-scoped REST API', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    const TestComponent = ({ layout }: { layout: SerializedDockview }) => {
      const { saveLayout } = useLayoutPersistence();
      return (
        <button data-testid="save-btn" onClick={() => saveLayout(layout)}>
          Save
        </button>
      );
    };

    render(<TestComponent layout={mockModifiedDockviewLayout} />);

    act(() => {
      screen.getByTestId('save-btn').click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // The save should go to project-specific config via REST API
    const patchCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/settings/layout' && opts?.method === 'PATCH'
    );
    expect(patchCalls.length).toBe(1);
  });
});

// ============================================================================
// AC5: Graceful handling of corrupted/missing layout config
// ============================================================================

describe('AC5: Graceful handling of corrupted/missing layout config', () => {
  const TestComponent = () => {
    const { layout, isLoading, error } = useLayoutPersistence();
    return (
      <div>
        <div data-testid="loading-state">{isLoading.toString()}</div>
        <div data-testid="has-layout">{layout ? 'yes' : 'no'}</div>
        {error && <div data-testid="error">{error.message}</div>}
      </div>
    );
  };

  it('should return null layout when config is null (DockviewWorkspace builds default)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ layout: null })
    });

    render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Hook returns null, DockviewWorkspace will build default
    expect(screen.getByTestId('has-layout')).toHaveTextContent('no');
  });

  it('should return null layout when API returns error', async () => {
    mockFetch.mockRejectedValue(new Error('Config read failed'));

    render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Hook returns null on error, DockviewWorkspace builds default
    expect(screen.getByTestId('has-layout')).toHaveTextContent('no');
  });

  it('should return null layout when saved layout is malformed (not Dockview format)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        layout: {
          // Old format - not native Dockview
          leftSidebar: { width: 300 },
        }
      })
    });

    render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Invalid format returns null, DockviewWorkspace builds default
    expect(screen.getByTestId('has-layout')).toHaveTextContent('no');
  });

  it('should accept valid native Dockview layout', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ layout: mockNativeDockviewLayout })
    });

    render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId('has-layout')).toHaveTextContent('yes');
  });

  it('should not crash when save fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ layout: null }) }) // GET
      .mockRejectedValueOnce(new Error('Write failed')); // PATCH

    const SaveTestComponent = ({ layout }: { layout: SerializedDockview }) => {
      const { saveLayout, error } = useLayoutPersistence();
      return (
        <div>
          <button data-testid="save-btn" onClick={() => saveLayout(layout)}>
            Save
          </button>
          {error && <div data-testid="error">{error.message}</div>}
        </div>
      );
    };

    render(<SaveTestComponent layout={mockModifiedDockviewLayout} />);

    act(() => {
      screen.getByTestId('save-btn').click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // Should not crash, may show error
    expect(screen.getByTestId('save-btn')).toBeInTheDocument();
  });
});

// ============================================================================
// AC6: Layout changes trigger autosave (debounced)
// ============================================================================

describe('AC6: Layout changes trigger autosave (debounced)', () => {
  // Create layout variants for testing debounce
  const createLayoutWithWidth = (width: number): SerializedDockview => ({
    ...mockModifiedDockviewLayout,
    grid: {
      ...mockModifiedDockviewLayout.grid,
      root: {
        ...mockModifiedDockviewLayout.grid.root,
        data: [
          { ...mockModifiedDockviewLayout.grid.root.data[0], size: width },
          mockModifiedDockviewLayout.grid.root.data[1],
          mockModifiedDockviewLayout.grid.root.data[2],
        ],
      },
    },
  });

  const TestComponent = ({ layout }: { layout: SerializedDockview }) => {
    const { saveLayout, isSaving } = useLayoutPersistence();

    // Simulate multiple rapid changes
    const triggerMultipleChanges = () => {
      saveLayout(createLayoutWithWidth(310));
      saveLayout(createLayoutWithWidth(320));
      saveLayout(createLayoutWithWidth(330));
    };

    return (
      <div>
        <button data-testid="single-save" onClick={() => saveLayout(layout)}>
          Single Save
        </button>
        <button data-testid="multi-save" onClick={triggerMultipleChanges}>
          Multiple Saves
        </button>
        <div data-testid="saving">{isSaving.toString()}</div>
      </div>
    );
  };

  it('should debounce rapid layout changes', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<TestComponent layout={mockModifiedDockviewLayout} />);

    // Trigger multiple saves rapidly
    act(() => {
      screen.getByTestId('multi-save').click();
    });

    // Advance less than debounce time
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // Should not have saved yet (no PATCH calls)
    const patchCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/settings/layout' && opts?.method === 'PATCH'
    );
    expect(patchCalls.length).toBe(0);

    // Advance past debounce time
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    // Should only save once
    const finalPatchCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/settings/layout' && opts?.method === 'PATCH'
    );
    expect(finalPatchCalls.length).toBe(1);
  });

  it('should save only the final layout state after debounce', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<TestComponent layout={mockModifiedDockviewLayout} />);

    act(() => {
      screen.getByTestId('multi-save').click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const patchCall = mockFetch.mock.calls.find(
      ([url, opts]) => url === '/api/settings/layout' && opts?.method === 'PATCH'
    );
    const savedData = JSON.parse(patchCall[1].body);
    expect(savedData.grid.root.data[0].size).toBe(330); // Final value
  });

  it('should respect debounce delay of at least 300ms', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<TestComponent layout={mockModifiedDockviewLayout} />);

    act(() => {
      screen.getByTestId('single-save').click();
    });

    // At 200ms - should not have saved
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    let patchCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/settings/layout' && opts?.method === 'PATCH'
    );
    expect(patchCalls.length).toBe(0);

    // At 400ms - should have saved (past 300ms debounce)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    patchCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/settings/layout' && opts?.method === 'PATCH'
    );
    expect(patchCalls.length).toBe(1);
  });

  it('should reset debounce timer on each change', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<TestComponent layout={mockModifiedDockviewLayout} />);

    // First save
    act(() => {
      screen.getByTestId('single-save').click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    // Second save resets timer
    act(() => {
      screen.getByTestId('single-save').click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    // Should not have saved yet (timer was reset)
    let patchCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/settings/layout' && opts?.method === 'PATCH'
    );
    expect(patchCalls.length).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // Now it should have saved
    patchCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/settings/layout' && opts?.method === 'PATCH'
    );
    expect(patchCalls.length).toBe(1);
  });
});

// ============================================================================
// useLayoutPersistence Hook Interface Tests
// ============================================================================

describe('useLayoutPersistence Hook Interface', () => {
  it('should export layout, isLoading, isSaving, error, and saveLayout', async () => {
    const TestComponent = () => {
      const hook = useLayoutPersistence();
      return (
        <div>
          {/* layout can be null for first-time users */}
          <div data-testid="layout-type">{hook.layout === null ? 'null' : typeof hook.layout === 'object' ? 'object' : 'other'}</div>
          <div data-testid="has-isLoading">{typeof hook.isLoading === 'boolean' ? 'yes' : 'no'}</div>
          <div data-testid="has-isSaving">{typeof hook.isSaving === 'boolean' ? 'yes' : 'no'}</div>
          <div data-testid="has-saveLayout">{typeof hook.saveLayout === 'function' ? 'yes' : 'no'}</div>
          <div data-testid="has-error">{hook.error === null || hook.error instanceof Error ? 'yes' : 'no'}</div>
        </div>
      );
    };

    render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Layout can be null (first-time user) or object (saved layout)
    const layoutType = screen.getByTestId('layout-type').textContent;
    expect(['null', 'object']).toContain(layoutType);
    expect(screen.getByTestId('has-isLoading')).toHaveTextContent('yes');
    expect(screen.getByTestId('has-isSaving')).toHaveTextContent('yes');
    expect(screen.getByTestId('has-saveLayout')).toHaveTextContent('yes');
    expect(screen.getByTestId('has-error')).toHaveTextContent('yes');
  });
});

// ============================================================================
// Integration Test: App.tsx wiring verification
// ============================================================================

describe('Integration: App.tsx layout persistence wiring', () => {
  it('should wire useLayoutPersistence hook to DockviewWorkspace', async () => {
    // Import App to verify the wiring exists
    const AppModule = await import('../src/public/App');
    const appSource = AppModule.default.toString();

    // Verify the hook is used in App
    expect(appSource).toContain('useLayoutPersistence');
  });

  it('should pass initialLayout and onLayoutChange to DockviewWorkspace', async () => {
    // Read App.tsx source to verify props are passed
    const fs = await import('fs');
    const path = await import('path');
    const appPath = path.join(__dirname, '../src/public/App.tsx');
    const appSource = fs.readFileSync(appPath, 'utf-8');

    // Verify DockviewWorkspace receives the required props (layout can be null/undefined)
    expect(appSource).toMatch(/initialLayout=\{layout/);
    expect(appSource).toContain('onLayoutChange={saveLayout}');
  });

  it('should render loading state while layout loads', async () => {
    // Mock a slow layout fetch
    mockFetch.mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: () => Promise.resolve({ layout: null })
      }), 500))
    );

    // Import and render App
    const { default: App } = await import('../src/public/App');
    render(<App />);

    // Should show loading state
    expect(document.querySelector('.cyclist-loading')).toBeInTheDocument();
  });

  it('should render DockviewWorkspace after layout loads', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ layout: mockNativeDockviewLayout })
    });

    const { default: App } = await import('../src/public/App');
    render(<App />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Should render the workspace, not loading state
    expect(document.querySelector('.cyclist-loading')).not.toBeInTheDocument();
    // DockviewWorkspace renders a container with .cyclist-dockview
    expect(document.querySelector('.cyclist-dockview')).toBeInTheDocument();
  });
});
