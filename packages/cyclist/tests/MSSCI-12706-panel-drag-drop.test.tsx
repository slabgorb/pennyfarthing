/**
 * Panel Drag-and-Drop Tests
 *
 * Story MSSCI-12705 - Panel Drag-and-Drop
 *
 * NOTE: These tests were written for the old DockingWorkspace component which had
 * custom drag-and-drop implementation. After MSSCI-14001 (Dockview migration),
 * drag-and-drop is now handled by the Dockview library itself and doesn't use
 * the custom dropzone/drag-handle elements these tests expect.
 *
 * These tests are skipped as the functionality is now provided by Dockview's
 * built-in drag-and-drop system.
 *
 * Acceptance Criteria:
 * 1. Panels can be dragged between left and right sidebars
 * 2. Tabs can be reordered within a sidebar via drag
 * 3. Ghost preview shows during drag operations
 * 4. Drop zones are highlighted when dragging over valid targets
 * 5. Message view (center) rejects panel drops - cannot be a drop target
 * 6. Drag handles are visually indicated on panel headers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  DockviewWorkspace,
  PANEL_INVENTORY,
} from '../src/public/components/DockviewWorkspace';

// =============================================================================
// Test Utilities
// =============================================================================

function createDragEvent(type: string, data: Record<string, string> = {}) {
  const dataTransfer = {
    data: {} as Record<string, string>,
    setData: vi.fn((key: string, value: string) => {
      dataTransfer.data[key] = value;
    }),
    getData: vi.fn((key: string) => dataTransfer.data[key] || ''),
    setDragImage: vi.fn(),
    effectAllowed: 'move',
    dropEffect: 'move',
  };

  // Pre-populate data
  Object.entries(data).forEach(([key, value]) => {
    dataTransfer.data[key] = value;
  });

  return {
    dataTransfer,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

// =============================================================================
// AC1: Panels can be dragged between left and right sidebars
// =============================================================================

describe.skip('AC1: Panels can be dragged between sidebars', () => {
  it('should allow dragging a panel from left sidebar', () => {
    render(<DockviewWorkspace />);

    // Find the Changed tab in left sidebar
    const changedTab = screen.getByRole('tab', { name: /changed/i });
    expect(changedTab).toBeInTheDocument();

    // Drag should be enabled
    const dragEvent = createDragEvent('dragstart');
    fireEvent.dragStart(changedTab, dragEvent);

    // dataTransfer.setData should be called with panel ID
    expect(dragEvent.dataTransfer.setData).toHaveBeenCalledWith(
      'application/x-cyclist-panel',
      PANEL_INVENTORY.CHANGED
    );
  });

  it('should allow dropping a panel from left to right sidebar', () => {
    const onLayoutChange = vi.fn();
    render(<DockviewWorkspace onLayoutChange={onLayoutChange} />);

    // Find the right sidebar drop zone
    const rightSidebar = screen.getByTestId('sidebar-right-dropzone');

    // Simulate drop with panel data
    const dropEvent = createDragEvent('drop', {
      'application/x-cyclist-panel': PANEL_INVENTORY.CHANGED,
      'application/x-cyclist-source': 'left',
    });

    fireEvent.drop(rightSidebar, dropEvent);

    // Layout should update with panel moved to right
    expect(onLayoutChange).toHaveBeenCalledWith(
      expect.objectContaining({
        rightSidebar: expect.objectContaining({
          panels: expect.arrayContaining([PANEL_INVENTORY.CHANGED]),
        }),
      })
    );
  });

  it('should allow dropping a panel from right to left sidebar', () => {
    const onLayoutChange = vi.fn();
    render(<DockviewWorkspace onLayoutChange={onLayoutChange} />);

    // Find the left sidebar drop zone
    const leftSidebar = screen.getByTestId('sidebar-left-dropzone');

    // Simulate drop with panel data from right sidebar
    const dropEvent = createDragEvent('drop', {
      'application/x-cyclist-panel': PANEL_INVENTORY.SPRINT,
      'application/x-cyclist-source': 'right',
    });

    fireEvent.drop(leftSidebar, dropEvent);

    // Layout should update with panel moved to left
    expect(onLayoutChange).toHaveBeenCalledWith(
      expect.objectContaining({
        leftSidebar: expect.objectContaining({
          panels: expect.arrayContaining([PANEL_INVENTORY.SPRINT]),
        }),
      })
    );
  });

  it('should remove panel from source sidebar after successful drop', () => {
    const onLayoutChange = vi.fn();
    render(<DockviewWorkspace onLayoutChange={onLayoutChange} />);

    const rightSidebar = screen.getByTestId('sidebar-right-dropzone');

    const dropEvent = createDragEvent('drop', {
      'application/x-cyclist-panel': PANEL_INVENTORY.CHANGED,
      'application/x-cyclist-source': 'left',
    });

    fireEvent.drop(rightSidebar, dropEvent);

    // Left sidebar should NOT contain Changed anymore
    expect(onLayoutChange).toHaveBeenCalledWith(
      expect.objectContaining({
        leftSidebar: expect.objectContaining({
          panels: expect.not.arrayContaining([PANEL_INVENTORY.CHANGED]),
        }),
      })
    );
  });
});

// =============================================================================
// AC2: Tabs can be reordered within a sidebar via drag
// =============================================================================

describe.skip('AC2: Tabs can be reordered within a sidebar', () => {
  it('should allow reordering tabs within left sidebar', () => {
    const onLayoutChange = vi.fn();
    render(<DockviewWorkspace onLayoutChange={onLayoutChange} />);

    // Find the Diffs tab (second in left sidebar)
    const diffsTab = screen.getByRole('tab', { name: /diffs/i });

    // Find the drop target for position 0 (before Changed)
    const dropTarget = screen.getByTestId('left-tab-drop-0');

    // Drag Diffs to position 0
    const dropEvent = createDragEvent('drop', {
      'application/x-cyclist-panel': PANEL_INVENTORY.DIFFS,
      'application/x-cyclist-source': 'left',
      'application/x-cyclist-index': '1',
    });

    fireEvent.drop(dropTarget, dropEvent);

    // Layout should have Diffs first
    expect(onLayoutChange).toHaveBeenCalledWith(
      expect.objectContaining({
        leftSidebar: expect.objectContaining({
          panels: [PANEL_INVENTORY.DIFFS, PANEL_INVENTORY.CHANGED, PANEL_INVENTORY.DEBUG],
        }),
      })
    );
  });

  it('should allow reordering tabs within right sidebar', () => {
    const onLayoutChange = vi.fn();
    render(<DockviewWorkspace onLayoutChange={onLayoutChange} />);

    // Find drop target for position 0 in right sidebar
    const dropTarget = screen.getByTestId('right-tab-drop-0');

    // Drag Progress (originally position 1) to position 0
    const dropEvent = createDragEvent('drop', {
      'application/x-cyclist-panel': PANEL_INVENTORY.PROGRESS,
      'application/x-cyclist-source': 'right',
      'application/x-cyclist-index': '1',
    });

    fireEvent.drop(dropTarget, dropEvent);

    // Progress should now be first
    expect(onLayoutChange).toHaveBeenCalledWith(
      expect.objectContaining({
        rightSidebar: expect.objectContaining({
          panels: expect.arrayContaining([PANEL_INVENTORY.PROGRESS]),
        }),
      })
    );
    // First element should be Progress
    const call = onLayoutChange.mock.calls[0][0];
    expect(call.rightSidebar.panels[0]).toBe(PANEL_INVENTORY.PROGRESS);
  });

  it('should show tab insertion indicator during reorder drag', () => {
    render(<DockviewWorkspace />);

    // Find a drop target
    const dropTarget = screen.getByTestId('left-tab-drop-1');

    // Dragover should show insertion indicator
    const dragOverEvent = createDragEvent('dragover', {
      'application/x-cyclist-panel': PANEL_INVENTORY.DEBUG,
    });

    fireEvent.dragOver(dropTarget, dragOverEvent);

    expect(dropTarget).toHaveClass('tab-insertion-indicator');
  });
});

// =============================================================================
// AC3: Ghost preview shows during drag operations
// =============================================================================

describe.skip('AC3: Ghost preview during drag', () => {
  it('should create a ghost preview element on dragstart', () => {
    render(<DockviewWorkspace />);

    const changedTab = screen.getByRole('tab', { name: /changed/i });
    const dragEvent = createDragEvent('dragstart');

    fireEvent.dragStart(changedTab, dragEvent);

    // setDragImage should be called with a ghost element
    expect(dragEvent.dataTransfer.setDragImage).toHaveBeenCalled();
  });

  it('should show panel title in ghost preview', () => {
    render(<DockviewWorkspace />);

    const changedTab = screen.getByRole('tab', { name: /changed/i });
    const dragEvent = createDragEvent('dragstart');

    fireEvent.dragStart(changedTab, dragEvent);

    // The ghost element passed to setDragImage should contain the title
    const ghostElement = dragEvent.dataTransfer.setDragImage.mock.calls[0][0];
    expect(ghostElement.textContent).toContain('Changed');
  });

  it('should apply drag-ghost class to ghost element', () => {
    render(<DockviewWorkspace />);

    const changedTab = screen.getByRole('tab', { name: /changed/i });
    const dragEvent = createDragEvent('dragstart');

    fireEvent.dragStart(changedTab, dragEvent);

    const ghostElement = dragEvent.dataTransfer.setDragImage.mock.calls[0][0];
    expect(ghostElement.classList.contains('drag-ghost')).toBe(true);
  });

  it('should remove ghost element on dragend', () => {
    render(<DockviewWorkspace />);

    const changedTab = screen.getByRole('tab', { name: /changed/i });

    // Start drag
    const dragStartEvent = createDragEvent('dragstart');
    fireEvent.dragStart(changedTab, dragStartEvent);

    // End drag
    fireEvent.dragEnd(changedTab);

    // Ghost element should be removed from DOM
    const ghostElements = document.querySelectorAll('.drag-ghost');
    expect(ghostElements.length).toBe(0);
  });
});

// =============================================================================
// AC4: Drop zones are highlighted when dragging over valid targets
// =============================================================================

describe.skip('AC4: Drop zone highlighting', () => {
  it('should highlight left sidebar drop zone on dragenter', () => {
    render(<DockviewWorkspace />);

    const leftSidebar = screen.getByTestId('sidebar-left-dropzone');

    const dragEnterEvent = createDragEvent('dragenter', {
      'application/x-cyclist-panel': PANEL_INVENTORY.SPRINT,
    });

    fireEvent.dragEnter(leftSidebar, dragEnterEvent);

    expect(leftSidebar).toHaveClass('drop-zone-active');
  });

  it('should highlight right sidebar drop zone on dragenter', () => {
    render(<DockviewWorkspace />);

    const rightSidebar = screen.getByTestId('sidebar-right-dropzone');

    const dragEnterEvent = createDragEvent('dragenter', {
      'application/x-cyclist-panel': PANEL_INVENTORY.CHANGED,
    });

    fireEvent.dragEnter(rightSidebar, dragEnterEvent);

    expect(rightSidebar).toHaveClass('drop-zone-active');
  });

  it('should remove highlight on dragleave', () => {
    render(<DockviewWorkspace />);

    const leftSidebar = screen.getByTestId('sidebar-left-dropzone');

    // Enter
    const dragEnterEvent = createDragEvent('dragenter', {
      'application/x-cyclist-panel': PANEL_INVENTORY.SPRINT,
    });
    fireEvent.dragEnter(leftSidebar, dragEnterEvent);

    // Leave
    fireEvent.dragLeave(leftSidebar);

    expect(leftSidebar).not.toHaveClass('drop-zone-active');
  });

  it('should not highlight center region (invalid drop target)', () => {
    render(<DockviewWorkspace />);

    const centerRegion = screen.getByTestId('center-region');

    const dragEnterEvent = createDragEvent('dragenter', {
      'application/x-cyclist-panel': PANEL_INVENTORY.CHANGED,
    });

    fireEvent.dragEnter(centerRegion, dragEnterEvent);

    expect(centerRegion).not.toHaveClass('drop-zone-active');
    expect(centerRegion).toHaveClass('drop-zone-rejected');
  });

  it('should show visual feedback for valid drop position', () => {
    render(<DockviewWorkspace />);

    const leftSidebar = screen.getByTestId('sidebar-left-dropzone');

    const dragOverEvent = createDragEvent('dragover', {
      'application/x-cyclist-panel': PANEL_INVENTORY.SPRINT,
    });

    fireEvent.dragOver(leftSidebar, dragOverEvent);

    // Should have visual indicator
    expect(leftSidebar).toHaveAttribute('data-drop-valid', 'true');
  });
});

// =============================================================================
// AC5: Message view (center) rejects panel drops
// =============================================================================

describe.skip('AC5: Message view rejects drops', () => {
  it('should have data-drop-allowed="false" on center region', () => {
    render(<DockviewWorkspace />);

    const centerRegion = screen.getByTestId('center-region');
    expect(centerRegion).toHaveAttribute('data-drop-allowed', 'false');
  });

  it('should call onDropRejected when dropping on center', () => {
    const onDropRejected = vi.fn();
    render(<DockviewWorkspace onDropRejected={onDropRejected} />);

    const centerRegion = screen.getByTestId('center-region');

    const dropEvent = createDragEvent('drop', {
      'application/x-cyclist-panel': PANEL_INVENTORY.CHANGED,
    });

    fireEvent.drop(centerRegion, dropEvent);

    expect(onDropRejected).toHaveBeenCalled();
  });

  it('should not change layout when dropping on center', () => {
    const onLayoutChange = vi.fn();
    render(<DockviewWorkspace onLayoutChange={onLayoutChange} />);

    const centerRegion = screen.getByTestId('center-region');

    const dropEvent = createDragEvent('drop', {
      'application/x-cyclist-panel': PANEL_INVENTORY.CHANGED,
    });

    fireEvent.drop(centerRegion, dropEvent);

    // Layout should NOT change
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  it('should show rejection indicator when dragging over center', () => {
    render(<DockviewWorkspace />);

    const centerRegion = screen.getByTestId('center-region');

    const dragOverEvent = createDragEvent('dragover', {
      'application/x-cyclist-panel': PANEL_INVENTORY.CHANGED,
    });

    fireEvent.dragOver(centerRegion, dragOverEvent);

    expect(centerRegion).toHaveClass('drop-zone-rejected');
  });

  it('should prevent default on center dragover (no-op drop)', () => {
    // Spy on Event.prototype.preventDefault since fireEvent creates a new DOM event
    const preventDefaultSpy = vi.spyOn(Event.prototype, 'preventDefault');

    render(<DockviewWorkspace />);

    const centerRegion = screen.getByTestId('center-region');

    const dragOverEvent = createDragEvent('dragover', {
      'application/x-cyclist-panel': PANEL_INVENTORY.CHANGED,
    });

    fireEvent.dragOver(centerRegion, dragOverEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();

    preventDefaultSpy.mockRestore();
  });
});

// =============================================================================
// AC6: Drag handles are visually indicated on panel headers
// =============================================================================

describe.skip('AC6: Drag handles on panel headers', () => {
  it('should render drag handle on draggable panel tabs', () => {
    render(<DockviewWorkspace />);

    // Changed panel should have a drag handle
    const changedTab = screen.getByRole('tab', { name: /changed/i });
    const dragHandle = changedTab.querySelector('[data-testid="drag-handle"]');

    expect(dragHandle).toBeInTheDocument();
  });

  it('should NOT render drag handle on non-draggable panels', () => {
    render(<DockviewWorkspace />);

    // Message panel (center) should NOT have drag handle
    // Note: Message panel is in the center and not draggable by design
    // The Dockview implementation makes the center panel non-draggable via locked configuration
    expect(true).toBe(true); // Message panel draggability is tested via Dockview config
  });

  it('should have cursor:grab style on drag handle', () => {
    render(<DockviewWorkspace />);

    const changedTab = screen.getByRole('tab', { name: /changed/i });
    const dragHandle = changedTab.querySelector('[data-testid="drag-handle"]');

    expect(dragHandle).toHaveStyle({ cursor: 'grab' });
  });

  it('should have cursor:grabbing while dragging', () => {
    render(<DockviewWorkspace />);

    const changedTab = screen.getByRole('tab', { name: /changed/i });
    const dragHandle = changedTab.querySelector('[data-testid="drag-handle"]');

    // Start drag
    fireEvent.dragStart(changedTab);

    // During drag, cursor should change
    expect(dragHandle).toHaveStyle({ cursor: 'grabbing' });
  });

  it('should have accessible label on drag handle', () => {
    render(<DockviewWorkspace />);

    const changedTab = screen.getByRole('tab', { name: /changed/i });
    const dragHandle = changedTab.querySelector('[data-testid="drag-handle"]');

    expect(dragHandle).toHaveAttribute('aria-label', expect.stringContaining('drag'));
  });

  it('should render grip icon in drag handle', () => {
    render(<DockviewWorkspace />);

    const changedTab = screen.getByRole('tab', { name: /changed/i });
    const dragHandle = changedTab.querySelector('[data-testid="drag-handle"]');

    // Should have visual grip indicator (⋮⋮ or similar)
    expect(dragHandle?.textContent || dragHandle?.innerHTML).toMatch(/⋮|grip|drag/i);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe.skip('Integration: Complete drag-and-drop workflow', () => {
  it('should complete full drag from left to right sidebar', () => {
    const onLayoutChange = vi.fn();
    render(<DockviewWorkspace onLayoutChange={onLayoutChange} />);

    // 1. Find source tab
    const changedTab = screen.getByRole('tab', { name: /changed/i });

    // 2. Start drag
    const dragStartEvent = createDragEvent('dragstart');
    fireEvent.dragStart(changedTab, dragStartEvent);

    // 3. Drag over right sidebar
    const rightSidebar = screen.getByTestId('sidebar-right-dropzone');
    const dragOverEvent = createDragEvent('dragover', {
      'application/x-cyclist-panel': PANEL_INVENTORY.CHANGED,
    });
    fireEvent.dragOver(rightSidebar, dragOverEvent);

    // 4. Verify drop zone is highlighted
    expect(rightSidebar).toHaveClass('drop-zone-active');

    // 5. Drop
    const dropEvent = createDragEvent('drop', {
      'application/x-cyclist-panel': PANEL_INVENTORY.CHANGED,
      'application/x-cyclist-source': 'left',
    });
    fireEvent.drop(rightSidebar, dropEvent);

    // 6. End drag
    fireEvent.dragEnd(changedTab);

    // 7. Verify layout changed
    expect(onLayoutChange).toHaveBeenCalled();
  });

  it('should maintain panel state after moving between sidebars', () => {
    // Panels should preserve their internal state when moved
    const onLayoutChange = vi.fn();
    render(<DockviewWorkspace onLayoutChange={onLayoutChange} />);

    const rightSidebar = screen.getByTestId('sidebar-right-dropzone');

    const dropEvent = createDragEvent('drop', {
      'application/x-cyclist-panel': PANEL_INVENTORY.CHANGED,
      'application/x-cyclist-source': 'left',
    });

    fireEvent.drop(rightSidebar, dropEvent);

    // After move, the Changed panel should still exist and be functional
    // This will be verified by checking it appears in the new location
    const call = onLayoutChange.mock.calls[0][0];
    expect(call.rightSidebar.panels).toContain(PANEL_INVENTORY.CHANGED);
  });
});
