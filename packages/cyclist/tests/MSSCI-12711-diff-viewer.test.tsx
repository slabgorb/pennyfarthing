/**
 * MSSCI-12711: DiffViewer Component Tests
 *
 * Story: DiffViewer Component (Epic 71: Codebase Awareness)
 *
 * Acceptance Criteria:
 * - AC1: Side-by-side or unified diff view - Component supports both viewing modes with toggle
 * - AC2: Syntax highlighting per file type - Code diffs are syntax highlighted based on file extension
 * - AC3: Green additions, red deletions - Standard diff coloring for added/removed lines
 * - AC4: Keyboard navigation between hunks - Users can navigate between diff hunks using keyboard
 * - AC5: Toggle partial/full file view - Users can switch between viewing just changed hunks or full file context
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// =============================================================================
// Types (to be implemented in DiffViewer.tsx)
// =============================================================================

export type DiffLineType = 'added' | 'removed' | 'unchanged';

export type ViewMode = 'unified' | 'side-by-side';

export type FileViewMode = 'partial' | 'full';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffData {
  filePath: string;
  oldContent: string;
  newContent: string;
  hunks: DiffHunk[];
}

export interface DiffViewerProps {
  data: DiffData;
  viewMode?: ViewMode;
  fileViewMode?: FileViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  onFileViewModeChange?: (mode: FileViewMode) => void;
  onHunkNavigate?: (hunkIndex: number) => void;
}

// =============================================================================
// Test Data
// =============================================================================

const createDiffData = (overrides: Partial<DiffData> = {}): DiffData => ({
  filePath: '/src/components/Example.tsx',
  oldContent: 'const x = 1;\nconst y = 2;\nconst z = 3;',
  newContent: 'const x = 1;\nconst y = 42;\nconst z = 3;',
  hunks: [
    {
      oldStart: 1,
      oldCount: 3,
      newStart: 1,
      newCount: 3,
      lines: [
        { type: 'unchanged', content: 'const x = 1;', oldLineNumber: 1, newLineNumber: 1 },
        { type: 'removed', content: 'const y = 2;', oldLineNumber: 2 },
        { type: 'added', content: 'const y = 42;', newLineNumber: 2 },
        { type: 'unchanged', content: 'const z = 3;', oldLineNumber: 3, newLineNumber: 3 },
      ],
    },
  ],
  ...overrides,
});

const createMultiHunkDiffData = (): DiffData => ({
  filePath: '/src/utils/helpers.ts',
  oldContent: 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10',
  newContent: 'line1\nchanged2\nline3\nline4\nline5\nline6\nline7\nchanged8\nline9\nline10',
  hunks: [
    {
      oldStart: 1,
      oldCount: 3,
      newStart: 1,
      newCount: 3,
      lines: [
        { type: 'unchanged', content: 'line1', oldLineNumber: 1, newLineNumber: 1 },
        { type: 'removed', content: 'line2', oldLineNumber: 2 },
        { type: 'added', content: 'changed2', newLineNumber: 2 },
        { type: 'unchanged', content: 'line3', oldLineNumber: 3, newLineNumber: 3 },
      ],
    },
    {
      oldStart: 7,
      oldCount: 3,
      newStart: 7,
      newCount: 3,
      lines: [
        { type: 'unchanged', content: 'line7', oldLineNumber: 7, newLineNumber: 7 },
        { type: 'removed', content: 'line8', oldLineNumber: 8 },
        { type: 'added', content: 'changed8', newLineNumber: 8 },
        { type: 'unchanged', content: 'line9', oldLineNumber: 9, newLineNumber: 9 },
      ],
    },
  ],
});

// =============================================================================
// AC1: Side-by-side or unified diff view
// =============================================================================

describe('MSSCI-12711: DiffViewer Component', () => {
  describe('AC1: Side-by-side or unified diff view', () => {
    it('should render in unified view mode by default', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData();

      render(<DiffViewer data={data} />);

      expect(screen.getByRole('region', { name: /diff viewer/i })).toBeInTheDocument();
      expect(screen.getByTestId('diff-unified')).toBeInTheDocument();
    });

    it('should render in side-by-side mode when specified', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData();

      render(<DiffViewer data={data} viewMode="side-by-side" />);

      expect(screen.getByTestId('diff-side-by-side')).toBeInTheDocument();
    });

    it('should display view mode toggle button', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData();

      render(<DiffViewer data={data} />);

      expect(screen.getByRole('button', { name: /toggle.*view/i })).toBeInTheDocument();
    });

    it('should switch from unified to side-by-side when toggle clicked', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData();
      const onViewModeChange = vi.fn();

      render(<DiffViewer data={data} onViewModeChange={onViewModeChange} />);

      const toggleButton = screen.getByRole('button', { name: /toggle.*view/i });
      await userEvent.click(toggleButton);

      expect(onViewModeChange).toHaveBeenCalledWith('side-by-side');
    });

    it('should switch from side-by-side to unified when toggle clicked', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData();
      const onViewModeChange = vi.fn();

      render(<DiffViewer data={data} viewMode="side-by-side" onViewModeChange={onViewModeChange} />);

      const toggleButton = screen.getByRole('button', { name: /toggle.*view/i });
      await userEvent.click(toggleButton);

      expect(onViewModeChange).toHaveBeenCalledWith('unified');
    });

    it('should show old content in left panel for side-by-side', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData({
        oldContent: 'OLD_CONTENT_HERE',
        newContent: 'NEW_CONTENT_HERE',
        hunks: [
          {
            oldStart: 1, oldCount: 1, newStart: 1, newCount: 1,
            lines: [
              { type: 'removed', content: 'OLD_CONTENT_HERE', oldLineNumber: 1 },
              { type: 'added', content: 'NEW_CONTENT_HERE', newLineNumber: 1 },
            ],
          },
        ],
      });

      render(<DiffViewer data={data} viewMode="side-by-side" />);

      const leftPanel = screen.getByTestId('diff-panel-old');
      expect(leftPanel).toHaveTextContent('OLD_CONTENT_HERE');
    });

    it('should show new content in right panel for side-by-side', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData({
        oldContent: 'OLD_CONTENT_HERE',
        newContent: 'NEW_CONTENT_HERE',
        hunks: [
          {
            oldStart: 1, oldCount: 1, newStart: 1, newCount: 1,
            lines: [
              { type: 'removed', content: 'OLD_CONTENT_HERE', oldLineNumber: 1 },
              { type: 'added', content: 'NEW_CONTENT_HERE', newLineNumber: 1 },
            ],
          },
        ],
      });

      render(<DiffViewer data={data} viewMode="side-by-side" />);

      const rightPanel = screen.getByTestId('diff-panel-new');
      expect(rightPanel).toHaveTextContent('NEW_CONTENT_HERE');
    });

    it('should display file path in header', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData({ filePath: '/src/utils/myFile.ts' });

      render(<DiffViewer data={data} />);

      expect(screen.getByText('/src/utils/myFile.ts')).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // AC2: Syntax highlighting per file type
  // ===========================================================================

  describe('AC2: Syntax highlighting per file type', () => {
    it('should apply TypeScript language class for .ts files', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData({ filePath: '/src/utils/helper.ts' });

      render(<DiffViewer data={data} />);

      const viewer = screen.getByTestId('diff-viewer');
      expect(viewer).toHaveClass('lang-typescript');
    });

    it('should apply TypeScript language class for .tsx files', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData({ filePath: '/src/components/Button.tsx' });

      render(<DiffViewer data={data} />);

      const viewer = screen.getByTestId('diff-viewer');
      expect(viewer).toHaveClass('lang-typescript');
    });

    it('should apply JavaScript language class for .js files', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData({ filePath: '/src/legacy/script.js' });

      render(<DiffViewer data={data} />);

      const viewer = screen.getByTestId('diff-viewer');
      expect(viewer).toHaveClass('lang-javascript');
    });

    it('should apply CSS language class for .css files', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData({ filePath: '/src/styles/main.css' });

      render(<DiffViewer data={data} />);

      const viewer = screen.getByTestId('diff-viewer');
      expect(viewer).toHaveClass('lang-css');
    });

    it('should apply JSON language class for .json files', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData({ filePath: '/package.json' });

      render(<DiffViewer data={data} />);

      const viewer = screen.getByTestId('diff-viewer');
      expect(viewer).toHaveClass('lang-json');
    });

    it('should apply Python language class for .py files', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData({ filePath: '/scripts/build.py' });

      render(<DiffViewer data={data} />);

      const viewer = screen.getByTestId('diff-viewer');
      expect(viewer).toHaveClass('lang-python');
    });

    it('should apply plain language class for unknown extensions', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData({ filePath: '/config/settings.xyz' });

      render(<DiffViewer data={data} />);

      const viewer = screen.getByTestId('diff-viewer');
      expect(viewer).toHaveClass('lang-plain');
    });

    it('should apply markdown language class for .md files', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData({ filePath: '/README.md' });

      render(<DiffViewer data={data} />);

      const viewer = screen.getByTestId('diff-viewer');
      expect(viewer).toHaveClass('lang-markdown');
    });

    it('should handle dotfiles correctly', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData({ filePath: '/.gitignore' });

      render(<DiffViewer data={data} />);

      const viewer = screen.getByTestId('diff-viewer');
      expect(viewer).toHaveClass('lang-gitignore');
    });
  });

  // ===========================================================================
  // AC3: Green additions, red deletions
  // ===========================================================================

  describe('AC3: Green additions, red deletions', () => {
    it('should mark added lines with added class', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData();

      render(<DiffViewer data={data} />);

      const addedLines = screen.getAllByTestId('diff-line-added');
      expect(addedLines.length).toBeGreaterThan(0);
      expect(addedLines[0]).toHaveClass('diff-line-added');
    });

    it('should mark removed lines with removed class', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData();

      render(<DiffViewer data={data} />);

      const removedLines = screen.getAllByTestId('diff-line-removed');
      expect(removedLines.length).toBeGreaterThan(0);
      expect(removedLines[0]).toHaveClass('diff-line-removed');
    });

    it('should mark unchanged lines with unchanged class', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData();

      render(<DiffViewer data={data} />);

      const unchangedLines = screen.getAllByTestId('diff-line-unchanged');
      expect(unchangedLines.length).toBeGreaterThan(0);
      expect(unchangedLines[0]).toHaveClass('diff-line-unchanged');
    });

    it('should display + prefix for added lines', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData();

      render(<DiffViewer data={data} />);

      const addedLines = screen.getAllByTestId('diff-line-added');
      expect(addedLines[0]).toHaveTextContent('+');
    });

    it('should display - prefix for removed lines', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData();

      render(<DiffViewer data={data} />);

      const removedLines = screen.getAllByTestId('diff-line-removed');
      expect(removedLines[0]).toHaveTextContent('-');
    });

    it('should display space prefix for unchanged lines', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData();

      render(<DiffViewer data={data} />);

      const prefix = screen.getAllByTestId('diff-line-prefix-unchanged');
      expect(prefix[0]).toHaveTextContent(' ');
    });

    it('should display line numbers for all lines', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData();

      render(<DiffViewer data={data} />);

      const lineNumbers = screen.getAllByTestId(/^diff-line-number/);
      expect(lineNumbers.length).toBeGreaterThan(0);
    });

    it('should show old line number for removed lines', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData();

      render(<DiffViewer data={data} />);

      const removedLine = screen.getAllByTestId('diff-line-removed')[0];
      const oldLineNum = removedLine.querySelector('[data-testid="diff-line-number-old"]');
      expect(oldLineNum).toHaveTextContent('2');
    });

    it('should show new line number for added lines', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData();

      render(<DiffViewer data={data} />);

      const addedLine = screen.getAllByTestId('diff-line-added')[0];
      const newLineNum = addedLine.querySelector('[data-testid="diff-line-number-new"]');
      expect(newLineNum).toHaveTextContent('2');
    });
  });

  // ===========================================================================
  // AC4: Keyboard navigation between hunks
  // ===========================================================================

  describe('AC4: Keyboard navigation between hunks', () => {
    it('should focus on first hunk by default', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();

      render(<DiffViewer data={data} />);

      const hunks = screen.getAllByTestId('diff-hunk');
      expect(hunks[0]).toHaveAttribute('tabindex', '0');
    });

    it('should navigate to next hunk with j or ArrowDown', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();
      const onHunkNavigate = vi.fn();

      render(<DiffViewer data={data} onHunkNavigate={onHunkNavigate} />);

      const viewer = screen.getByTestId('diff-viewer');
      fireEvent.keyDown(viewer, { key: 'j' });

      expect(onHunkNavigate).toHaveBeenCalledWith(1);
    });

    it('should navigate to previous hunk with k or ArrowUp', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();
      const onHunkNavigate = vi.fn();

      render(<DiffViewer data={data} onHunkNavigate={onHunkNavigate} />);

      // First navigate to hunk 1
      const viewer = screen.getByTestId('diff-viewer');
      fireEvent.keyDown(viewer, { key: 'j' });

      // Then navigate back
      fireEvent.keyDown(viewer, { key: 'k' });

      expect(onHunkNavigate).toHaveBeenLastCalledWith(0);
    });

    it('should navigate to next hunk with n', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();
      const onHunkNavigate = vi.fn();

      render(<DiffViewer data={data} onHunkNavigate={onHunkNavigate} />);

      const viewer = screen.getByTestId('diff-viewer');
      fireEvent.keyDown(viewer, { key: 'n' });

      expect(onHunkNavigate).toHaveBeenCalledWith(1);
    });

    it('should navigate to previous hunk with N (shift+n)', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();
      const onHunkNavigate = vi.fn();

      render(<DiffViewer data={data} onHunkNavigate={onHunkNavigate} />);

      const viewer = screen.getByTestId('diff-viewer');
      fireEvent.keyDown(viewer, { key: 'j' }); // Go to hunk 1
      fireEvent.keyDown(viewer, { key: 'N', shiftKey: true }); // Go back

      expect(onHunkNavigate).toHaveBeenLastCalledWith(0);
    });

    it('should not navigate before first hunk', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();
      const onHunkNavigate = vi.fn();

      render(<DiffViewer data={data} onHunkNavigate={onHunkNavigate} />);

      const viewer = screen.getByTestId('diff-viewer');
      fireEvent.keyDown(viewer, { key: 'k' });

      // Should not call with negative index
      expect(onHunkNavigate).not.toHaveBeenCalled();
    });

    it('should not navigate past last hunk', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();
      const onHunkNavigate = vi.fn();

      render(<DiffViewer data={data} onHunkNavigate={onHunkNavigate} />);

      const viewer = screen.getByTestId('diff-viewer');
      // Navigate past the last hunk
      fireEvent.keyDown(viewer, { key: 'j' });
      fireEvent.keyDown(viewer, { key: 'j' });
      fireEvent.keyDown(viewer, { key: 'j' });

      // Should only be called twice (0->1, then stops at 1)
      expect(onHunkNavigate).toHaveBeenCalledTimes(2);
    });

    it('should scroll focused hunk into view', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();

      render(<DiffViewer data={data} />);

      const hunks = screen.getAllByTestId('diff-hunk');
      const scrollIntoViewMock = vi.fn();
      hunks[1].scrollIntoView = scrollIntoViewMock;

      const viewer = screen.getByTestId('diff-viewer');
      fireEvent.keyDown(viewer, { key: 'j' });

      expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    });

    it('should highlight focused hunk visually', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();

      render(<DiffViewer data={data} />);

      const viewer = screen.getByTestId('diff-viewer');
      fireEvent.keyDown(viewer, { key: 'j' });

      const hunks = screen.getAllByTestId('diff-hunk');
      expect(hunks[1]).toHaveClass('diff-hunk-focused');
    });

    it('should display hunk header with line ranges', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();

      render(<DiffViewer data={data} />);

      const hunkHeaders = screen.getAllByTestId('diff-hunk-header');
      expect(hunkHeaders[0]).toHaveTextContent('@@ -1,3 +1,3 @@');
      expect(hunkHeaders[1]).toHaveTextContent('@@ -7,3 +7,3 @@');
    });
  });

  // ===========================================================================
  // AC5: Toggle partial/full file view
  // ===========================================================================

  describe('AC5: Toggle partial/full file view', () => {
    it('should render in partial view mode by default', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();

      render(<DiffViewer data={data} />);

      expect(screen.getByTestId('diff-partial-view')).toBeInTheDocument();
    });

    it('should render in full view mode when specified', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();

      render(<DiffViewer data={data} fileViewMode="full" />);

      expect(screen.getByTestId('diff-full-view')).toBeInTheDocument();
    });

    it('should display file view mode toggle button', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();

      render(<DiffViewer data={data} />);

      expect(screen.getByRole('button', { name: /show full file|show changes only/i })).toBeInTheDocument();
    });

    it('should switch from partial to full view when toggle clicked', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();
      const onFileViewModeChange = vi.fn();

      render(<DiffViewer data={data} onFileViewModeChange={onFileViewModeChange} />);

      const toggleButton = screen.getByRole('button', { name: /show full file/i });
      await userEvent.click(toggleButton);

      expect(onFileViewModeChange).toHaveBeenCalledWith('full');
    });

    it('should switch from full to partial view when toggle clicked', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();
      const onFileViewModeChange = vi.fn();

      render(<DiffViewer data={data} fileViewMode="full" onFileViewModeChange={onFileViewModeChange} />);

      const toggleButton = screen.getByRole('button', { name: /show changes only/i });
      await userEvent.click(toggleButton);

      expect(onFileViewModeChange).toHaveBeenCalledWith('partial');
    });

    it('should show only changed hunks in partial view', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();

      render(<DiffViewer data={data} fileViewMode="partial" />);

      // Should only show 2 hunks (the changed sections)
      const hunks = screen.getAllByTestId('diff-hunk');
      expect(hunks).toHaveLength(2);
    });

    it('should show all lines in full view', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();

      render(<DiffViewer data={data} fileViewMode="full" />);

      // Should show all 10 lines
      const lines = screen.getAllByTestId(/^diff-line/);
      expect(lines.length).toBeGreaterThanOrEqual(10);
    });

    it('should show expand button between hunks in partial view', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();

      render(<DiffViewer data={data} fileViewMode="partial" />);

      const expandButton = screen.getByRole('button', { name: /expand|show hidden lines/i });
      expect(expandButton).toBeInTheDocument();
    });

    it('should expand hidden lines when expand button clicked', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();

      render(<DiffViewer data={data} fileViewMode="partial" />);

      const expandButton = screen.getByRole('button', { name: /expand|show hidden lines/i });
      await userEvent.click(expandButton);

      // Should now show the hidden lines between hunks (lines 4, 5, 6)
      expect(screen.getByText('line4')).toBeInTheDocument();
      expect(screen.getByText('line5')).toBeInTheDocument();
      expect(screen.getByText('line6')).toBeInTheDocument();
    });

    it('should indicate number of hidden lines between hunks', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();

      render(<DiffViewer data={data} fileViewMode="partial" />);

      // Should show something like "3 lines hidden" or "..." between hunks
      expect(screen.getByText(/3.*hidden|···/i)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle empty diff data', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData({
        oldContent: '',
        newContent: '',
        hunks: [],
      });

      render(<DiffViewer data={data} />);

      expect(screen.getByText(/no changes/i)).toBeInTheDocument();
    });

    it('should handle new file (empty old content)', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData({
        oldContent: '',
        newContent: 'new file content',
        hunks: [
          {
            oldStart: 0,
            oldCount: 0,
            newStart: 1,
            newCount: 1,
            lines: [{ type: 'added', content: 'new file content', newLineNumber: 1 }],
          },
        ],
      });

      render(<DiffViewer data={data} />);

      expect(screen.getByText(/new file/i)).toBeInTheDocument();
    });

    it('should handle deleted file (empty new content)', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData({
        oldContent: 'deleted content',
        newContent: '',
        hunks: [
          {
            oldStart: 1,
            oldCount: 1,
            newStart: 0,
            newCount: 0,
            lines: [{ type: 'removed', content: 'deleted content', oldLineNumber: 1 }],
          },
        ],
      });

      render(<DiffViewer data={data} />);

      expect(screen.getByText(/file deleted/i)).toBeInTheDocument();
    });

    it('should escape HTML in diff content', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData({
        hunks: [
          {
            oldStart: 1,
            oldCount: 1,
            newStart: 1,
            newCount: 1,
            lines: [
              { type: 'added', content: '<script>alert("xss")</script>', newLineNumber: 1 },
            ],
          },
        ],
      });

      render(<DiffViewer data={data} />);

      // Content should be visible as text, not executed
      expect(screen.getByText(/<script>alert/)).toBeInTheDocument();
      expect(document.querySelector('script')).toBeNull();
    });

    it('should handle very long lines', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const longLine = 'x'.repeat(10000);
      const data = createDiffData({
        hunks: [
          {
            oldStart: 1,
            oldCount: 1,
            newStart: 1,
            newCount: 1,
            lines: [{ type: 'unchanged', content: longLine, oldLineNumber: 1, newLineNumber: 1 }],
          },
        ],
      });

      render(<DiffViewer data={data} />);

      const viewer = screen.getByTestId('diff-viewer');
      expect(viewer).toBeInTheDocument();
    });

    it('should handle Unicode content', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData({
        hunks: [
          {
            oldStart: 1,
            oldCount: 1,
            newStart: 1,
            newCount: 1,
            lines: [
              { type: 'unchanged', content: 'const greeting = "Hello, 世界!";', oldLineNumber: 1, newLineNumber: 1 },
            ],
          },
        ],
      });

      render(<DiffViewer data={data} />);

      expect(screen.getByText(/世界/)).toBeInTheDocument();
    });

    it('should handle whitespace-only changes', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData({
        oldContent: 'const x = 1; ',
        newContent: 'const x = 1;',
        hunks: [
          {
            oldStart: 1,
            oldCount: 1,
            newStart: 1,
            newCount: 1,
            lines: [
              { type: 'removed', content: 'const x = 1; ', oldLineNumber: 1 },
              { type: 'added', content: 'const x = 1;', newLineNumber: 1 },
            ],
          },
        ],
      });

      render(<DiffViewer data={data} />);

      // Should show the change even though it's whitespace
      const removedLines = screen.getAllByTestId('diff-line-removed');
      expect(removedLines.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Accessibility
  // ===========================================================================

  describe('Accessibility', () => {
    it('should have accessible role for diff viewer', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData();

      render(<DiffViewer data={data} />);

      expect(screen.getByRole('region', { name: /diff viewer/i })).toBeInTheDocument();
    });

    it('should announce line type to screen readers', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createDiffData();

      render(<DiffViewer data={data} />);

      const addedLines = screen.getAllByTestId('diff-line-added');
      expect(addedLines[0]).toHaveAttribute('aria-label', expect.stringContaining('added'));
    });

    it('should support keyboard focus on hunks', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();

      render(<DiffViewer data={data} />);

      const hunks = screen.getAllByTestId('diff-hunk');
      expect(hunks[0]).toHaveAttribute('tabindex', '0');
    });

    it('should announce current hunk position', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer.js');
      const data = createMultiHunkDiffData();

      render(<DiffViewer data={data} />);

      const viewer = screen.getByTestId('diff-viewer');
      fireEvent.keyDown(viewer, { key: 'j' });

      // Should have aria-live region announcing position
      expect(screen.getByText(/hunk 2 of 2/i)).toBeInTheDocument();
    });
  });
});
