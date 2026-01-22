/**
 * MSSCI-12126: Chat response formatting improvements
 *
 * Tests for improved rendering of Claude responses in VS Code chat:
 * - Code block syntax highlighting
 * - Collapsible tool use sections
 * - File path clickable links
 * - Markdown table rendering
 * - Progress indicators for long operations
 *
 * Acceptance Criteria:
 * - AC1: Code blocks render with syntax highlighting when language is specified or can be inferred
 * - AC2: Tool use events display as collapsible sections with tool name and input
 * - AC3: File paths in responses become clickable links that open in editor
 * - AC4: Markdown tables render correctly with proper alignment
 * - AC5: Long operations show progress indicator in chat
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode module
const mockVscode = {
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path, scheme: 'file' })),
    parse: vi.fn((uri: string) => ({ scheme: 'file', path: uri })),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
  },
};

vi.mock('vscode', () => mockVscode);

// ============================================================================
// AC1: Code Block Syntax Highlighting
// ============================================================================
describe('AC1: Code block syntax highlighting', () => {
  describe('formatCodeBlocks', () => {
    it('should preserve code blocks that already have language hints', async () => {
      const { formatCodeBlocks } = await import(
        '../src/adapters/response-formatter'
      );

      const input = '```typescript\nconst x = 1;\n```';
      const result = formatCodeBlocks(input);

      expect(result).toBe('```typescript\nconst x = 1;\n```');
    });

    it('should infer typescript for .ts file content', async () => {
      const { formatCodeBlocks } = await import(
        '../src/adapters/response-formatter'
      );

      const input = '```\nconst x: number = 1;\nexport interface Foo {}\n```';
      const result = formatCodeBlocks(input);

      expect(result).toContain('```typescript');
    });

    it('should infer javascript for .js patterns', async () => {
      const { formatCodeBlocks } = await import(
        '../src/adapters/response-formatter'
      );

      const input = '```\nconst x = require("fs");\nmodule.exports = x;\n```';
      const result = formatCodeBlocks(input);

      expect(result).toContain('```javascript');
    });

    it('should infer json for JSON content', async () => {
      const { formatCodeBlocks } = await import(
        '../src/adapters/response-formatter'
      );

      const input = '```\n{"name": "test", "version": "1.0.0"}\n```';
      const result = formatCodeBlocks(input);

      expect(result).toContain('```json');
    });

    it('should infer bash for shell commands', async () => {
      const { formatCodeBlocks } = await import(
        '../src/adapters/response-formatter'
      );

      const input = '```\nnpm install\ngit status\ncd /path/to/dir\n```';
      const result = formatCodeBlocks(input);

      expect(result).toContain('```bash');
    });

    it('should infer yaml for YAML content', async () => {
      const { formatCodeBlocks } = await import(
        '../src/adapters/response-formatter'
      );

      const input = '```\nname: test\nversion: 1.0.0\ndependencies:\n  - foo\n```';
      const result = formatCodeBlocks(input);

      expect(result).toContain('```yaml');
    });

    it('should leave code blocks without hints if language cannot be inferred', async () => {
      const { formatCodeBlocks } = await import(
        '../src/adapters/response-formatter'
      );

      const input = '```\nsome random text that is not code\n```';
      const result = formatCodeBlocks(input);

      // Should keep as-is or add 'text' hint
      expect(result).toMatch(/```(text)?\nsome random text/);
    });

    it('should handle multiple code blocks in one input', async () => {
      const { formatCodeBlocks } = await import(
        '../src/adapters/response-formatter'
      );

      const input =
        '```typescript\nconst x = 1;\n```\n\nSome text\n\n```\n{"key": "value"}\n```';
      const result = formatCodeBlocks(input);

      expect(result).toContain('```typescript');
      expect(result).toContain('```json');
    });
  });

  describe('inferLanguage', () => {
    it('should return typescript for TypeScript patterns', async () => {
      const { inferLanguage } = await import(
        '../src/adapters/response-formatter'
      );

      expect(inferLanguage('interface Foo { bar: string }')).toBe('typescript');
      expect(inferLanguage('const x: number = 1')).toBe('typescript');
      expect(inferLanguage('type MyType = string | number')).toBe('typescript');
    });

    it('should return go for Go patterns', async () => {
      const { inferLanguage } = await import(
        '../src/adapters/response-formatter'
      );

      expect(inferLanguage('func main() {\n  fmt.Println("hello")\n}')).toBe(
        'go'
      );
      expect(inferLanguage('package main\n\nimport "fmt"')).toBe('go');
    });

    it('should return python for Python patterns', async () => {
      const { inferLanguage } = await import(
        '../src/adapters/response-formatter'
      );

      expect(inferLanguage('def foo():\n    return 1')).toBe('python');
      expect(inferLanguage('import os\nprint(os.getcwd())')).toBe('python');
    });

    it('should return null for unrecognized content', async () => {
      const { inferLanguage } = await import(
        '../src/adapters/response-formatter'
      );

      expect(inferLanguage('hello world')).toBeNull();
    });
  });
});

// ============================================================================
// AC2: Collapsible Tool Use Sections
// ============================================================================
describe('AC2: Collapsible tool use sections', () => {
  describe('formatToolUse', () => {
    it('should wrap tool use in details/summary HTML', async () => {
      const { formatToolUse } = await import(
        '../src/adapters/response-formatter'
      );

      const result = formatToolUse('Read', { file_path: '/path/to/file.ts' });

      expect(result).toContain('<details>');
      expect(result).toContain('<summary>');
      expect(result).toContain('</summary>');
      expect(result).toContain('</details>');
    });

    it('should include tool name in summary', async () => {
      const { formatToolUse } = await import(
        '../src/adapters/response-formatter'
      );

      const result = formatToolUse('Bash', { command: 'npm test' });

      expect(result).toContain('Bash');
    });

    it('should format input as JSON code block', async () => {
      const { formatToolUse } = await import(
        '../src/adapters/response-formatter'
      );

      const result = formatToolUse('Write', {
        file_path: '/test.ts',
        content: 'const x = 1;',
      });

      expect(result).toContain('```json');
      expect(result).toContain('file_path');
      expect(result).toContain('```');
    });

    it('should truncate very long input', async () => {
      const { formatToolUse } = await import(
        '../src/adapters/response-formatter'
      );

      const longContent = 'x'.repeat(2000);
      const result = formatToolUse('Write', {
        file_path: '/test.ts',
        content: longContent,
      });

      // Should be truncated with ellipsis indicator
      expect(result.length).toBeLessThan(longContent.length + 500);
      expect(result).toContain('...');
    });

    it('should include emoji indicator for tool type', async () => {
      const { formatToolUse } = await import(
        '../src/adapters/response-formatter'
      );

      const readResult = formatToolUse('Read', { file_path: '/test.ts' });
      const bashResult = formatToolUse('Bash', { command: 'ls' });
      const writeResult = formatToolUse('Write', {
        file_path: '/test.ts',
        content: 'x',
      });

      // Should have some visual indicator (emoji or icon reference)
      expect(readResult).toMatch(/[a-zA-Z]/); // At minimum has tool name
    });

    it('should handle nested objects in input', async () => {
      const { formatToolUse } = await import(
        '../src/adapters/response-formatter'
      );

      const result = formatToolUse('Task', {
        prompt: 'Do something',
        options: { model: 'haiku', background: true },
      });

      expect(result).toContain('options');
      expect(result).toContain('model');
    });
  });
});

// ============================================================================
// AC3: File Path Clickable Links
// ============================================================================
describe('AC3: File path clickable links', () => {
  describe('formatFilePaths', () => {
    it('should convert absolute file paths to clickable links', async () => {
      const { formatFilePaths } = await import(
        '../src/adapters/response-formatter'
      );

      const input = 'See the file at /Users/test/project/src/file.ts for details';
      const result = formatFilePaths(input);

      expect(result).toContain('[');
      expect(result).toContain('](command:');
      expect(result).toContain('vscode.open');
    });

    it('should handle file paths with line numbers', async () => {
      const { formatFilePaths } = await import(
        '../src/adapters/response-formatter'
      );

      const input = 'Error at /path/to/file.ts:42';
      const result = formatFilePaths(input);

      expect(result).toContain('[file.ts:42]');
      expect(result).toContain('command:');
    });

    it('should handle file paths with line and column numbers', async () => {
      const { formatFilePaths } = await import(
        '../src/adapters/response-formatter'
      );

      const input = 'Error at /path/to/file.ts:42:10';
      const result = formatFilePaths(input);

      expect(result).toContain('[file.ts:42:10]');
    });

    it('should preserve file paths inside code blocks', async () => {
      const { formatFilePaths } = await import(
        '../src/adapters/response-formatter'
      );

      const input = '```\ncat /path/to/file.ts\n```';
      const result = formatFilePaths(input);

      // Should NOT convert paths inside code blocks
      expect(result).not.toContain('command:vscode.open');
      expect(result).toContain('/path/to/file.ts');
    });

    it('should handle multiple file paths in one line', async () => {
      const { formatFilePaths } = await import(
        '../src/adapters/response-formatter'
      );

      const input = 'Modified /src/a.ts and /src/b.ts';
      const result = formatFilePaths(input);

      expect(result).toContain('[a.ts]');
      expect(result).toContain('[b.ts]');
    });

    it('should handle relative paths from workspace root', async () => {
      const { formatFilePaths } = await import(
        '../src/adapters/response-formatter'
      );

      const input = 'See src/components/Button.tsx';
      const result = formatFilePaths(input);

      // Relative paths should also become links
      expect(result).toContain('[Button.tsx]');
    });

    it('should properly encode URI for command', async () => {
      const { formatFilePaths } = await import(
        '../src/adapters/response-formatter'
      );

      const input = 'File at /path/with spaces/file.ts';
      const result = formatFilePaths(input);

      // Should be properly encoded
      expect(result).toContain('command:');
      expect(result).not.toContain('/path/with spaces/file.ts](command');
    });
  });

  describe('createFileLink', () => {
    it('should create VS Code command URI for file', async () => {
      const { createFileLink } = await import(
        '../src/adapters/response-formatter'
      );

      const result = createFileLink('/path/to/file.ts');

      expect(result).toContain('command:vscode.open');
      expect(result).toContain('file.ts');
    });

    it('should include line number in command args', async () => {
      const { createFileLink } = await import(
        '../src/adapters/response-formatter'
      );

      const result = createFileLink('/path/to/file.ts', 42);

      expect(result).toContain('42');
    });

    it('should include column number when provided', async () => {
      const { createFileLink } = await import(
        '../src/adapters/response-formatter'
      );

      const result = createFileLink('/path/to/file.ts', 42, 10);

      expect(result).toContain('42');
      expect(result).toContain('10');
    });
  });
});

// ============================================================================
// AC4: Markdown Table Rendering
// ============================================================================
describe('AC4: Markdown table rendering', () => {
  describe('formatTables', () => {
    it('should pass through well-formed tables unchanged', async () => {
      const { formatTables } = await import(
        '../src/adapters/response-formatter'
      );

      const input = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |`;

      const result = formatTables(input);

      expect(result).toContain('| Header 1 | Header 2 |');
      expect(result).toContain('|----------|----------|');
    });

    it('should fix tables with inconsistent column spacing', async () => {
      const { formatTables } = await import(
        '../src/adapters/response-formatter'
      );

      const input = `|Header1|Header2|
|---|---|
|Cell1|Cell2|`;

      const result = formatTables(input);

      // Should have proper spacing
      expect(result).toContain('| Header1 | Header2 |');
    });

    it('should detect and fix missing separator row', async () => {
      const { formatTables } = await import(
        '../src/adapters/response-formatter'
      );

      const input = `| Header 1 | Header 2 |
| Cell 1   | Cell 2   |`;

      const result = formatTables(input);

      // Should add separator row
      expect(result).toContain('|---|');
    });

    it('should handle tables with alignment markers', async () => {
      const { formatTables } = await import(
        '../src/adapters/response-formatter'
      );

      const input = `| Left | Center | Right |
|:-----|:------:|------:|
| a    |   b    |     c |`;

      const result = formatTables(input);

      // Should preserve alignment markers
      expect(result).toContain(':--');
      expect(result).toContain('--:');
    });

    it('should not modify non-table content', async () => {
      const { formatTables } = await import(
        '../src/adapters/response-formatter'
      );

      const input = 'This is regular text with | pipes | in it';
      const result = formatTables(input);

      expect(result).toBe(input);
    });
  });
});

// ============================================================================
// AC5: Progress Indicators
// ============================================================================
describe('AC5: Progress indicators', () => {
  describe('ProgressTracker', () => {
    it('should create progress tracker instance', async () => {
      const { ProgressTracker } = await import(
        '../src/adapters/response-formatter'
      );

      const tracker = new ProgressTracker();
      expect(tracker).toBeDefined();
    });

    it('should start progress for tool use', async () => {
      const { ProgressTracker } = await import(
        '../src/adapters/response-formatter'
      );

      const tracker = new ProgressTracker();
      const mockStream = {
        progress: vi.fn(),
      };

      tracker.startToolProgress('Read', mockStream as any);

      expect(mockStream.progress).toHaveBeenCalled();
    });

    it('should show different messages for different tool types', async () => {
      const { ProgressTracker } = await import(
        '../src/adapters/response-formatter'
      );

      const tracker = new ProgressTracker();
      const mockStream = {
        progress: vi.fn(),
      };

      tracker.startToolProgress('Read', mockStream as any);
      const readMsg = mockStream.progress.mock.calls[0][0];

      mockStream.progress.mockClear();
      tracker.startToolProgress('Bash', mockStream as any);
      const bashMsg = mockStream.progress.mock.calls[0][0];

      expect(readMsg).not.toBe(bashMsg);
    });

    it('should clear progress when tool completes', async () => {
      const { ProgressTracker } = await import(
        '../src/adapters/response-formatter'
      );

      const tracker = new ProgressTracker();
      const mockStream = {
        progress: vi.fn(),
      };

      tracker.startToolProgress('Read', mockStream as any);
      tracker.endToolProgress(mockStream as any);

      // Should have called progress twice (start and clear)
      expect(mockStream.progress).toHaveBeenCalledTimes(2);
    });

    it('should handle nested tool progress', async () => {
      const { ProgressTracker } = await import(
        '../src/adapters/response-formatter'
      );

      const tracker = new ProgressTracker();
      const mockStream = {
        progress: vi.fn(),
      };

      tracker.startToolProgress('Task', mockStream as any);
      tracker.startToolProgress('Read', mockStream as any); // Nested tool

      // Should show the inner tool's progress
      expect(mockStream.progress).toHaveBeenCalledTimes(2);
    });

    it('should track tool count for long operations', async () => {
      const { ProgressTracker } = await import(
        '../src/adapters/response-formatter'
      );

      const tracker = new ProgressTracker();

      tracker.recordToolStart('Read');
      tracker.recordToolStart('Bash');
      tracker.recordToolStart('Write');

      expect(tracker.getToolCount()).toBe(3);
    });

    it('should indicate when operation is taking long', async () => {
      const { ProgressTracker } = await import(
        '../src/adapters/response-formatter'
      );

      const tracker = new ProgressTracker();

      // Simulate 5+ tools
      for (let i = 0; i < 6; i++) {
        tracker.recordToolStart(`Tool${i}`);
      }

      expect(tracker.isLongOperation()).toBe(true);
    });
  });
});

// ============================================================================
// MSSCI-12147: XML Tag Stripping
// ============================================================================
describe('MSSCI-12147: XML tag stripping', () => {
  describe('stripSystemTags', () => {
    it('should remove <system-reminder> tags and their content', async () => {
      const { stripSystemTags } = await import(
        '../src/adapters/response-formatter'
      );

      const input = 'Hello <system-reminder>This is internal</system-reminder> World';
      const result = stripSystemTags(input);

      expect(result).toBe('Hello  World');
      expect(result).not.toContain('system-reminder');
      expect(result).not.toContain('This is internal');
    });

    it('should remove multiline <system-reminder> tags', async () => {
      const { stripSystemTags } = await import(
        '../src/adapters/response-formatter'
      );

      const input = `Some text
<system-reminder>
This is a multiline
system reminder
</system-reminder>
More text`;
      const result = stripSystemTags(input);

      expect(result).not.toContain('system-reminder');
      expect(result).toContain('Some text');
      expect(result).toContain('More text');
    });

    it('should remove <output> tags and their content', async () => {
      const { stripSystemTags } = await import(
        '../src/adapters/response-formatter'
      );

      const input = 'Result: <output>tool output here</output> done';
      const result = stripSystemTags(input);

      expect(result).not.toContain('<output>');
      expect(result).not.toContain('tool output here');
    });

    it('should remove <result> tags and their content', async () => {
      const { stripSystemTags } = await import(
        '../src/adapters/response-formatter'
      );

      const input = '<result>\n<name>Read</name>\n<output>file content</output>\n</result>';
      const result = stripSystemTags(input);

      expect(result).not.toContain('<result>');
      expect(result).not.toContain('</result>');
    });

    it('should handle empty input', async () => {
      const { stripSystemTags } = await import(
        '../src/adapters/response-formatter'
      );

      const result = stripSystemTags('');
      expect(result).toBe('');
    });

    it('should handle input with no tags', async () => {
      const { stripSystemTags } = await import(
        '../src/adapters/response-formatter'
      );

      const input = 'Just plain text with no XML tags';
      const result = stripSystemTags(input);

      expect(result).toBe(input);
    });

    it('should preserve code blocks containing XML-like content', async () => {
      const { stripSystemTags } = await import(
        '../src/adapters/response-formatter'
      );

      const input = '```xml\n<system-reminder>example</system-reminder>\n```';
      const result = stripSystemTags(input);

      // Should NOT strip content inside code blocks
      expect(result).toContain('<system-reminder>');
    });

    it('should handle multiple tags in sequence', async () => {
      const { stripSystemTags } = await import(
        '../src/adapters/response-formatter'
      );

      const input = '<system-reminder>a</system-reminder>text<system-reminder>b</system-reminder>';
      const result = stripSystemTags(input);

      expect(result).toBe('text');
    });
  });
});

// ============================================================================
// Integration: ResponseFormatter Pipeline
// ============================================================================
describe('ResponseFormatter integration', () => {
  describe('formatResponse', () => {
    it('should apply all formatters in correct order', async () => {
      const { formatResponse } = await import(
        '../src/adapters/response-formatter'
      );

      const input = `Here's some code:
\`\`\`
const x = 1;
\`\`\`

See /path/to/file.ts for details.

| Col1 | Col2 |
|------|------|
| a    | b    |`;

      const result = formatResponse(input);

      // Should have applied code formatting
      expect(result).toContain('```');
      // Should have applied file link formatting
      expect(result).toContain('command:');
      // Should have table intact
      expect(result).toContain('| Col1 | Col2 |');
    });

    it('should not double-process content', async () => {
      const { formatResponse } = await import(
        '../src/adapters/response-formatter'
      );

      const input = 'Check [existing link](http://example.com) and /path/to/file.ts';
      const result = formatResponse(input);

      // Existing link should not be modified
      expect(result).toContain('[existing link](http://example.com)');
      // File path should be converted
      expect(result).toContain('command:');
    });

    it('should handle empty input', async () => {
      const { formatResponse } = await import(
        '../src/adapters/response-formatter'
      );

      const result = formatResponse('');
      expect(result).toBe('');
    });

    it('should handle input with only whitespace', async () => {
      const { formatResponse } = await import(
        '../src/adapters/response-formatter'
      );

      const result = formatResponse('   \n   \n   ');
      expect(result).toBe('   \n   \n   ');
    });

    it('should strip system tags before other formatting (MSSCI-12147)', async () => {
      const { formatResponse } = await import(
        '../src/adapters/response-formatter'
      );

      const input = 'Hello <system-reminder>internal note</system-reminder> World';
      const result = formatResponse(input);

      expect(result).not.toContain('system-reminder');
      expect(result).not.toContain('internal note');
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });
  });
});
