/**
 * 24-3: Enhanced Diff Viewer with History Navigation
 *
 * Tests for navigating between multiple edits to the same file.
 *
 * Acceptance Criteria:
 * - AC1: Navigate between partial diffs with < > arrows
 * - AC2: Shows "Edit N of M" indicator
 * - AC3: Combined diff view shows all changes merged
 * - AC4: Original file view shows pre-edit content
 * - AC5: Changed file view shows current content
 * - AC6: Keyboard navigation works (arrows or j/k)
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import from actual implementation - these will fail until implemented
import {
  createFileHistory,
  addDiffToHistory,
  getCurrentDiff,
  navigatePrevious,
  navigateNext,
  hasPrevious,
  hasNext,
  getPositionIndicator,
  getCombinedDiff,
  getCurrentContent,
  handleKeyboardNavigation,
  createViewState,
  setViewMode,
  renderNavigationControls,
  renderViewModeTabs,
  renderDiffWithMode,
  type DiffData,
  type FileHistory,
  type ViewMode,
  type ViewState,
} from '../src/public/js/components/DiffHistoryManager.js';

// =============================================================================
// Test Helpers
// =============================================================================

const createDiffData = (overrides: Partial<DiffData> = {}): DiffData => ({
  id: `diff-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  filePath: '/path/to/file.ts',
  oldContent: 'const x = 1;',
  newContent: 'const x = 2;',
  toolType: 'Edit',
  timestamp: Date.now(),
  ...overrides,
});

// Simulate multiple edits to the same file
const createEditSequence = (filePath: string, edits: Array<{ old: string; new: string }>): DiffData[] => {
  return edits.map((edit, i) => createDiffData({
    id: `edit-${i + 1}`,
    filePath,
    oldContent: edit.old,
    newContent: edit.new,
    timestamp: Date.now() + i * 1000,
  }));
};

// =============================================================================
// AC1: Navigate Between Partial Diffs with < > Arrows
// =============================================================================

describe('24-3: Diff History Navigation', () => {

  describe('AC1: Navigate between partial diffs with < > arrows', () => {

    it('should track multiple diffs for the same file', () => {
      const history = createFileHistory('/src/file.ts');

      addDiffToHistory(history, createDiffData({
        filePath: '/src/file.ts',
        oldContent: 'line 1',
        newContent: 'line 1 modified',
      }));

      addDiffToHistory(history, createDiffData({
        filePath: '/src/file.ts',
        oldContent: 'line 1 modified',
        newContent: 'line 1 modified again',
      }));

      expect(history.diffs).toHaveLength(2);
    });

    it('should default currentIndex to most recent diff', () => {
      const history = createFileHistory('/src/file.ts');

      addDiffToHistory(history, createDiffData({ id: 'edit-1' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-2' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-3' }));

      expect(history.currentIndex).toBe(2); // 0-indexed, so 2 = third item
    });

    it('should navigate to previous diff', () => {
      const history = createFileHistory('/src/file.ts');
      addDiffToHistory(history, createDiffData({ id: 'edit-1' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-2' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-3' }));

      navigatePrevious(history);

      expect(history.currentIndex).toBe(1);
      expect(getCurrentDiff(history).id).toBe('edit-2');
    });

    it('should navigate to next diff', () => {
      const history = createFileHistory('/src/file.ts');
      addDiffToHistory(history, createDiffData({ id: 'edit-1' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-2' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-3' }));
      history.currentIndex = 0; // Start at first

      navigateNext(history);

      expect(history.currentIndex).toBe(1);
      expect(getCurrentDiff(history).id).toBe('edit-2');
    });

    it('should not navigate past first diff', () => {
      const history = createFileHistory('/src/file.ts');
      addDiffToHistory(history, createDiffData({ id: 'edit-1' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-2' }));
      history.currentIndex = 0;

      navigatePrevious(history);

      expect(history.currentIndex).toBe(0);
    });

    it('should not navigate past last diff', () => {
      const history = createFileHistory('/src/file.ts');
      addDiffToHistory(history, createDiffData({ id: 'edit-1' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-2' }));
      history.currentIndex = 1;

      navigateNext(history);

      expect(history.currentIndex).toBe(1);
    });

    it('should return hasPrevious/hasNext status', () => {
      const history = createFileHistory('/src/file.ts');
      addDiffToHistory(history, createDiffData({ id: 'edit-1' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-2' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-3' }));

      // At last (index 2)
      expect(hasPrevious(history)).toBe(true);
      expect(hasNext(history)).toBe(false);

      // At middle (index 1)
      history.currentIndex = 1;
      expect(hasPrevious(history)).toBe(true);
      expect(hasNext(history)).toBe(true);

      // At first (index 0)
      history.currentIndex = 0;
      expect(hasPrevious(history)).toBe(false);
      expect(hasNext(history)).toBe(true);
    });

  });

  // ===========================================================================
  // AC2: Shows "Edit N of M" Indicator
  // ===========================================================================

  describe('AC2: Shows "Edit N of M" indicator', () => {

    it('should return position indicator text', () => {
      const history = createFileHistory('/src/file.ts');
      addDiffToHistory(history, createDiffData({ id: 'edit-1' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-2' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-3' }));

      history.currentIndex = 1; // Second edit

      const indicator = getPositionIndicator(history);

      expect(indicator).toBe('Edit 2 of 3');
    });

    it('should update indicator on navigation', () => {
      const history = createFileHistory('/src/file.ts');
      addDiffToHistory(history, createDiffData({ id: 'edit-1' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-2' }));

      expect(getPositionIndicator(history)).toBe('Edit 2 of 2');

      navigatePrevious(history);

      expect(getPositionIndicator(history)).toBe('Edit 1 of 2');
    });

    it('should show "Edit 1 of 1" for single edit', () => {
      const history = createFileHistory('/src/file.ts');
      addDiffToHistory(history, createDiffData({ id: 'edit-1' }));

      const indicator = getPositionIndicator(history);

      expect(indicator).toBe('Edit 1 of 1');
    });

    it('should render navigation UI with indicator', () => {
      const container = document.createElement('div');
      const history = createFileHistory('/src/file.ts');
      addDiffToHistory(history, createDiffData({ id: 'edit-1' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-2' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-3' }));

      renderNavigationControls(container, history);

      expect(container.querySelector('.diff-nav-indicator')?.textContent).toBe('Edit 3 of 3');
      expect(container.querySelector('.diff-nav-prev')).toBeTruthy();
      expect(container.querySelector('.diff-nav-next')).toBeTruthy();
    });

    it('should disable prev button at first edit', () => {
      const container = document.createElement('div');
      const history = createFileHistory('/src/file.ts');
      addDiffToHistory(history, createDiffData({ id: 'edit-1' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-2' }));
      history.currentIndex = 0;

      renderNavigationControls(container, history);

      const prevBtn = container.querySelector('.diff-nav-prev') as HTMLButtonElement;
      expect(prevBtn?.disabled).toBe(true);
    });

    it('should disable next button at last edit', () => {
      const container = document.createElement('div');
      const history = createFileHistory('/src/file.ts');
      addDiffToHistory(history, createDiffData({ id: 'edit-1' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-2' }));
      // currentIndex defaults to last (1)

      renderNavigationControls(container, history);

      const nextBtn = container.querySelector('.diff-nav-next') as HTMLButtonElement;
      expect(nextBtn?.disabled).toBe(true);
    });

  });

  // ===========================================================================
  // AC3: Combined Diff View Shows All Changes Merged
  // ===========================================================================

  describe('AC3: Combined diff view shows all changes merged', () => {

    it('should compute combined diff from original to current', () => {
      const history = createFileHistory('/src/file.ts');
      history.originalContent = 'original content';

      addDiffToHistory(history, createDiffData({
        oldContent: 'original content',
        newContent: 'first edit',
      }));
      addDiffToHistory(history, createDiffData({
        oldContent: 'first edit',
        newContent: 'second edit',
      }));
      addDiffToHistory(history, createDiffData({
        oldContent: 'second edit',
        newContent: 'final content',
      }));

      const combined = getCombinedDiff(history);

      expect(combined.oldContent).toBe('original content');
      expect(combined.newContent).toBe('final content');
    });

    it('should render combined diff view', () => {
      const container = document.createElement('div');
      const history = createFileHistory('/src/file.ts');
      history.originalContent = 'line 1\nline 2';

      addDiffToHistory(history, createDiffData({
        oldContent: 'line 1\nline 2',
        newContent: 'line 1 modified\nline 2',
      }));
      addDiffToHistory(history, createDiffData({
        oldContent: 'line 1 modified\nline 2',
        newContent: 'line 1 modified\nline 2 modified',
      }));

      renderDiffWithMode(container, history, 'combined');

      // Should show original -> final, not intermediate states
      expect(container.textContent).toContain('line 1');
      expect(container.textContent).toContain('line 1 modified');
      expect(container.textContent).toContain('line 2 modified');
    });

    it('should handle empty original content (new file)', () => {
      const history = createFileHistory('/src/new-file.ts');
      history.originalContent = '';

      addDiffToHistory(history, createDiffData({
        oldContent: '',
        newContent: 'new content',
        isNewFile: true,
      }));

      const combined = getCombinedDiff(history);

      expect(combined.oldContent).toBe('');
      expect(combined.newContent).toBe('new content');
      expect(combined.isNewFile).toBe(true);
    });

  });

  // ===========================================================================
  // AC4: Original File View Shows Pre-Edit Content
  // ===========================================================================

  describe('AC4: Original file view shows pre-edit content', () => {

    it('should track original content when first diff arrives', () => {
      const history = createFileHistory('/src/file.ts');

      addDiffToHistory(history, createDiffData({
        oldContent: 'original line 1\noriginal line 2',
        newContent: 'modified line 1\noriginal line 2',
      }));

      expect(history.originalContent).toBe('original line 1\noriginal line 2');
    });

    it('should preserve original content across multiple edits', () => {
      const history = createFileHistory('/src/file.ts');

      addDiffToHistory(history, createDiffData({
        oldContent: 'original',
        newContent: 'edit 1',
      }));
      addDiffToHistory(history, createDiffData({
        oldContent: 'edit 1',
        newContent: 'edit 2',
      }));
      addDiffToHistory(history, createDiffData({
        oldContent: 'edit 2',
        newContent: 'edit 3',
      }));

      // Original should still be the very first state
      expect(history.originalContent).toBe('original');
    });

    it('should render original file view', () => {
      const container = document.createElement('div');
      const history = createFileHistory('/src/file.ts');
      history.originalContent = 'original content here';

      addDiffToHistory(history, createDiffData({
        oldContent: 'original content here',
        newContent: 'modified content',
      }));

      renderDiffWithMode(container, history, 'original');

      expect(container.textContent).toContain('original content here');
      // Should not show diff markers, just the content
      expect(container.querySelector('.diff-line.added')).toBeNull();
      expect(container.querySelector('.diff-line.removed')).toBeNull();
    });

    it('should show empty state for new files in original view', () => {
      const container = document.createElement('div');
      const history = createFileHistory('/src/new-file.ts');
      history.originalContent = '';

      addDiffToHistory(history, createDiffData({
        oldContent: '',
        newContent: 'new file content',
        isNewFile: true,
      }));

      renderDiffWithMode(container, history, 'original');

      expect(container.textContent).toMatch(/new file|empty|no content/i);
    });

  });

  // ===========================================================================
  // AC5: Changed File View Shows Current Content
  // ===========================================================================

  describe('AC5: Changed file view shows current content', () => {

    it('should get current file content from latest diff', () => {
      const history = createFileHistory('/src/file.ts');

      addDiffToHistory(history, createDiffData({
        oldContent: 'v1',
        newContent: 'v2',
      }));
      addDiffToHistory(history, createDiffData({
        oldContent: 'v2',
        newContent: 'v3',
      }));
      addDiffToHistory(history, createDiffData({
        oldContent: 'v3',
        newContent: 'v4 - current',
      }));

      const current = getCurrentContent(history);

      expect(current).toBe('v4 - current');
    });

    it('should render current file view without diff markers', () => {
      const container = document.createElement('div');
      const history = createFileHistory('/src/file.ts');

      addDiffToHistory(history, createDiffData({
        oldContent: 'old',
        newContent: 'current content\nwith multiple lines',
      }));

      renderDiffWithMode(container, history, 'current');

      expect(container.textContent).toContain('current content');
      expect(container.textContent).toContain('with multiple lines');
      // No diff markers
      expect(container.querySelector('.diff-line.added')).toBeNull();
      expect(container.querySelector('.diff-line.removed')).toBeNull();
    });

    it('should apply syntax highlighting in current view', () => {
      const container = document.createElement('div');
      const history = createFileHistory('/src/component.tsx');

      addDiffToHistory(history, createDiffData({
        filePath: '/src/component.tsx',
        oldContent: '',
        newContent: 'const x = 1;',
      }));

      renderDiffWithMode(container, history, 'current');

      const viewer = container.querySelector('.diff-viewer, .file-viewer');
      expect(viewer?.classList.contains('lang-typescript')).toBe(true);
    });

  });

  // ===========================================================================
  // AC6: Keyboard Navigation Works (Arrows or j/k)
  // ===========================================================================

  describe('AC6: Keyboard navigation works (arrows or j/k)', () => {

    it('should navigate with left/right arrow keys', () => {
      const history = createFileHistory('/src/file.ts');
      addDiffToHistory(history, createDiffData({ id: 'edit-1' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-2' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-3' }));
      // Start at last (index 2)

      // Left arrow = previous
      const leftResult = handleKeyboardNavigation(history, 'ArrowLeft');
      expect(history.currentIndex).toBe(1);
      expect(leftResult).toBe(true);

      // Right arrow = next
      const rightResult = handleKeyboardNavigation(history, 'ArrowRight');
      expect(history.currentIndex).toBe(2);
      expect(rightResult).toBe(true);
    });

    it('should navigate with j/k keys (vim style)', () => {
      const history = createFileHistory('/src/file.ts');
      addDiffToHistory(history, createDiffData({ id: 'edit-1' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-2' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-3' }));

      // k = previous (up in vim)
      handleKeyboardNavigation(history, 'k');
      expect(history.currentIndex).toBe(1);

      // j = next (down in vim)
      handleKeyboardNavigation(history, 'j');
      expect(history.currentIndex).toBe(2);
    });

    it('should return false for non-navigation keys', () => {
      const history = createFileHistory('/src/file.ts');
      addDiffToHistory(history, createDiffData({ id: 'edit-1' }));

      const result = handleKeyboardNavigation(history, 'a');

      expect(result).toBe(false);
    });

    it('should return false when at boundary', () => {
      const history = createFileHistory('/src/file.ts');
      addDiffToHistory(history, createDiffData({ id: 'edit-1' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-2' }));
      history.currentIndex = 0;

      // Can't go previous from first
      const result = handleKeyboardNavigation(history, 'ArrowLeft');

      expect(result).toBe(false);
      expect(history.currentIndex).toBe(0);
    });

    it('should navigate with Home/End keys', () => {
      const history = createFileHistory('/src/file.ts');
      addDiffToHistory(history, createDiffData({ id: 'edit-1' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-2' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-3' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-4' }));
      history.currentIndex = 2;

      // Home = first
      handleKeyboardNavigation(history, 'Home');
      expect(history.currentIndex).toBe(0);

      // End = last
      handleKeyboardNavigation(history, 'End');
      expect(history.currentIndex).toBe(3);
    });

  });

  // ===========================================================================
  // View Mode Management
  // ===========================================================================

  describe('View Mode Management', () => {

    it('should default to partial view mode', () => {
      const state = createViewState();

      expect(state.mode).toBe('partial');
    });

    it('should switch between view modes', () => {
      const state = createViewState();

      setViewMode(state, 'combined');
      expect(state.mode).toBe('combined');

      setViewMode(state, 'original');
      expect(state.mode).toBe('original');

      setViewMode(state, 'current');
      expect(state.mode).toBe('current');

      setViewMode(state, 'partial');
      expect(state.mode).toBe('partial');
    });

    it('should render view mode tabs', () => {
      const container = document.createElement('div');
      const state = createViewState();

      renderViewModeTabs(container, state);

      expect(container.querySelector('[data-mode="partial"]')).toBeTruthy();
      expect(container.querySelector('[data-mode="combined"]')).toBeTruthy();
      expect(container.querySelector('[data-mode="original"]')).toBeTruthy();
      expect(container.querySelector('[data-mode="current"]')).toBeTruthy();
    });

    it('should highlight active view mode tab', () => {
      const container = document.createElement('div');
      const state = createViewState();
      state.mode = 'combined';

      renderViewModeTabs(container, state);

      const activeTab = container.querySelector('[data-mode="combined"]');
      expect(activeTab?.classList.contains('active')).toBe(true);
    });

  });

  // ===========================================================================
  // Integration with Existing Components
  // ===========================================================================

  describe('Integration', () => {

    it('should hide navigation when only one edit exists', () => {
      const container = document.createElement('div');
      const history = createFileHistory('/src/file.ts');
      addDiffToHistory(history, createDiffData({ id: 'only-edit' }));

      renderNavigationControls(container, history);

      // Navigation controls should be hidden or disabled
      const nav = container.querySelector('.diff-nav');
      expect(nav?.classList.contains('hidden') || nav === null).toBe(true);
    });

    it('should show navigation when multiple edits exist', () => {
      const container = document.createElement('div');
      const history = createFileHistory('/src/file.ts');
      addDiffToHistory(history, createDiffData({ id: 'edit-1' }));
      addDiffToHistory(history, createDiffData({ id: 'edit-2' }));

      renderNavigationControls(container, history);

      const nav = container.querySelector('.diff-nav');
      expect(nav).toBeTruthy();
      expect(nav?.classList.contains('hidden')).toBe(false);
    });

  });

});
