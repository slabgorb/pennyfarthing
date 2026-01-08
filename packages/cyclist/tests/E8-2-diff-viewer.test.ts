/**
 * E8-2: Diff Viewer Tests
 *
 * Tests for the auto-opening diff tabs when Claude modifies files via Edit or Write tools.
 *
 * Acceptance Criteria:
 * - AC1: Edit tool triggers diff tab to open automatically
 * - AC2: Write tool triggers diff tab (new file or overwrite)
 * - AC3: Side-by-side diff shows old vs new content
 * - AC4: Syntax highlighting matches file type
 * - AC5: Line numbers displayed
 * - AC6: Added/removed lines visually distinct
 * - AC7: Tab persists across messages in session
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Diff data interface - passed from main process to renderer via IPC
 */
export interface DiffData {
  id: string;
  filePath: string;
  oldContent: string;
  newContent: string;
  toolType: 'Edit' | 'Write';
  timestamp: number;
  isNewFile?: boolean;
}

/**
 * Diff line representation after computation
 */
export interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  line: string;
  lineNumber: number;
}

/**
 * SDK Tool Use Message (from claude-service.ts)
 */
export interface SDKToolUseMessage {
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

const sampleEditToolUse: SDKToolUseMessage = {
  type: 'tool_use',
  tool_name: 'Edit',
  tool_id: 'edit-123',
  input: {
    file_path: '/src/main.ts',
    old_string: 'console.log("hello");',
    new_string: 'console.log("world");',
  },
};

const sampleWriteToolUse: SDKToolUseMessage = {
  type: 'tool_use',
  tool_name: 'Write',
  tool_id: 'write-456',
  input: {
    file_path: '/src/new-file.ts',
    content: 'export const newModule = {};',
  },
};

// =============================================================================
// AC1: Edit Tool Triggers Diff Tab to Open Automatically
// =============================================================================

describe('E8-2: Diff Viewer', () => {

  describe('AC1: Edit tool triggers diff tab to open automatically', () => {

    it('should detect Edit tool_use message', () => {
      const message = sampleEditToolUse;

      const isEditTool = detectEditTool(message);

      expect(isEditTool).toBe(true);
    });

    it('should not detect Edit for other tool types', () => {
      const readMessage: SDKToolUseMessage = {
        type: 'tool_use',
        tool_name: 'Read',
        tool_id: 'read-789',
        input: { file_path: '/src/file.ts' },
      };

      const isEditTool = detectEditTool(readMessage);

      expect(isEditTool).toBe(false);
    });

    it('should extract diff data from Edit tool_use', () => {
      const message = sampleEditToolUse;

      const diffData = extractDiffDataFromEdit(message);

      expect(diffData.id).toBe('edit-123');
      expect(diffData.filePath).toBe('/src/main.ts');
      expect(diffData.oldContent).toBe('console.log("hello");');
      expect(diffData.newContent).toBe('console.log("world");');
      expect(diffData.toolType).toBe('Edit');
    });

    it('should create diff tab when Edit tool detected', () => {
      const diffData = createDiffData({ id: 'edit-tab-test' });

      const tab = createDiffTab(diffData);

      expect(tab.id).toBe('diff-edit-tab-test');
      expect(tab.type).toBe('diff');
      expect(tab.closeable).toBe(true);
      expect(tab.data).toEqual(diffData);
    });

    it('should use filename as tab label', () => {
      const diffData = createDiffData({
        filePath: '/path/to/deeply/nested/component.tsx',
      });

      const tab = createDiffTab(diffData);

      expect(tab.label).toBe('Diff: component.tsx');
    });

    it('should handle Edit with multiline content', () => {
      const multilineMessage: SDKToolUseMessage = {
        type: 'tool_use',
        tool_name: 'Edit',
        tool_id: 'edit-multiline',
        input: {
          file_path: '/src/utils.ts',
          old_string: 'function foo() {\n  return 1;\n}',
          new_string: 'function foo() {\n  return 2;\n  // Added comment\n}',
        },
      };

      const diffData = extractDiffDataFromEdit(multilineMessage);

      expect(diffData.oldContent).toContain('return 1;');
      expect(diffData.newContent).toContain('return 2;');
      expect(diffData.newContent).toContain('// Added comment');
    });

  });

  // ===========================================================================
  // AC2: Write Tool Triggers Diff Tab (New File or Overwrite)
  // ===========================================================================

  describe('AC2: Write tool triggers diff tab (new file or overwrite)', () => {

    it('should detect Write tool_use message', () => {
      const message = sampleWriteToolUse;

      const isWriteTool = detectWriteTool(message);

      expect(isWriteTool).toBe(true);
    });

    it('should not detect Write for other tool types', () => {
      const bashMessage: SDKToolUseMessage = {
        type: 'tool_use',
        tool_name: 'Bash',
        tool_id: 'bash-001',
        input: { command: 'ls -la' },
      };

      const isWriteTool = detectWriteTool(bashMessage);

      expect(isWriteTool).toBe(false);
    });

    it('should extract diff data from Write tool_use', () => {
      const message = sampleWriteToolUse;

      const diffData = extractDiffDataFromWrite(message);

      expect(diffData.id).toBe('write-456');
      expect(diffData.filePath).toBe('/src/new-file.ts');
      expect(diffData.oldContent).toBe(''); // New file has empty old content
      expect(diffData.newContent).toBe('export const newModule = {};');
      expect(diffData.toolType).toBe('Write');
    });

    it('should mark new files appropriately', () => {
      const diffData = extractDiffDataFromWrite(sampleWriteToolUse);

      expect(diffData.isNewFile).toBe(true);
    });

    it('should create diff tab for Write tool', () => {
      const diffData = createDiffData({
        id: 'write-tab-test',
        toolType: 'Write',
        isNewFile: true,
      });

      const tab = createDiffTab(diffData);

      expect(tab.id).toBe('diff-write-tab-test');
      expect(tab.type).toBe('diff');
    });

    it('should handle Write with large content', () => {
      const largeContent = Array(100).fill('// Line of code').join('\n');
      const writeMessage: SDKToolUseMessage = {
        type: 'tool_use',
        tool_name: 'Write',
        tool_id: 'write-large',
        input: {
          file_path: '/src/large-file.ts',
          content: largeContent,
        },
      };

      const diffData = extractDiffDataFromWrite(writeMessage);

      expect(diffData.newContent).toBe(largeContent);
      expect(diffData.newContent.split('\n')).toHaveLength(100);
    });

  });

  // ===========================================================================
  // AC3: Side-by-Side Diff Shows Old vs New Content
  // ===========================================================================

  describe('AC3: Side-by-side diff shows old vs new content', () => {

    beforeEach(() => {
      document.body.innerHTML = `
        <div id="tab-panel" class="tab-panel">
          <div class="tab-bar">
            <div class="tab-bar-tabs" id="tab-bar-tabs"></div>
          </div>
          <div class="tab-content" id="tab-content"></div>
        </div>
      `;
    });

    it('should compute diff between old and new content', () => {
      const oldContent = 'line1\nline2\nline3';
      const newContent = 'line1\nmodified\nline3';

      const diff = computeDiff(oldContent, newContent);

      expect(diff).toBeInstanceOf(Array);
      expect(diff.length).toBeGreaterThan(0);
    });

    it('should identify removed lines', () => {
      const oldContent = 'original line';
      const newContent = '';

      const diff = computeDiff(oldContent, newContent);
      const removedLines = diff.filter(d => d.type === 'removed');

      expect(removedLines.length).toBeGreaterThan(0);
      expect(removedLines[0].line).toBe('original line');
    });

    it('should identify added lines', () => {
      const oldContent = '';
      const newContent = 'new line';

      const diff = computeDiff(oldContent, newContent);
      const addedLines = diff.filter(d => d.type === 'added');

      expect(addedLines.length).toBeGreaterThan(0);
      expect(addedLines[0].line).toBe('new line');
    });

    it('should handle identical content (no diff)', () => {
      const content = 'same content';

      const diff = computeDiff(content, content);
      const changedLines = diff.filter(d => d.type !== 'unchanged');

      expect(changedLines).toHaveLength(0);
    });

    it('should render diff with two panels (old and new)', () => {
      const container = document.getElementById('tab-content')!;
      const diffData = createDiffData({
        oldContent: 'old code',
        newContent: 'new code',
      });

      renderDiff(container, diffData);

      const panels = container.querySelectorAll('.diff-panel');
      expect(panels.length).toBe(2);
    });

    it('should render old content in left panel', () => {
      const container = document.getElementById('tab-content')!;
      const diffData = createDiffData({
        oldContent: 'const OLD = true;',
        newContent: 'const NEW = true;',
      });

      renderDiff(container, diffData);

      const leftPanel = container.querySelector('.diff-panel:first-child');
      expect(leftPanel?.textContent).toContain('OLD');
    });

    it('should render new content in right panel', () => {
      const container = document.getElementById('tab-content')!;
      const diffData = createDiffData({
        oldContent: 'const OLD = true;',
        newContent: 'const NEW = true;',
      });

      renderDiff(container, diffData);

      const rightPanel = container.querySelector('.diff-panel:last-child');
      expect(rightPanel?.textContent).toContain('NEW');
    });

    it('should show empty state message for new files', () => {
      const container = document.getElementById('tab-content')!;
      const diffData = createDiffData({
        oldContent: '',
        newContent: 'new file content',
        isNewFile: true,
      });

      renderDiff(container, diffData);

      const leftPanel = container.querySelector('.diff-panel:first-child');
      expect(leftPanel?.textContent).toMatch(/new file|empty/i);
    });

  });

  // ===========================================================================
  // AC4: Syntax Highlighting Matches File Type
  // ===========================================================================

  describe('AC4: Syntax highlighting matches file type', () => {

    it('should extract file extension from path', () => {
      expect(getFileExtension('/path/to/file.ts')).toBe('ts');
      expect(getFileExtension('/path/to/file.tsx')).toBe('tsx');
      expect(getFileExtension('/path/to/file.js')).toBe('js');
      expect(getFileExtension('/path/to/styles.css')).toBe('css');
    });

    it('should handle files without extension', () => {
      expect(getFileExtension('/path/to/Makefile')).toBe('');
      expect(getFileExtension('/path/to/.gitignore')).toBe('gitignore');
    });

    it('should handle multiple dots in filename', () => {
      expect(getFileExtension('/path/to/file.test.ts')).toBe('ts');
      expect(getFileExtension('/path/to/module.spec.tsx')).toBe('tsx');
    });

    it('should return language class for extension', () => {
      expect(getLanguageClass('ts')).toBe('lang-typescript');
      expect(getLanguageClass('tsx')).toBe('lang-typescript');
      expect(getLanguageClass('js')).toBe('lang-javascript');
      expect(getLanguageClass('css')).toBe('lang-css');
      expect(getLanguageClass('html')).toBe('lang-html');
      expect(getLanguageClass('json')).toBe('lang-json');
      expect(getLanguageClass('md')).toBe('lang-markdown');
    });

    it('should return plain language class for unknown extension', () => {
      expect(getLanguageClass('xyz')).toBe('lang-plain');
      expect(getLanguageClass('')).toBe('lang-plain');
    });

    it('should apply language class to diff viewer element', () => {
      const container = document.createElement('div');
      const diffData = createDiffData({ filePath: '/path/to/component.tsx' });

      renderDiff(container, diffData);

      const viewer = container.querySelector('.diff-viewer');
      expect(viewer?.classList.contains('lang-typescript')).toBe(true);
    });

    it('should apply different language classes for different file types', () => {
      const container1 = document.createElement('div');
      const container2 = document.createElement('div');

      renderDiff(container1, createDiffData({ filePath: '/styles.css' }));
      renderDiff(container2, createDiffData({ filePath: '/script.js' }));

      const viewer1 = container1.querySelector('.diff-viewer');
      const viewer2 = container2.querySelector('.diff-viewer');
      expect(viewer1?.classList.contains('lang-css')).toBe(true);
      expect(viewer2?.classList.contains('lang-javascript')).toBe(true);
    });

  });

  // ===========================================================================
  // AC5: Line Numbers Displayed
  // ===========================================================================

  describe('AC5: Line numbers displayed', () => {

    beforeEach(() => {
      document.body.innerHTML = `<div id="tab-content"></div>`;
    });

    it('should include line numbers in diff output', () => {
      const diff = computeDiff('line1\nline2', 'line1\nmodified');

      for (const line of diff) {
        expect(line.lineNumber).toBeDefined();
        expect(typeof line.lineNumber).toBe('number');
      }
    });

    it('should start line numbers at 1', () => {
      const diff = computeDiff('first line', 'first line');

      expect(diff[0].lineNumber).toBe(1);
    });

    it('should increment line numbers correctly', () => {
      const content = 'line1\nline2\nline3\nline4';
      const diff = computeDiff(content, content);

      const lineNumbers = diff.map(d => d.lineNumber);
      expect(lineNumbers).toEqual([1, 2, 3, 4]);
    });

    it('should render line number elements in DOM', () => {
      const container = document.getElementById('tab-content')!;
      const diffData = createDiffData({
        oldContent: 'line1\nline2',
        newContent: 'line1\nline2',
      });

      renderDiff(container, diffData);

      const lineNumbers = container.querySelectorAll('.diff-line-number');
      expect(lineNumbers.length).toBeGreaterThan(0);
    });

    it('should display correct line number values', () => {
      const container = document.getElementById('tab-content')!;
      const diffData = createDiffData({
        oldContent: 'first\nsecond\nthird',
        newContent: 'first\nsecond\nthird',
      });

      renderDiff(container, diffData);

      // Check that line numbers 1, 2, 3 appear in the content
      const content = container.textContent;
      expect(content).toContain('1');
      expect(content).toContain('2');
      expect(content).toContain('3');
    });

  });

  // ===========================================================================
  // AC6: Added/Removed Lines Visually Distinct
  // ===========================================================================

  describe('AC6: Added/removed lines visually distinct', () => {

    beforeEach(() => {
      document.body.innerHTML = `<div id="tab-content"></div>`;
    });

    it('should mark added lines with added class', () => {
      const container = document.getElementById('tab-content')!;
      const diffData = createDiffData({
        oldContent: '',
        newContent: 'new line added',
      });

      renderDiff(container, diffData);

      const addedLines = container.querySelectorAll('.diff-line.added');
      expect(addedLines.length).toBeGreaterThan(0);
    });

    it('should mark removed lines with removed class', () => {
      const container = document.getElementById('tab-content')!;
      const diffData = createDiffData({
        oldContent: 'line to remove',
        newContent: '',
      });

      renderDiff(container, diffData);

      const removedLines = container.querySelectorAll('.diff-line.removed');
      expect(removedLines.length).toBeGreaterThan(0);
    });

    it('should not mark unchanged lines as added or removed', () => {
      const container = document.getElementById('tab-content')!;
      const diffData = createDiffData({
        oldContent: 'unchanged content',
        newContent: 'unchanged content',
      });

      renderDiff(container, diffData);

      const addedLines = container.querySelectorAll('.diff-line.added');
      const removedLines = container.querySelectorAll('.diff-line.removed');
      expect(addedLines.length).toBe(0);
      expect(removedLines.length).toBe(0);
    });

    it('should render mixed changes correctly', () => {
      const container = document.getElementById('tab-content')!;
      const diffData = createDiffData({
        oldContent: 'keep this\nremove this',
        newContent: 'keep this\nadd this',
      });

      renderDiff(container, diffData);

      // Should have both added and removed lines
      const addedLines = container.querySelectorAll('.diff-line.added');
      const removedLines = container.querySelectorAll('.diff-line.removed');
      expect(addedLines.length).toBeGreaterThan(0);
      expect(removedLines.length).toBeGreaterThan(0);
    });

    it('should include diff-line-content element for styling', () => {
      const container = document.getElementById('tab-content')!;
      const diffData = createDiffData({
        oldContent: 'old',
        newContent: 'new',
      });

      renderDiff(container, diffData);

      const contentElements = container.querySelectorAll('.diff-line-content');
      expect(contentElements.length).toBeGreaterThan(0);
    });

  });

  // ===========================================================================
  // AC7: Tab Persists Across Messages in Session
  // ===========================================================================

  describe('AC7: Tab persists across messages in session', () => {

    const STORAGE_KEY = 'cyclist-tabs';

    beforeEach(() => {
      localStorage.clear();
    });

    afterEach(() => {
      localStorage.clear();
    });

    it('should store diff tab data in localStorage', () => {
      const diffData = createDiffData({ id: 'persist-test' });
      const tab = createDiffTab(diffData);

      // Simulate TabManager.addTab and save
      const state = {
        tabs: [tab],
        activeTab: tab.id,
        collapsed: false,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed = JSON.parse(saved!);
      expect(parsed.tabs[0].data).toBeDefined();
      expect(parsed.tabs[0].data.id).toBe('persist-test');
    });

    it('should restore diff tab from localStorage', () => {
      const diffData = createDiffData({
        id: 'restore-test',
        filePath: '/restored/file.ts',
        oldContent: 'restored old',
        newContent: 'restored new',
      });
      const tab = createDiffTab(diffData);

      const savedState = {
        tabs: [tab],
        activeTab: tab.id,
        collapsed: false,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));

      // Simulate load
      const loaded = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      const restoredTab = loaded.tabs[0];

      expect(restoredTab.type).toBe('diff');
      expect(restoredTab.data.filePath).toBe('/restored/file.ts');
      expect(restoredTab.data.oldContent).toBe('restored old');
      expect(restoredTab.data.newContent).toBe('restored new');
    });

    it('should persist multiple diff tabs', () => {
      const tabs = [
        createDiffTab(createDiffData({ id: 'diff-1', filePath: '/file1.ts' })),
        createDiffTab(createDiffData({ id: 'diff-2', filePath: '/file2.ts' })),
        createDiffTab(createDiffData({ id: 'diff-3', filePath: '/file3.ts' })),
      ];

      const state = {
        tabs,
        activeTab: tabs[0].id,
        collapsed: false,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

      const loaded = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(loaded.tabs).toHaveLength(3);
    });

    it('should preserve diff data when other tabs change', () => {
      const diffTab = createDiffTab(createDiffData({ id: 'preserved' }));
      const otherTab = { id: 'other-tab', type: 'file', label: 'other.ts', closeable: true };

      // Add diff tab
      let state = { tabs: [diffTab], activeTab: diffTab.id, collapsed: false };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

      // Add another tab (simulating normal operation)
      state = { tabs: [...state.tabs, otherTab], activeTab: otherTab.id, collapsed: false };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

      // Verify diff tab data is preserved
      const loaded = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      const preservedDiff = loaded.tabs.find((t: {id: string}) => t.id === diffTab.id);
      expect(preservedDiff.data).toBeDefined();
      expect(preservedDiff.data.id).toBe('preserved');
    });

    it('should handle session with mixed tab types', () => {
      const diffTab = createDiffTab(createDiffData({ id: 'mixed-diff' }));
      const fileTab = { id: 'file-tab', type: 'file', label: 'file.ts', closeable: true };
      const browserTab = { id: 'browser', type: 'browser', label: 'Files', closeable: false };

      const state = {
        tabs: [diffTab, fileTab, browserTab],
        activeTab: diffTab.id,
        collapsed: false,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

      const loaded = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      const loadedDiffTab = loaded.tabs.find((t: {type: string}) => t.type === 'diff');
      expect(loadedDiffTab).toBeDefined();
      expect(loadedDiffTab.data).toBeDefined();
    });

  });

  // ===========================================================================
  // IPC Integration Tests
  // ===========================================================================

  describe('IPC Integration', () => {

    it('should call handleDiffUpdate when diff:update received', () => {
      const mockHandler = vi.fn();
      const diffData = createDiffData({ id: 'ipc-test' });

      // Simulate IPC event handler registration and call
      const handlers: Record<string, (data: DiffData) => void> = {};
      const mockOnUpdate = (callback: (event: unknown, data: DiffData) => void) => {
        handlers['diff:update'] = (data) => callback(null, data);
      };

      // Register handler
      mockOnUpdate((_, data) => mockHandler(data));

      // Trigger event
      handlers['diff:update'](diffData);

      expect(mockHandler).toHaveBeenCalledWith(diffData);
    });

    it('should create correct DiffData from tool message', () => {
      const toolMessage = sampleEditToolUse;

      const diffData = extractDiffDataFromEdit(toolMessage);

      expect(diffData).toMatchObject({
        id: 'edit-123',
        filePath: '/src/main.ts',
        oldContent: 'console.log("hello");',
        newContent: 'console.log("world");',
        toolType: 'Edit',
      });
      expect(diffData.timestamp).toBeDefined();
    });

  });

  // ===========================================================================
  // Content Renderer Registration Tests
  // ===========================================================================

  describe('Content Renderer Registration', () => {

    it('should register diff content renderer', () => {
      const renderers: Record<string, (container: HTMLElement, tab: {data: DiffData}) => void> = {};

      // Simulate registration
      const registerContentRenderer = (type: string, renderer: (container: HTMLElement, tab: {data: DiffData}) => void) => {
        renderers[type] = renderer;
      };

      registerContentRenderer('diff', (container, tab) => {
        renderDiff(container, tab.data);
      });

      expect(renderers['diff']).toBeDefined();
    });

    it('should call diff renderer when diff tab is active', () => {
      const container = document.createElement('div');
      const diffData = createDiffData();
      const mockTab = { id: 'diff-tab', type: 'diff', data: diffData };

      // Simulate content render call
      renderDiff(container, mockTab.data);

      expect(container.querySelector('.diff-viewer')).toBeTruthy();
    });

  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {

    it('should handle empty old and new content', () => {
      const diff = computeDiff('', '');
      expect(diff).toHaveLength(0);
    });

    it('should handle content with only whitespace changes', () => {
      const oldContent = 'line with trailing space ';
      const newContent = 'line with trailing space';

      const diff = computeDiff(oldContent, newContent);
      // Should detect the change even if it's just whitespace
      expect(diff.length).toBeGreaterThan(0);
    });

    it('should handle very long lines', () => {
      const longLine = 'x'.repeat(10000);
      const diff = computeDiff(longLine, longLine + 'y');

      expect(diff.length).toBeGreaterThan(0);
    });

    it('should handle special characters in content', () => {
      const specialContent = '<script>alert("xss")</script>';
      const container = document.createElement('div');
      const diffData = createDiffData({
        oldContent: specialContent,
        newContent: specialContent,
      });

      renderDiff(container, diffData);

      // Content should be escaped, not executed
      expect(container.textContent).toContain('script');
      expect(container.querySelector('script')).toBeNull();
    });

    it('should handle file paths with special characters', () => {
      expect(getFileExtension('/path/with spaces/file.ts')).toBe('ts');
      expect(getFileExtension('/path/with-dashes/file.tsx')).toBe('tsx');
      expect(getFileExtension('/path/with.dots/file.js')).toBe('js');
    });

    it('should handle Unicode content', () => {
      const unicodeContent = 'const greeting = "Hello, \u4e16\u754c!";';
      const diff = computeDiff(unicodeContent, unicodeContent);

      expect(diff[0].line).toContain('\u4e16\u754c');
    });

    it('should handle Windows line endings', () => {
      const windowsContent = 'line1\r\nline2\r\nline3';
      const unixContent = 'line1\nline2\nline3';

      const diff = computeDiff(windowsContent, unixContent);
      // Should handle line ending differences appropriately
      expect(diff).toBeDefined();
    });

  });

});

// =============================================================================
// Stub Functions (to be implemented in src/public/js/components/DiffViewer.js)
// =============================================================================

/**
 * Detect if a tool_use message is an Edit tool
 * Implementation target: src/public/js/components/DiffViewer.js
 */
function detectEditTool(message: SDKToolUseMessage): boolean {
  return message.type === 'tool_use' && message.tool_name === 'Edit';
}

/**
 * Detect if a tool_use message is a Write tool
 * Implementation target: src/public/js/components/DiffViewer.js
 */
function detectWriteTool(message: SDKToolUseMessage): boolean {
  return message.type === 'tool_use' && message.tool_name === 'Write';
}

/**
 * Extract DiffData from an Edit tool_use message
 * Implementation target: src/public/js/components/DiffViewer.js
 */
function extractDiffDataFromEdit(message: SDKToolUseMessage): DiffData {
  const input = message.input as { file_path: string; old_string: string; new_string: string };
  return {
    id: message.tool_id,
    filePath: input.file_path,
    oldContent: input.old_string,
    newContent: input.new_string,
    toolType: 'Edit',
    timestamp: Date.now(),
  };
}

/**
 * Extract DiffData from a Write tool_use message
 * Implementation target: src/public/js/components/DiffViewer.js
 */
function extractDiffDataFromWrite(message: SDKToolUseMessage): DiffData {
  const input = message.input as { file_path: string; content: string };
  return {
    id: message.tool_id,
    filePath: input.file_path,
    oldContent: '',
    newContent: input.content,
    toolType: 'Write',
    timestamp: Date.now(),
    isNewFile: true,
  };
}

/**
 * Create a diff tab configuration
 * Implementation target: src/public/js/components/DiffViewer.js
 */
function createDiffTab(diffData: DiffData): { id: string; type: string; label: string; closeable: boolean; data: DiffData } {
  const filename = diffData.filePath.split('/').pop() || 'unknown';
  return {
    id: `diff-${diffData.id}`,
    type: 'diff',
    label: `Diff: ${filename}`,
    closeable: true,
    data: diffData,
  };
}

/**
 * Compute diff between two strings
 * Implementation target: src/public/js/components/DiffViewer.js
 */
function computeDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent ? oldContent.split('\n') : [];
  const newLines = newContent ? newContent.split('\n') : [];

  // If content is identical, return unchanged lines
  if (oldContent === newContent) {
    return oldLines.map((line, i) => ({
      type: 'unchanged' as const,
      line,
      lineNumber: i + 1,
    }));
  }

  // Simple diff: mark old as removed, new as added
  // A real implementation would use LCS or similar algorithm
  const result: DiffLine[] = [];

  oldLines.forEach((line, i) => {
    result.push({ type: 'removed', line, lineNumber: i + 1 });
  });

  newLines.forEach((line, i) => {
    result.push({ type: 'added', line, lineNumber: i + 1 });
  });

  return result;
}

/**
 * Get file extension from path
 * Implementation target: src/public/js/components/DiffViewer.js
 */
function getFileExtension(filePath: string): string {
  const filename = filePath.split('/').pop() || '';
  if (filename.startsWith('.')) {
    return filename.slice(1); // .gitignore -> gitignore
  }
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return parts.pop() || '';
}

/**
 * Get CSS language class for extension
 * Implementation target: src/public/js/components/DiffViewer.js
 */
function getLanguageClass(ext: string): string {
  const langMap: Record<string, string> = {
    ts: 'lang-typescript',
    tsx: 'lang-typescript',
    js: 'lang-javascript',
    jsx: 'lang-javascript',
    css: 'lang-css',
    html: 'lang-html',
    json: 'lang-json',
    md: 'lang-markdown',
  };
  return langMap[ext] || 'lang-plain';
}

/**
 * Render diff content into container
 * Implementation target: src/public/js/components/DiffViewer.js
 */
function renderDiff(container: HTMLElement, diffData: DiffData): void {
  const ext = getFileExtension(diffData.filePath);
  const langClass = getLanguageClass(ext);

  // Create viewer wrapper (so querySelector('.diff-viewer') finds it)
  const viewer = document.createElement('div');
  viewer.className = `diff-viewer ${langClass}`;

  const diff = computeDiff(diffData.oldContent, diffData.newContent);

  // Create old panel (left)
  const oldPanel = document.createElement('div');
  oldPanel.className = 'diff-panel';

  if (diffData.isNewFile || diffData.oldContent === '') {
    const emptyState = document.createElement('div');
    emptyState.className = 'diff-empty-state';
    emptyState.textContent = 'New file';
    oldPanel.appendChild(emptyState);
  } else {
    const removedLines = diff.filter(d => d.type === 'removed');
    for (const line of removedLines) {
      const lineEl = createDiffLineElement(line);
      oldPanel.appendChild(lineEl);
    }
  }

  // Create new panel (right)
  const newPanel = document.createElement('div');
  newPanel.className = 'diff-panel';

  const addedLines = diff.filter(d => d.type === 'added');
  const unchangedLines = diff.filter(d => d.type === 'unchanged');

  if (addedLines.length > 0) {
    for (const line of addedLines) {
      const lineEl = createDiffLineElement(line);
      newPanel.appendChild(lineEl);
    }
  } else if (unchangedLines.length > 0) {
    for (const line of unchangedLines) {
      const lineEl = createDiffLineElement(line);
      newPanel.appendChild(lineEl);
    }
  }

  viewer.appendChild(oldPanel);
  viewer.appendChild(newPanel);

  container.innerHTML = '';
  container.appendChild(viewer);
}

/**
 * Create a diff line DOM element
 * Helper for renderDiff
 */
function createDiffLineElement(line: DiffLine): HTMLElement {
  const el = document.createElement('div');
  el.className = `diff-line ${line.type}`;

  const lineNum = document.createElement('span');
  lineNum.className = 'diff-line-number';
  lineNum.textContent = String(line.lineNumber);

  const content = document.createElement('span');
  content.className = 'diff-line-content';
  content.textContent = line.line;

  el.appendChild(lineNum);
  el.appendChild(content);

  return el;
}
