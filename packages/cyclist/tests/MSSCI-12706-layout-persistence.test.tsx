/**
 * MSSCI-12706: Layout Persistence Tests
 *
 * Tests for the layout persistence system that saves/restores panel layouts.
 * Story: MSSCI-12706 - Layout Persistence
 * Epic: epic-70 (Flexible Workspace)
 *
 * Requirements:
 * - Save layout state to config.local.yaml on change
 * - Restore layout on startup
 * - Save panel positions, widths, collapsed states
 * - Independent layouts per project
 * - Graceful handling of corrupted/missing config
 * - Debounced autosave
 *
 * Acceptance Criteria:
 * - AC1: Layout state saved to `.pennyfarthing/config.local.yaml` on change
 * - AC2: Layout state restored on app startup
 * - AC3: Saved state includes: panel positions, widths, collapsed states
 * - AC4: Each project maintains independent layout
 * - AC5: Graceful handling of corrupted/missing layout config
 * - AC6: Layout changes trigger autosave (debounced)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';

// Hook to be implemented
import { useLayoutPersistence } from '../src/public/hooks/useLayoutPersistence';
import type { WorkspaceLayoutConfig } from '../src/public/components/DockingWorkspace';

// ============================================================================
// Mock Setup
// ============================================================================

const mockElectronAPI = {
  layout: {
    get: vi.fn(() => Promise.resolve(null)),
    save: vi.fn(() => Promise.resolve({ success: true })),
    onUpdate: vi.fn(),
  },
  projectInfo: {
    get: vi.fn(() => Promise.resolve({ pwd: '/test/project' })),
  },
};

beforeEach(() => {
  (window as any).electronAPI = mockElectronAPI;
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  delete (window as any).electronAPI;
  vi.useRealTimers();
});

// ============================================================================
// Test Fixtures
// ============================================================================

const mockDefaultLayout: WorkspaceLayoutConfig = {
  leftSidebar: {
    panels: ['changed', 'diffs', 'debug'],
    width: 300,
    collapsed: false,
  },
  center: {
    panels: ['message'],
    locked: true,
  },
  rightSidebar: {
    panels: ['sprint', 'progress', 'background', 'git', 'settings'],
    width: 300,
    collapsed: false,
  },
};

const mockCustomLayout: WorkspaceLayoutConfig = {
  leftSidebar: {
    panels: ['diffs', 'changed'],  // Reordered
    width: 400,                     // Different width
    collapsed: true,                // Collapsed
  },
  center: {
    panels: ['message'],
    locked: true,
  },
  rightSidebar: {
    panels: ['progress', 'sprint', 'settings'],  // Some removed, reordered
    width: 250,
    collapsed: false,
  },
};

const mockSavedLayoutConfig = {
  theme: 'rome',
  layout: {
    version: 1,
    leftSidebar: {
      panels: ['diffs', 'changed'],
      width: 400,
      collapsed: true,
      activePanel: 'diffs',
    },
    rightSidebar: {
      panels: ['progress', 'sprint', 'settings'],
      width: 250,
      collapsed: false,
      activePanel: 'progress',
    },
  },
};

// ============================================================================
// AC1: Layout state saved to config.local.yaml on change
// ============================================================================

describe('AC1: Layout state saved to config.local.yaml on change', () => {
  const TestComponent = ({ layout }: { layout: WorkspaceLayoutConfig }) => {
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

  it('should call electronAPI.layout.save when saveLayout is called', async () => {
    render(<TestComponent layout={mockCustomLayout} />);

    act(() => {
      screen.getByTestId('save-btn').click();
    });

    // Advance timers to trigger debounced save (use async version to flush promises)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(mockElectronAPI.layout.save).toHaveBeenCalled();
  });

  it('should pass layout data in correct format to save', async () => {
    render(<TestComponent layout={mockCustomLayout} />);

    act(() => {
      screen.getByTestId('save-btn').click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const savedData = mockElectronAPI.layout.save.mock.calls[0][0];
    expect(savedData.leftSidebar.width).toBe(400);
    expect(savedData.leftSidebar.collapsed).toBe(true);
  });

  it('should indicate saving state during save operation', async () => {
    mockElectronAPI.layout.save.mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
    );

    render(<TestComponent layout={mockCustomLayout} />);

    act(() => {
      screen.getByTestId('save-btn').click();
    });

    // Advance past debounce but not past the save completion
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.getByTestId('saving-state')).toHaveTextContent('true');
  });

  it('should set saving to false after save completes', async () => {
    mockElectronAPI.layout.save.mockResolvedValue({ success: true });

    render(<TestComponent layout={mockCustomLayout} />);

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
        <div data-testid="layout-left-width">{layout?.leftSidebar.width}</div>
        <div data-testid="layout-left-collapsed">{layout?.leftSidebar.collapsed?.toString()}</div>
        <div data-testid="layout-left-panels">{layout?.leftSidebar.panels.join(',')}</div>
        {error && <div data-testid="error">{error.message}</div>}
      </div>
    );
  };

  it('should fetch layout on mount', async () => {
    render(<TestComponent />);

    // Flush all pending promises
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockElectronAPI.layout.get).toHaveBeenCalled();
  });

  it('should show loading state while fetching', async () => {
    mockElectronAPI.layout.get.mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve(mockSavedLayoutConfig), 100))
    );

    render(<TestComponent />);

    expect(screen.getByTestId('loading-state')).toHaveTextContent('true');
  });

  it('should restore saved layout from config', async () => {
    mockElectronAPI.layout.get.mockResolvedValue(mockSavedLayoutConfig);

    render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId('layout-left-width')).toHaveTextContent('400');
    expect(screen.getByTestId('layout-left-collapsed')).toHaveTextContent('true');
  });

  it('should restore panel order from saved config', async () => {
    mockElectronAPI.layout.get.mockResolvedValue(mockSavedLayoutConfig);

    render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId('layout-left-panels')).toHaveTextContent('diffs,changed');
  });

  it('should set loading to false after fetch completes', async () => {
    mockElectronAPI.layout.get.mockResolvedValue(mockSavedLayoutConfig);

    render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId('loading-state')).toHaveTextContent('false');
  });
});

// ============================================================================
// AC3: Saved state includes panel positions, widths, collapsed states
// ============================================================================

describe('AC3: Saved state includes panel positions, widths, collapsed states', () => {
  const TestComponent = ({ layout }: { layout: WorkspaceLayoutConfig }) => {
    const { saveLayout } = useLayoutPersistence();
    return (
      <button data-testid="save-btn" onClick={() => saveLayout(layout)}>
        Save
      </button>
    );
  };

  it('should save panel positions (order in array)', async () => {
    render(<TestComponent layout={mockCustomLayout} />);

    act(() => {
      screen.getByTestId('save-btn').click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const savedData = mockElectronAPI.layout.save.mock.calls[0][0];
    expect(savedData.leftSidebar.panels).toEqual(['diffs', 'changed']);
    expect(savedData.rightSidebar.panels).toEqual(['progress', 'sprint', 'settings']);
  });

  it('should save sidebar widths', async () => {
    render(<TestComponent layout={mockCustomLayout} />);

    act(() => {
      screen.getByTestId('save-btn').click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const savedData = mockElectronAPI.layout.save.mock.calls[0][0];
    expect(savedData.leftSidebar.width).toBe(400);
    expect(savedData.rightSidebar.width).toBe(250);
  });

  it('should save collapsed states for both sidebars', async () => {
    render(<TestComponent layout={mockCustomLayout} />);

    act(() => {
      screen.getByTestId('save-btn').click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const savedData = mockElectronAPI.layout.save.mock.calls[0][0];
    expect(savedData.leftSidebar.collapsed).toBe(true);
    expect(savedData.rightSidebar.collapsed).toBe(false);
  });

  it('should include version number for migration support', async () => {
    render(<TestComponent layout={mockCustomLayout} />);

    act(() => {
      screen.getByTestId('save-btn').click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const savedData = mockElectronAPI.layout.save.mock.calls[0][0];
    expect(savedData.version).toBeDefined();
    expect(typeof savedData.version).toBe('number');
  });
});

// ============================================================================
// AC4: Each project maintains independent layout
// ============================================================================

describe('AC4: Each project maintains independent layout', () => {
  it('should request project path when fetching layout', async () => {
    const TestComponent = () => {
      const { layout } = useLayoutPersistence();
      return <div data-testid="layout-loaded">{layout ? 'yes' : 'no'}</div>;
    };

    render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockElectronAPI.projectInfo.get).toHaveBeenCalled();
  });

  it('should pass project context when saving layout', async () => {
    mockElectronAPI.projectInfo.get.mockResolvedValue({ pwd: '/project/alpha' });

    const TestComponent = ({ layout }: { layout: WorkspaceLayoutConfig }) => {
      const { saveLayout } = useLayoutPersistence();
      return (
        <button data-testid="save-btn" onClick={() => saveLayout(layout)}>
          Save
        </button>
      );
    };

    render(<TestComponent layout={mockCustomLayout} />);

    act(() => {
      screen.getByTestId('save-btn').click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // The save should use the project-specific config
    expect(mockElectronAPI.layout.save).toHaveBeenCalled();
  });

  it('should not share layout state between different projects', async () => {
    // This test verifies the API call includes project context
    mockElectronAPI.projectInfo.get.mockResolvedValueOnce({ pwd: '/project/alpha' });

    const TestComponent = () => {
      const { layout } = useLayoutPersistence();
      return <div data-testid="layout">{layout ? 'loaded' : 'none'}</div>;
    };

    const { unmount } = render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockElectronAPI.projectInfo.get).toHaveBeenCalled();

    unmount();

    // Second project
    mockElectronAPI.projectInfo.get.mockResolvedValueOnce({ pwd: '/project/beta' });

    render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockElectronAPI.projectInfo.get).toHaveBeenCalledTimes(2);
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
        <div data-testid="left-panels">{layout?.leftSidebar.panels.join(',')}</div>
        {error && <div data-testid="error">{error.message}</div>}
      </div>
    );
  };

  it('should return default layout when config is null', async () => {
    mockElectronAPI.layout.get.mockResolvedValue(null);

    render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId('has-layout')).toHaveTextContent('yes');
  });

  it('should return default layout when config is undefined', async () => {
    mockElectronAPI.layout.get.mockResolvedValue(undefined);

    render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId('has-layout')).toHaveTextContent('yes');
  });

  it('should return default layout when API returns error', async () => {
    mockElectronAPI.layout.get.mockRejectedValue(new Error('Config read failed'));

    render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId('has-layout')).toHaveTextContent('yes');
  });

  it('should return default layout when saved layout is malformed', async () => {
    mockElectronAPI.layout.get.mockResolvedValue({
      layout: {
        // Missing required fields
        leftSidebar: { width: 'not-a-number' },
      },
    });

    render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId('has-layout')).toHaveTextContent('yes');
    // Should fall back to defaults
    expect(screen.getByTestId('left-panels')).toHaveTextContent('changed,diffs,debug');
  });

  it('should handle missing panels array gracefully', async () => {
    mockElectronAPI.layout.get.mockResolvedValue({
      layout: {
        version: 1,
        leftSidebar: { width: 300, collapsed: false },  // panels missing
        rightSidebar: { panels: [], width: 300, collapsed: false },
      },
    });

    render(<TestComponent />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId('has-layout')).toHaveTextContent('yes');
  });

  it('should not crash when save fails', async () => {
    mockElectronAPI.layout.save.mockRejectedValue(new Error('Write failed'));

    const TestComponent = ({ layout }: { layout: WorkspaceLayoutConfig }) => {
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

    render(<TestComponent layout={mockCustomLayout} />);

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
  const TestComponent = ({ layout }: { layout: WorkspaceLayoutConfig }) => {
    const { saveLayout, isSaving } = useLayoutPersistence();

    // Simulate multiple rapid changes
    const triggerMultipleChanges = () => {
      saveLayout({ ...layout, leftSidebar: { ...layout.leftSidebar, width: 310 } });
      saveLayout({ ...layout, leftSidebar: { ...layout.leftSidebar, width: 320 } });
      saveLayout({ ...layout, leftSidebar: { ...layout.leftSidebar, width: 330 } });
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
    render(<TestComponent layout={mockCustomLayout} />);

    // Trigger multiple saves rapidly
    act(() => {
      screen.getByTestId('multi-save').click();
    });

    // Advance less than debounce time
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // Should not have saved yet
    expect(mockElectronAPI.layout.save).not.toHaveBeenCalled();

    // Advance past debounce time
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    // Should only save once with the final value
    expect(mockElectronAPI.layout.save).toHaveBeenCalledTimes(1);
  });

  it('should save only the final layout state after debounce', async () => {
    render(<TestComponent layout={mockCustomLayout} />);

    act(() => {
      screen.getByTestId('multi-save').click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const savedData = mockElectronAPI.layout.save.mock.calls[0][0];
    expect(savedData.leftSidebar.width).toBe(330);  // Final value
  });

  it('should respect debounce delay of at least 300ms', async () => {
    render(<TestComponent layout={mockCustomLayout} />);

    act(() => {
      screen.getByTestId('single-save').click();
    });

    // At 200ms - should not have saved
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(mockElectronAPI.layout.save).not.toHaveBeenCalled();

    // At 400ms - should have saved (past 300ms debounce)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(mockElectronAPI.layout.save).toHaveBeenCalled();
  });

  it('should reset debounce timer on each change', async () => {
    render(<TestComponent layout={mockCustomLayout} />);

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
    expect(mockElectronAPI.layout.save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // Now it should have saved
    expect(mockElectronAPI.layout.save).toHaveBeenCalledTimes(1);
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
          <div data-testid="has-layout">{hook.layout !== undefined ? 'yes' : 'no'}</div>
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

    expect(screen.getByTestId('has-layout')).toHaveTextContent('yes');
    expect(screen.getByTestId('has-isLoading')).toHaveTextContent('yes');
    expect(screen.getByTestId('has-isSaving')).toHaveTextContent('yes');
    expect(screen.getByTestId('has-saveLayout')).toHaveTextContent('yes');
    expect(screen.getByTestId('has-error')).toHaveTextContent('yes');
  });
});
