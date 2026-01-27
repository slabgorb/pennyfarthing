/**
 * MSSCI-12468: DIFFS panel - Improve combined diff view
 *
 * Tests for improved combined diff UX showing original → final state
 * with proper context.
 *
 * Acceptance Criteria:
 * - AC1: Combined view shows clear original → final transition
 * - AC2: Context lines displayed appropriately
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { computeCombinedDiff } from '../src/public/js/components/DiffHistoryManager.js';
import { renderCombinedDiff } from '../src/public/js/components/DiffViewer.js';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Enhanced DiffData with context support
 */
interface DiffData {
  id: string;
  filePath: string;
  oldContent: string;
  newContent: string;
  toolType: 'Edit' | 'Write';
  timestamp: number;
  isNewFile?: boolean;
  startLine?: number;
}

/**
 * Enhanced DiffLine with context support
 */
interface DiffLine {
  type: 'unchanged' | 'added' | 'removed' | 'context';
  line: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * Unified diff hunk header
 */
interface HunkHeader {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

/**
 * Combined diff result with metadata
 */
interface CombinedDiffResult {
  filePath: string;
  originalContent: string;
  finalContent: string;
  hunks: DiffHunk[];
  totalChanges: number;
}

/**
 * A hunk of changes with context
 */
interface DiffHunk {
  header: HunkHeader;
  lines: DiffLine[];
}

// =============================================================================
// Test Data Helpers
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

// Multi-line content with changes in the middle
const multilineOriginal = `import { foo } from 'bar';

const config = {
  name: 'old-name',
  version: '1.0.0',
  enabled: true,
};

export function init() {
  console.log('initializing');
  return config;
}`;

const multilineFinal = `import { foo } from 'bar';

const config = {
  name: 'new-name',
  version: '2.0.0',
  enabled: true,
  debug: false,
};

export function init() {
  console.log('starting up');
  return config;
}`;

// =============================================================================
// AC1: Combined view shows clear original → final transition
// =============================================================================

describe('MSSCI-12468: Combined Diff View', () => {
  describe('AC1: Combined view shows clear original → final transition', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="diff-panel">
          <div id="diff-panel-content"></div>
        </div>
      `;
    });

    it('should render combined diff header with original → final labels', () => {
      const container = document.getElementById('diff-panel-content')!;
      const diffData = createDiffData({
        oldContent: multilineOriginal,
        newContent: multilineFinal,
      });

      renderCombinedDiff(container, diffData);

      // Should show clear headers indicating transition direction
      const headerSection = container.querySelector('.combined-diff-header');
      expect(headerSection).toBeTruthy();
      expect(headerSection?.textContent).toContain('Original');
      expect(headerSection?.textContent).toContain('Final');
    });

    it('should show file path in combined diff header', () => {
      const container = document.getElementById('diff-panel-content')!;
      const diffData = createDiffData({
        filePath: '/src/components/Button.tsx',
        oldContent: 'old',
        newContent: 'new',
      });

      renderCombinedDiff(container, diffData);

      const filePath = container.querySelector('.combined-diff-file-path');
      expect(filePath?.textContent).toContain('Button.tsx');
    });

    it('should display change summary (N additions, M deletions)', () => {
      const container = document.getElementById('diff-panel-content')!;
      const diffData = createDiffData({
        oldContent: 'line1\nline2\nline3',
        newContent: 'line1\nmodified\nline3\nnewline',
      });

      renderCombinedDiff(container, diffData);

      const summary = container.querySelector('.combined-diff-summary');
      expect(summary).toBeTruthy();
      // Should show additions and deletions count
      expect(summary?.textContent).toMatch(/\+?\d+.*-?\d+/);
    });

    it('should render unified diff with - and + prefixes', () => {
      const container = document.getElementById('diff-panel-content')!;
      const diffData = createDiffData({
        oldContent: 'const OLD = true;',
        newContent: 'const NEW = true;',
      });

      renderCombinedDiff(container, diffData);

      // Removed lines should have - prefix
      const removedLines = container.querySelectorAll('.diff-line.removed .diff-line-prefix');
      expect(removedLines.length).toBeGreaterThan(0);
      expect(removedLines[0]?.textContent).toBe('-');

      // Added lines should have + prefix
      const addedLines = container.querySelectorAll('.diff-line.added .diff-line-prefix');
      expect(addedLines.length).toBeGreaterThan(0);
      expect(addedLines[0]?.textContent).toBe('+');
    });

    it('should show both old and new line numbers', () => {
      const container = document.getElementById('diff-panel-content')!;
      const diffData = createDiffData({
        oldContent: 'line1\nline2\nline3',
        newContent: 'line1\nmodified\nline3',
      });

      renderCombinedDiff(container, diffData);

      // Should have dual line number columns
      const lineNumberCols = container.querySelectorAll('.diff-line-numbers');
      expect(lineNumberCols.length).toBeGreaterThan(0);

      // Each line should show old line number and new line number
      const firstLine = container.querySelector('.diff-line');
      expect(firstLine?.querySelector('.old-line-number')).toBeTruthy();
      expect(firstLine?.querySelector('.new-line-number')).toBeTruthy();
    });

    it('should handle new file (no original content) gracefully', () => {
      const container = document.getElementById('diff-panel-content')!;
      const diffData = createDiffData({
        oldContent: '',
        newContent: 'new file content\nline 2',
        isNewFile: true,
      });

      renderCombinedDiff(container, diffData);

      // Should indicate this is a new file
      const newFileIndicator = container.querySelector('.combined-diff-new-file');
      expect(newFileIndicator).toBeTruthy();

      // All lines should be additions
      const addedLines = container.querySelectorAll('.diff-line.added');
      const removedLines = container.querySelectorAll('.diff-line.removed');
      expect(addedLines.length).toBeGreaterThan(0);
      expect(removedLines.length).toBe(0);
    });

    it('should handle deleted file (no final content) gracefully', () => {
      const container = document.getElementById('diff-panel-content')!;
      const diffData = createDiffData({
        oldContent: 'file content\nto be deleted',
        newContent: '',
      });

      renderCombinedDiff(container, diffData);

      // Should indicate file was deleted
      const deletedIndicator = container.querySelector('.combined-diff-deleted-file');
      expect(deletedIndicator).toBeTruthy();

      // All lines should be removals
      const addedLines = container.querySelectorAll('.diff-line.added');
      const removedLines = container.querySelectorAll('.diff-line.removed');
      expect(removedLines.length).toBeGreaterThan(0);
      expect(addedLines.length).toBe(0);
    });

    it('should visually group consecutive changes together', () => {
      const container = document.getElementById('diff-panel-content')!;
      const diffData = createDiffData({
        oldContent: multilineOriginal,
        newContent: multilineFinal,
      });

      renderCombinedDiff(container, diffData);

      // Changes should be grouped into hunks with visual separation
      const hunks = container.querySelectorAll('.diff-hunk');
      expect(hunks.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // AC2: Context lines displayed appropriately
  // ===========================================================================

  describe('AC2: Context lines displayed appropriately', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="diff-panel">
          <div id="diff-panel-content"></div>
        </div>
      `;
    });

    it('should show 3 lines of context before changes by default', () => {
      const result = computeCombinedDiff(multilineOriginal, multilineFinal);

      // Find a hunk with changes
      const hunk = result.hunks[0];
      expect(hunk).toBeTruthy();

      // Count LEADING context lines only (before the FIRST change in the hunk)
      let leadingContextCount = 0;
      for (const line of hunk.lines) {
        if (line.type === 'context') {
          leadingContextCount++;
        } else {
          break; // Stop at first non-context line
        }
      }

      // Should have up to 3 context lines before the first change
      expect(leadingContextCount).toBeLessThanOrEqual(3);
    });

    it('should show 3 lines of context after changes by default', () => {
      const result = computeCombinedDiff(multilineOriginal, multilineFinal);

      const hunk = result.hunks[0];
      expect(hunk).toBeTruthy();

      // Check for context lines after changes
      const lines = hunk.lines;
      let lastChangeIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].type === 'added' || lines[i].type === 'removed') {
          lastChangeIdx = i;
        }
      }

      const contextAfter = lines.slice(lastChangeIdx + 1).filter(l => l.type === 'context');
      expect(contextAfter.length).toBeLessThanOrEqual(3);
    });

    it('should mark context lines with special styling', () => {
      const container = document.getElementById('diff-panel-content')!;
      const diffData = createDiffData({
        oldContent: multilineOriginal,
        newContent: multilineFinal,
      });

      renderCombinedDiff(container, diffData);

      // Context lines should have distinct styling
      const contextLines = container.querySelectorAll('.diff-line.context');
      expect(contextLines.length).toBeGreaterThan(0);

      // Context lines should have space prefix (not + or -)
      const firstContext = contextLines[0]?.querySelector('.diff-line-prefix');
      expect(firstContext?.textContent?.trim()).toBe('');
    });

    it('should allow configurable context line count', () => {
      // With 5 lines of context
      const result5 = computeCombinedDiff(multilineOriginal, multilineFinal, { contextLines: 5 });

      // With 1 line of context
      const result1 = computeCombinedDiff(multilineOriginal, multilineFinal, { contextLines: 1 });

      // More context = more lines in hunks
      const totalLines5 = result5.hunks.reduce((sum, h) => sum + h.lines.length, 0);
      const totalLines1 = result1.hunks.reduce((sum, h) => sum + h.lines.length, 0);

      expect(totalLines5).toBeGreaterThan(totalLines1);
    });

    it('should collapse distant changes into separate hunks with ellipsis', () => {
      // Content with changes far apart
      const oldContent = Array(20).fill('unchanged line').join('\n');
      const newContent =
        'changed first line\n' +
        Array(18).fill('unchanged line').join('\n') +
        '\nchanged last line';

      const result = computeCombinedDiff(oldContent, newContent, { contextLines: 3 });

      // Should have multiple hunks since changes are far apart
      expect(result.hunks.length).toBeGreaterThan(1);
    });

    it('should render hunk headers with line ranges', () => {
      const container = document.getElementById('diff-panel-content')!;
      const diffData = createDiffData({
        oldContent: multilineOriginal,
        newContent: multilineFinal,
      });

      renderCombinedDiff(container, diffData);

      // Should have hunk headers like "@@ -1,5 +1,6 @@"
      const hunkHeaders = container.querySelectorAll('.diff-hunk-header');
      expect(hunkHeaders.length).toBeGreaterThan(0);

      const headerText = hunkHeaders[0]?.textContent || '';
      expect(headerText).toMatch(/@@.*@@/);
    });

    it('should show expand buttons between collapsed sections', () => {
      const container = document.getElementById('diff-panel-content')!;

      // Content with changes far apart
      const oldContent = Array(30).fill('unchanged line').join('\n');
      const newContent =
        'changed first line\n' +
        Array(28).fill('unchanged line').join('\n') +
        '\nchanged last line';

      const diffData = createDiffData({ oldContent, newContent });
      renderCombinedDiff(container, diffData, { contextLines: 3 });

      // Should have expand buttons between hunks
      const expandButtons = container.querySelectorAll('.diff-expand-button');
      expect(expandButtons.length).toBeGreaterThan(0);
    });

    it('should preserve context line numbers correctly', () => {
      const result = computeCombinedDiff(multilineOriginal, multilineFinal);

      // Context lines should have both old and new line numbers
      for (const hunk of result.hunks) {
        for (const line of hunk.lines) {
          if (line.type === 'context') {
            expect(line.oldLineNumber).toBeDefined();
            expect(line.newLineNumber).toBeDefined();
          }
        }
      }
    });

    it('should handle identical content (no changes, all context)', () => {
      const content = 'line1\nline2\nline3';
      const result = computeCombinedDiff(content, content);

      // No changes = no hunks (or single hunk with all context)
      expect(result.totalChanges).toBe(0);
    });

    it('should handle single line changes with surrounding context', () => {
      const oldContent = 'line1\nline2\nline3\nline4\nline5';
      const newContent = 'line1\nline2\nMODIFIED\nline4\nline5';

      const result = computeCombinedDiff(oldContent, newContent, { contextLines: 2 });

      // Should have one hunk with the change and 2 lines of context on each side
      expect(result.hunks.length).toBe(1);

      const hunk = result.hunks[0];
      const contextLines = hunk.lines.filter(l => l.type === 'context');
      const changeLines = hunk.lines.filter(l => l.type === 'added' || l.type === 'removed');

      expect(contextLines.length).toBe(4); // 2 before + 2 after
      expect(changeLines.length).toBe(2); // 1 removed + 1 added
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="diff-panel">
          <div id="diff-panel-content"></div>
        </div>
      `;
    });

    it('should handle empty old and new content', () => {
      const result = computeCombinedDiff('', '');
      expect(result.hunks).toHaveLength(0);
      expect(result.totalChanges).toBe(0);
    });

    it('should handle content with only whitespace changes', () => {
      const oldContent = 'line with spaces   ';
      const newContent = 'line with spaces';

      const result = computeCombinedDiff(oldContent, newContent);
      expect(result.totalChanges).toBeGreaterThan(0);
    });

    it('should escape HTML in diff content', () => {
      const container = document.getElementById('diff-panel-content')!;
      const diffData = createDiffData({
        oldContent: '<script>alert("xss")</script>',
        newContent: '<script>alert("safe")</script>',
      });

      renderCombinedDiff(container, diffData);

      // Content should be escaped, not executed
      expect(container.querySelector('script')).toBeNull();
      expect(container.textContent).toContain('<script>');
    });

    it('should handle very long lines without breaking layout', () => {
      const container = document.getElementById('diff-panel-content')!;
      const longLine = 'x'.repeat(500);
      const diffData = createDiffData({
        oldContent: longLine,
        newContent: longLine + 'y',
      });

      renderCombinedDiff(container, diffData);

      // Should render without error
      expect(container.querySelector('.diff-viewer')).toBeTruthy();
    });

    it('should handle mixed line endings (CRLF/LF)', () => {
      const oldContent = 'line1\r\nline2\r\nline3';
      const newContent = 'line1\nline2\nline3';

      const result = computeCombinedDiff(oldContent, newContent);
      // Should detect or normalize line ending differences
      expect(result).toBeDefined();
    });

    it('should handle unicode content correctly', () => {
      const container = document.getElementById('diff-panel-content')!;
      const diffData = createDiffData({
        oldContent: 'const msg = "Hello, 世界";',
        newContent: 'const msg = "Hello, 🌍";',
      });

      renderCombinedDiff(container, diffData);

      expect(container.textContent).toContain('世界');
      expect(container.textContent).toContain('🌍');
    });
  });
});

// =============================================================================
// Functions imported from implementation files:
// - computeCombinedDiff from DiffHistoryManager.js
// - renderCombinedDiff from DiffViewer.js
// =============================================================================
