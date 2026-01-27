/**
 * MSSCI-12466: DIFFS panel - Show file line numbers instead of diff-relative
 *
 * Line numbers in diff viewer currently show position within the diff (1, 2, 3...),
 * not actual file line numbers. Developer needs to know which line in the file
 * to navigate to.
 *
 * Acceptance Criteria:
 * - AC1: Line numbers in diff view match actual file line numbers
 * - AC2: Works for both partial and combined views
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach } from 'vitest';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Extended DiffData interface with startLine for actual file position
 */
interface DiffData {
  id: string;
  filePath: string;
  oldContent: string;
  newContent: string;
  toolType: 'Edit' | 'Write';
  timestamp: number;
  isNewFile?: boolean;
  /** Starting line number in the actual file (1-indexed) */
  startLine?: number;
}

/**
 * Diff line with actual file line number
 */
interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  line: string;
  /** Line number in the actual file (not diff-relative) */
  lineNumber: number;
}

/**
 * SDK Tool Use Message
 */
interface SDKToolUseMessage {
  type: 'tool_use';
  tool_name: string;
  tool_id: string;
  input: Record<string, unknown>;
}

// =============================================================================
// Test Data
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

// =============================================================================
// AC1: Line numbers in diff view match actual file line numbers
// =============================================================================

describe('MSSCI-12466: DIFFS panel line numbers', () => {

  describe('AC1: Line numbers match actual file line numbers', () => {

    it('should include startLine in DiffData for Edit tool', () => {
      // When extracting diff data from Edit tool, we need to include
      // the starting line number where the edit occurs in the file
      const editMessage: SDKToolUseMessage = {
        type: 'tool_use',
        tool_name: 'Edit',
        tool_id: 'edit-123',
        input: {
          file_path: '/src/main.ts',
          old_string: 'console.log("hello");',
          new_string: 'console.log("world");',
        },
      };

      const diffData = extractDiffDataFromEdit(editMessage, { startLine: 42 });

      expect(diffData.startLine).toBe(42);
    });

    it('should compute diff with actual file line numbers when startLine provided', () => {
      // If edit starts at line 50 and has 3 lines, line numbers should be 50, 51, 52
      const oldContent = 'line one\nline two\nline three';
      const newContent = 'line one modified\nline two\nline three modified';

      const diff = computeDiffWithLineNumbers(oldContent, newContent, { startLine: 50 });

      // All line numbers should be offset by startLine
      const lineNumbers = diff.map(d => d.lineNumber);
      expect(lineNumbers).not.toContain(1);
      expect(lineNumbers).not.toContain(2);
      expect(lineNumbers).not.toContain(3);

      // Should contain actual file line numbers starting from 50
      expect(Math.min(...lineNumbers)).toBeGreaterThanOrEqual(50);
    });

    it('should show line 50 for first line when startLine is 50', () => {
      const content = 'single line edit';

      const diff = computeDiffWithLineNumbers(content, content, { startLine: 50 });

      expect(diff[0].lineNumber).toBe(50);
    });

    it('should increment line numbers correctly from startLine', () => {
      const content = 'line1\nline2\nline3\nline4';

      const diff = computeDiffWithLineNumbers(content, content, { startLine: 100 });

      const lineNumbers = diff.map(d => d.lineNumber);
      expect(lineNumbers).toEqual([100, 101, 102, 103]);
    });

    it('should default to line 1 when startLine not provided', () => {
      const content = 'first line\nsecond line';

      const diff = computeDiffWithLineNumbers(content, content);

      expect(diff[0].lineNumber).toBe(1);
      expect(diff[1].lineNumber).toBe(2);
    });

    it('should render actual file line numbers in DOM', () => {
      const container = document.createElement('div');
      const diffData = createDiffData({
        oldContent: 'old code\nmore old',
        newContent: 'new code\nmore new',
        startLine: 75,
      });

      renderDiffWithLineNumbers(container, diffData);

      const lineNumbers = container.querySelectorAll('.diff-line-number');
      const displayedNumbers = Array.from(lineNumbers).map(el => el.textContent);

      // Should show 75, 76 etc, NOT 1, 2
      expect(displayedNumbers).not.toContain('1');
      expect(displayedNumbers).not.toContain('2');
      expect(displayedNumbers.some(n => n === '75' || n === '76')).toBe(true);
    });

    it('should handle removed lines with original file line numbers', () => {
      const oldContent = 'line to remove\nanother line';
      const newContent = 'another line';

      const diff = computeDiffWithLineNumbers(oldContent, newContent, { startLine: 25 });
      const removedLines = diff.filter(d => d.type === 'removed');

      // Removed line should show it was at line 25 in original file
      expect(removedLines[0].lineNumber).toBe(25);
    });

    it('should handle added lines with correct file line numbers', () => {
      const oldContent = 'existing line';
      const newContent = 'existing line\nnew line added';

      const diff = computeDiffWithLineNumbers(oldContent, newContent, { startLine: 10 });
      const addedLines = diff.filter(d => d.type === 'added');

      // Added line appears after line 10, so it's at line 11
      expect(addedLines.some(line => line.lineNumber >= 10)).toBe(true);
    });

  });

  // ===========================================================================
  // AC2: Works for both partial and combined views
  // ===========================================================================

  describe('AC2: Works for partial and combined views', () => {

    describe('Partial view (Edit tool - snippet replacement)', () => {

      it('should show actual line numbers for partial file edit', () => {
        // Edit tool replaces a small section of a large file
        // The edit is at lines 150-155 of a 500-line file
        const diffData = createDiffData({
          oldContent: 'function oldName() {\n  return 1;\n}',
          newContent: 'function newName() {\n  return 2;\n}',
          startLine: 150,
          toolType: 'Edit',
        });

        const container = document.createElement('div');
        renderDiffWithLineNumbers(container, diffData);

        const content = container.textContent || '';
        // Should contain line numbers around 150, not 1, 2, 3
        expect(content).toMatch(/15[0-2]/);
        expect(content).not.toMatch(/^1\s/);
      });

      it('should preserve line number continuity in partial edits', () => {
        const oldContent = 'const a = 1;\nconst b = 2;\nconst c = 3;';
        const newContent = 'const a = 1;\nconst b = 999;\nconst c = 3;';

        const diff = computeDiffWithLineNumbers(oldContent, newContent, { startLine: 42 });

        // Unchanged lines should still have correct file line numbers
        const unchangedLines = diff.filter(d => d.type === 'unchanged');
        if (unchangedLines.length > 0) {
          expect(unchangedLines[0].lineNumber).toBeGreaterThanOrEqual(42);
        }
      });

    });

    describe('Combined view (full file context)', () => {

      it('should show line numbers starting from 1 for new files', () => {
        const diffData = createDiffData({
          oldContent: '',
          newContent: 'line 1\nline 2\nline 3',
          isNewFile: true,
          toolType: 'Write',
        });

        const container = document.createElement('div');
        renderDiffWithLineNumbers(container, diffData);

        const lineNumbers = container.querySelectorAll('.diff-line-number');
        const firstLineNumber = lineNumbers[0]?.textContent;
        expect(firstLineNumber).toBe('1');
      });

      it('should handle Write tool with full file replacement', () => {
        // Write tool overwrites entire file - startLine defaults to 1
        const diffData = createDiffData({
          oldContent: 'old file content\nwith multiple lines',
          newContent: 'completely new content\nwith different lines\nand more',
          toolType: 'Write',
          // No startLine - defaults to 1 for full file
        });

        const diff = computeDiffWithLineNumbers(
          diffData.oldContent,
          diffData.newContent,
          { startLine: diffData.startLine }
        );

        // Should start at line 1 for full file operations
        const minLineNumber = Math.min(...diff.map(d => d.lineNumber));
        expect(minLineNumber).toBe(1);
      });

      it('should correctly number lines in combined diff view', () => {
        // Combined view shows both old and new with line numbers
        const oldContent = 'keep\nremove\nkeep';
        const newContent = 'keep\nadd\nkeep';

        const diff = computeDiffWithLineNumbers(oldContent, newContent, { startLine: 1 });

        // Verify line numbers are present and sequential for unchanged lines
        const lines = diff.filter(d => d.type === 'unchanged');
        if (lines.length >= 2) {
          expect(lines[1].lineNumber).toBe(lines[0].lineNumber + 2);
        }
      });

      it('should display line gutter for all line types', () => {
        const container = document.createElement('div');
        const diffData = createDiffData({
          oldContent: 'removed line',
          newContent: 'added line',
          startLine: 10,
        });

        renderDiffWithLineNumbers(container, diffData);

        // Both added and removed lines should have line number elements
        const addedLines = container.querySelectorAll('.diff-line.added .diff-line-number');
        const removedLines = container.querySelectorAll('.diff-line.removed .diff-line-number');

        expect(addedLines.length).toBeGreaterThan(0);
        expect(removedLines.length).toBeGreaterThan(0);

        // Line numbers should not be empty
        expect(addedLines[0]?.textContent).not.toBe('');
        expect(removedLines[0]?.textContent).not.toBe('');
      });

    });

  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {

    it('should handle startLine of 0 (treat as 1)', () => {
      const diff = computeDiffWithLineNumbers('line', 'line', { startLine: 0 });
      expect(diff[0].lineNumber).toBe(1);
    });

    it('should handle negative startLine (treat as 1)', () => {
      const diff = computeDiffWithLineNumbers('line', 'line', { startLine: -5 });
      expect(diff[0].lineNumber).toBe(1);
    });

    it('should handle very large startLine values', () => {
      const diff = computeDiffWithLineNumbers('line', 'line', { startLine: 999999 });
      expect(diff[0].lineNumber).toBe(999999);
    });

    it('should handle empty content with startLine', () => {
      const diff = computeDiffWithLineNumbers('', '', { startLine: 50 });
      expect(diff).toHaveLength(0);
    });

    it('should handle single line with high startLine', () => {
      const diff = computeDiffWithLineNumbers('single', 'single', { startLine: 1000 });
      expect(diff[0].lineNumber).toBe(1000);
    });

  });

});

// =============================================================================
// Import actual implementations from DiffViewer.js
// =============================================================================

import {
  extractDiffDataFromEdit as extractDiffDataFromEditImpl,
  computeDiff,
  renderDiff,
} from '../src/public/js/components/DiffViewer.js';

/**
 * Extract DiffData from Edit tool with optional startLine context
 * Wraps the actual implementation from DiffViewer.js
 */
function extractDiffDataFromEdit(
  message: SDKToolUseMessage,
  context?: { startLine?: number }
): DiffData {
  return extractDiffDataFromEditImpl(message, context) as DiffData;
}

/**
 * Compute diff with actual file line numbers
 * Wraps computeDiff from DiffViewer.js
 */
function computeDiffWithLineNumbers(
  oldContent: string,
  newContent: string,
  options?: { startLine?: number }
): DiffLine[] {
  return computeDiff(oldContent, newContent, options) as DiffLine[];
}

/**
 * Render diff with actual file line numbers
 * Wraps renderDiff from DiffViewer.js
 */
function renderDiffWithLineNumbers(container: HTMLElement, diffData: DiffData): void {
  renderDiff(container, diffData);
}
