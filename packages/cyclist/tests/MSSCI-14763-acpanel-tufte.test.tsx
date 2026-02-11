/**
 * MSSCI-14763: ACPanel Tufte Treatment Tests
 *
 * Tests for applying Tufte minimalist styling to ACPanel.
 * Verifies DOM structure changes and class presence for the
 * Tufte treatment (progress text above bar, ac-* class namespace).
 *
 * Story: MSSCI-14763 - Style ACPanel with Tufte treatment
 * Epic: MSSCI-14758 (Cyclist UI Polish — Epic 100)
 *
 * Acceptance Criteria:
 * - AC1: ACPanel receives Tufte styling (no background box, no rounded corners)
 * - AC2: Progress bar is styled minimally with clean typography
 * - AC3: Left border accent (2px solid) changes on hover to accent color
 * - AC4: AC items display with clean typography hierarchy
 * - AC5: Completed items show checkmark with success color, pending items show circle
 * - AC6: Layout is compact and aligned vertically
 * - AC7: No CSS conflicts with existing todo-panel styling
 * - AC8: Visual appearance matches ToolCallBlock Tufte minimalism
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import React from 'react';

expect.extend(matchers);

// ============================================================================
// Mock Setup
// ============================================================================

const mockStoryData = {
  story: {
    criteria: [
      { text: 'First criterion', completed: true },
      { text: 'Second criterion', completed: false },
      { text: 'Third criterion', completed: false },
    ],
  },
  isLoading: false,
  error: null,
};

vi.mock('../src/public/hooks/useStory', () => ({
  useStory: vi.fn(() => mockStoryData),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ============================================================================
// AC2: Progress text appears ABOVE the progress bar (Tufte: no overlay)
// ============================================================================

describe('AC2: Progress bar Tufte layout', () => {
  it('should render progress-text before progress-bar-container in DOM order', async () => {
    const { ACPanel } = await import('../src/public/components/panels/ACPanel');
    const { container } = render(<ACPanel />);

    const acContent = container.querySelector('.ac-content');
    expect(acContent).not.toBeNull();

    // Get direct children of ac-content that are progress-related
    const progressText = acContent!.querySelector('.progress-text');
    const progressBarContainer = acContent!.querySelector('.progress-bar-container');

    expect(progressText).not.toBeNull();
    expect(progressBarContainer).not.toBeNull();

    // progress-text must come BEFORE progress-bar-container in DOM order
    // Using compareDocumentPosition: DOCUMENT_POSITION_FOLLOWING = 4
    const position = progressText!.compareDocumentPosition(progressBarContainer!);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('should render progress-text as a standalone element, not inside progress-bar-container', async () => {
    const { ACPanel } = await import('../src/public/components/panels/ACPanel');
    const { container } = render(<ACPanel />);

    const progressBarContainer = container.querySelector('.progress-bar-container');
    const textInsideBar = progressBarContainer?.querySelector('.progress-text');

    // progress-text should NOT be a child of progress-bar-container
    expect(textInsideBar).toBeNull();
  });
});

// ============================================================================
// AC4 + AC5: Criteria items use ac-* class namespace with correct states
// ============================================================================

describe('AC4/AC5: Criteria item classes and states', () => {
  it('should render completed items with ac-done class', async () => {
    const { ACPanel } = await import('../src/public/components/panels/ACPanel');
    render(<ACPanel />);

    const completedItem = screen.getByText('First criterion').closest('.ac-item');
    expect(completedItem).toHaveClass('ac-done');
  });

  it('should render pending items without ac-done class', async () => {
    const { ACPanel } = await import('../src/public/components/panels/ACPanel');
    render(<ACPanel />);

    const pendingItem = screen.getByText('Second criterion').closest('.ac-item');
    expect(pendingItem).not.toHaveClass('ac-done');
  });

  it('should render checkmark icon for completed items', async () => {
    const { ACPanel } = await import('../src/public/components/panels/ACPanel');
    const { container } = render(<ACPanel />);

    const doneItems = container.querySelectorAll('.ac-done .ac-icon');
    expect(doneItems.length).toBe(1);
    // ✓ character
    expect(doneItems[0].textContent).toBe('\u2713');
  });

  it('should render circle icon for pending items', async () => {
    const { ACPanel } = await import('../src/public/components/panels/ACPanel');
    const { container } = render(<ACPanel />);

    const pendingItems = container.querySelectorAll('.ac-item:not(.ac-done) .ac-icon');
    expect(pendingItems.length).toBe(2);
    // ○ character
    expect(pendingItems[0].textContent).toBe('\u25CB');
  });
});

// ============================================================================
// AC6: Layout structure uses ac-* class namespace
// ============================================================================

describe('AC6: ACPanel structure uses ac-* classes', () => {
  it('should wrap content in ac-content container', async () => {
    const { ACPanel } = await import('../src/public/components/panels/ACPanel');
    const { container } = render(<ACPanel />);

    const panel = container.querySelector('.ac-panel');
    const content = panel?.querySelector('.ac-content');
    expect(content).not.toBeNull();
  });

  it('should wrap criteria in ac-list container', async () => {
    const { ACPanel } = await import('../src/public/components/panels/ACPanel');
    const { container } = render(<ACPanel />);

    const list = container.querySelector('.ac-list');
    expect(list).not.toBeNull();

    const items = list!.querySelectorAll('.ac-item');
    expect(items.length).toBe(3);
  });

  it('should render each item with ac-icon and ac-text children', async () => {
    const { ACPanel } = await import('../src/public/components/panels/ACPanel');
    const { container } = render(<ACPanel />);

    const items = container.querySelectorAll('.ac-item');
    items.forEach(item => {
      expect(item.querySelector('.ac-icon')).not.toBeNull();
      expect(item.querySelector('.ac-text')).not.toBeNull();
    });
  });
});

// ============================================================================
// AC7: No class collision with todo-panel
// ============================================================================

describe('AC7: ACPanel does not use todo-* classes', () => {
  it('should use ac-panel, not todo-panel as root class', async () => {
    const { ACPanel } = await import('../src/public/components/panels/ACPanel');
    const { container } = render(<ACPanel />);

    expect(container.querySelector('.ac-panel')).not.toBeNull();
    expect(container.querySelector('.todo-panel')).toBeNull();
  });

  it('should use ac-item, not todo-item for criteria', async () => {
    const { ACPanel } = await import('../src/public/components/panels/ACPanel');
    const { container } = render(<ACPanel />);

    expect(container.querySelectorAll('.ac-item').length).toBe(3);
    expect(container.querySelectorAll('.todo-item').length).toBe(0);
  });
});
