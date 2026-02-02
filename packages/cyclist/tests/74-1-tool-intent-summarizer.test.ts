/**
 * Story 74-1: Tool Intent Summarizer Tests
 *
 * TDD RED phase - these tests should FAIL until Dev implements the functionality.
 * Tests verify all acceptance criteria for generating human-readable tool intent summaries.
 */

import { describe, it, expect } from 'vitest';
import { generateToolIntentSummary } from '../src/public/utils/toolIntentSummarizer.js';

describe('74-1: Tool Intent Summarizer', () => {
  describe('AC1: Generates readable summary for all common tools', () => {
    describe('Read tool', () => {
      it('should summarize Read with file path', () => {
        const result = generateToolIntentSummary('Read', { file_path: '/src/foo.ts' });
        expect(result).toBe('Reading /src/foo.ts');
      });

      it('should summarize Read with absolute path', () => {
        const result = generateToolIntentSummary('Read', { file_path: '/Users/dev/project/config.json' });
        expect(result).toContain('Reading');
        expect(result).toContain('config.json');
      });
    });

    describe('Bash tool', () => {
      it('should summarize Bash with simple command', () => {
        const result = generateToolIntentSummary('Bash', { command: 'git status' });
        expect(result).toBe('Running git status');
      });

      it('should summarize Bash with npm install', () => {
        const result = generateToolIntentSummary('Bash', { command: 'npm install' });
        expect(result).toBe('Installing dependencies');
      });

      it('should summarize Bash with pnpm install', () => {
        const result = generateToolIntentSummary('Bash', { command: 'pnpm install' });
        expect(result).toBe('Installing dependencies');
      });

      it('should summarize Bash with yarn add', () => {
        const result = generateToolIntentSummary('Bash', { command: 'yarn add lodash' });
        expect(result).toBe('Installing dependencies');
      });

      it('should summarize Bash with test command', () => {
        const result = generateToolIntentSummary('Bash', { command: 'npm test' });
        expect(result).toBe('Running tests');
      });

      it('should summarize Bash with pnpm test', () => {
        const result = generateToolIntentSummary('Bash', { command: 'pnpm test' });
        expect(result).toBe('Running tests');
      });

      it('should summarize Bash with vitest', () => {
        const result = generateToolIntentSummary('Bash', { command: 'vitest run' });
        expect(result).toBe('Running tests');
      });

      it('should summarize Bash with jest', () => {
        const result = generateToolIntentSummary('Bash', { command: 'jest --coverage' });
        expect(result).toBe('Running tests');
      });

      it('should summarize Bash with build command', () => {
        const result = generateToolIntentSummary('Bash', { command: 'npm run build' });
        expect(result).toBe('Building project');
      });

      it('should summarize Bash with tsc', () => {
        const result = generateToolIntentSummary('Bash', { command: 'tsc --noEmit' });
        expect(result).toBe('Type checking');
      });

      it('should summarize Bash with generic command', () => {
        const result = generateToolIntentSummary('Bash', { command: 'ls -la' });
        expect(result).toBe('Running ls -la');
      });
    });

    describe('Glob tool', () => {
      it('should summarize Glob with TypeScript pattern', () => {
        const result = generateToolIntentSummary('Glob', { pattern: '**/*.ts' });
        expect(result).toBe('Finding **/*.ts files');
      });

      it('should summarize Glob with specific directory', () => {
        const result = generateToolIntentSummary('Glob', { pattern: 'src/**/*.tsx', path: '/project' });
        expect(result).toBe('Finding src/**/*.tsx files');
      });

      it('should summarize Glob with JSON pattern', () => {
        const result = generateToolIntentSummary('Glob', { pattern: '*.json' });
        expect(result).toBe('Finding *.json files');
      });
    });

    describe('Grep tool', () => {
      it('should summarize Grep with search pattern', () => {
        const result = generateToolIntentSummary('Grep', { pattern: 'TODO' });
        expect(result).toBe("Searching for 'TODO'");
      });

      it('should summarize Grep with regex pattern', () => {
        const result = generateToolIntentSummary('Grep', { pattern: 'function\\s+\\w+' });
        expect(result).toContain('Searching for');
      });

      it('should summarize Grep with path context', () => {
        const result = generateToolIntentSummary('Grep', { pattern: 'error', path: 'src/' });
        expect(result).toContain("Searching for 'error'");
      });
    });

    describe('Write tool', () => {
      it('should summarize Write with file path', () => {
        const result = generateToolIntentSummary('Write', { file_path: '/config.json' });
        expect(result).toBe('Creating /config.json');
      });

      it('should summarize Write with new file', () => {
        const result = generateToolIntentSummary('Write', { file_path: '/src/utils/helper.ts' });
        expect(result).toContain('Creating');
        expect(result).toContain('helper.ts');
      });
    });

    describe('Edit tool', () => {
      it('should summarize Edit with file path', () => {
        const result = generateToolIntentSummary('Edit', { file_path: '/src/utils.ts' });
        expect(result).toBe('Editing /src/utils.ts');
      });

      it('should summarize Edit with nested file path', () => {
        const result = generateToolIntentSummary('Edit', { file_path: '/src/components/Button.tsx' });
        expect(result).toContain('Editing');
        expect(result).toContain('Button.tsx');
      });
    });

    describe('Task tool', () => {
      it('should summarize Task with subagent type', () => {
        const result = generateToolIntentSummary('Task', { subagent_type: 'Explore' });
        expect(result).toBe('Launching Explore agent');
      });

      it('should summarize Task with description', () => {
        const result = generateToolIntentSummary('Task', {
          subagent_type: 'general-purpose',
          description: 'find error handlers',
        });
        expect(result).toContain('Launching general-purpose agent');
      });

      it('should summarize Task with Bash subagent', () => {
        const result = generateToolIntentSummary('Task', { subagent_type: 'Bash' });
        expect(result).toBe('Launching Bash agent');
      });

      it('should summarize Task with Plan subagent', () => {
        const result = generateToolIntentSummary('Task', { subagent_type: 'Plan' });
        expect(result).toBe('Launching Plan agent');
      });
    });

    describe('WebFetch tool', () => {
      it('should summarize WebFetch with URL', () => {
        const result = generateToolIntentSummary('WebFetch', { url: 'https://example.com/api' });
        expect(result).toContain('Fetching');
        expect(result).toContain('example.com');
      });
    });

    describe('WebSearch tool', () => {
      it('should summarize WebSearch with query', () => {
        const result = generateToolIntentSummary('WebSearch', { query: 'React hooks best practices' });
        expect(result).toContain('Searching web');
        expect(result).toContain('React hooks');
      });
    });
  });

  describe('AC2: Handles edge cases gracefully', () => {
    describe('Unknown tools', () => {
      it('should show tool name for unknown tools', () => {
        const result = generateToolIntentSummary('UnknownTool', { foo: 'bar' });
        expect(result).toContain('UnknownTool');
      });

      it('should truncate long JSON for unknown tools', () => {
        const longInput = { data: 'a'.repeat(100) };
        const result = generateToolIntentSummary('CustomTool', longInput);
        expect(result.length).toBeLessThanOrEqual(80);
        expect(result).toContain('CustomTool');
      });

      it('should handle complex nested input for unknown tools', () => {
        const result = generateToolIntentSummary('NewTool', {
          nested: { deep: { value: 'test' } },
          array: [1, 2, 3],
        });
        expect(result).toContain('NewTool');
        expect(result.length).toBeLessThanOrEqual(80);
      });
    });

    describe('Missing input fields', () => {
      it('should handle Read with missing file_path', () => {
        const result = generateToolIntentSummary('Read', {});
        expect(result).toContain('Read');
        expect(result).not.toContain('undefined');
      });

      it('should handle Bash with missing command', () => {
        const result = generateToolIntentSummary('Bash', {});
        expect(result).toContain('Bash');
        expect(result).not.toContain('undefined');
      });

      it('should handle Glob with missing pattern', () => {
        const result = generateToolIntentSummary('Glob', {});
        expect(result).toContain('Glob');
        expect(result).not.toContain('undefined');
      });

      it('should handle Task with missing subagent_type', () => {
        const result = generateToolIntentSummary('Task', {});
        expect(result).toContain('Task');
        expect(result).not.toContain('undefined');
      });
    });

    describe('Null and empty values', () => {
      it('should handle null input', () => {
        const result = generateToolIntentSummary('Read', null as unknown as Record<string, unknown>);
        expect(result).toContain('Read');
        expect(result).not.toContain('null');
      });

      it('should handle undefined input', () => {
        const result = generateToolIntentSummary('Read', undefined as unknown as Record<string, unknown>);
        expect(result).toContain('Read');
        expect(result).not.toContain('undefined');
      });

      it('should handle empty string values', () => {
        const result = generateToolIntentSummary('Read', { file_path: '' });
        expect(result).toContain('Read');
      });

      it('should handle null field values', () => {
        const result = generateToolIntentSummary('Read', { file_path: null });
        expect(result).toContain('Read');
        expect(result).not.toContain('null');
      });
    });

    describe('Truncation', () => {
      it('should truncate long file paths', () => {
        const longPath = '/very/long/path/' + 'nested/'.repeat(20) + 'file.ts';
        const result = generateToolIntentSummary('Read', { file_path: longPath });
        expect(result.length).toBeLessThanOrEqual(70);
        expect(result).toContain('...');
      });

      it('should truncate long commands', () => {
        const longCommand = 'git log --oneline ' + '--author=someone '.repeat(10);
        const result = generateToolIntentSummary('Bash', { command: longCommand });
        expect(result.length).toBeLessThanOrEqual(70);
      });

      it('should truncate long patterns', () => {
        const longPattern = '**/src/**/' + 'components/'.repeat(10) + '*.tsx';
        const result = generateToolIntentSummary('Glob', { pattern: longPattern });
        expect(result.length).toBeLessThanOrEqual(70);
      });
    });
  });

  describe('AC3: Extracts meaningful context from input parameters', () => {
    describe('Intelligent Bash command detection', () => {
      it('should detect git operations', () => {
        const result = generateToolIntentSummary('Bash', { command: 'git commit -m "feat: add new feature"' });
        expect(result).toContain('git commit');
      });

      it('should detect docker commands', () => {
        const result = generateToolIntentSummary('Bash', { command: 'docker build -t myapp .' });
        expect(result).toContain('Running docker');
      });

      it('should detect lint commands', () => {
        const result = generateToolIntentSummary('Bash', { command: 'eslint src/' });
        expect(result).toBe('Linting code');
      });

      it('should detect prettier/format commands', () => {
        const result = generateToolIntentSummary('Bash', { command: 'prettier --write .' });
        expect(result).toBe('Formatting code');
      });
    });

    describe('File type context', () => {
      it('should identify TypeScript files', () => {
        const result = generateToolIntentSummary('Read', { file_path: '/src/utils.ts' });
        expect(result).toContain('.ts');
      });

      it('should identify test files', () => {
        const result = generateToolIntentSummary('Read', { file_path: '/src/utils.test.ts' });
        expect(result).toContain('.test.ts');
      });

      it('should identify config files', () => {
        const result = generateToolIntentSummary('Read', { file_path: '/package.json' });
        expect(result).toContain('package.json');
      });
    });

    describe('Search context', () => {
      it('should include search pattern in Grep summary', () => {
        const result = generateToolIntentSummary('Grep', { pattern: 'handleError' });
        expect(result).toContain('handleError');
      });

      it('should handle quoted patterns', () => {
        const result = generateToolIntentSummary('Grep', { pattern: '"use strict"' });
        expect(result).toContain('use strict');
      });
    });

    describe('Task context', () => {
      it('should include description when present', () => {
        const result = generateToolIntentSummary('Task', {
          subagent_type: 'Explore',
          description: 'find authentication logic',
        });
        expect(result).toContain('Explore');
      });

      it('should extract prompt context when no description', () => {
        const result = generateToolIntentSummary('Task', {
          subagent_type: 'general-purpose',
          prompt: 'Search for all error handling patterns in the codebase',
        });
        expect(result).toContain('general-purpose');
      });
    });

    describe('Edit operations', () => {
      it('should include old_string context for understanding the change', () => {
        const result = generateToolIntentSummary('Edit', {
          file_path: '/src/app.ts',
          old_string: 'const x = 1',
          new_string: 'const x = 2',
        });
        expect(result).toContain('Editing');
        expect(result).toContain('app.ts');
      });
    });
  });

  describe('Return type and format', () => {
    it('should always return a string', () => {
      const result = generateToolIntentSummary('Read', { file_path: '/test.ts' });
      expect(typeof result).toBe('string');
    });

    it('should never return empty string', () => {
      const result = generateToolIntentSummary('Unknown', {});
      expect(result.length).toBeGreaterThan(0);
    });

    it('should not have leading/trailing whitespace', () => {
      const result = generateToolIntentSummary('Read', { file_path: '/test.ts' });
      expect(result).toBe(result.trim());
    });

    it('should be single line (no newlines)', () => {
      const result = generateToolIntentSummary('Bash', { command: 'echo "line1\nline2"' });
      expect(result).not.toContain('\n');
    });
  });
});
