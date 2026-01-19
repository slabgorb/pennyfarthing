/**
 * Story MSSCI-11928: Persistent Bash output in message stream
 *
 * Tests verify that Bash tool_result messages from the SDK are extracted
 * from their wrapper user messages and rendered as collapsible sections
 * in the message stream.
 *
 * Acceptance Criteria:
 * - AC1: Bash tool_result messages added to message stream (not just popup)
 * - AC2: Collapsible section shows command in header
 * - AC3: Exit code badge shows success (green) or error (red)
 * - AC4: Output preserved with ANSI color support
 * - AC5: Collapsed by default, expandable on click
 *
 * Key insight: SDK sends tool_result wrapped in user messages:
 * {type: 'user', message: {content: [{type: 'tool_result', ...}]}}
 *
 * These are currently filtered out by renderUserMessage() at line 496-498.
 * We need to extract and render them via the existing Bash renderer.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// =============================================================================
// Test Fixtures: SDK Message Structures
// =============================================================================

/**
 * SDK-wrapped tool_result message structure (what Claude CLI actually sends)
 */
const createSDKToolResultMessage = (
  toolUseId: string,
  content: string,
  isError = false
) => ({
  type: 'user',
  message: {
    content: [
      {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: content,
        is_error: isError,
      },
    ],
  },
});

/**
 * Direct tool_use message (for enrichment cache)
 */
const createToolUseMessage = (
  toolId: string,
  toolName: string,
  input: Record<string, unknown>
) => ({
  type: 'tool_use',
  tool_id: toolId,
  tool_name: toolName,
  input,
});

// Sample SDK messages
const bashToolUse = createToolUseMessage('toolu_01ABC123', 'Bash', {
  command: 'git status',
});

const bashToolResultSuccess = createSDKToolResultMessage(
  'toolu_01ABC123',
  'On branch main\nnothing to commit, working tree clean',
  false
);

const bashToolResultError = createSDKToolResultMessage(
  'toolu_01ABC456',
  'fatal: not a git repository',
  true
);

const bashToolResultWithAnsi = createSDKToolResultMessage(
  'toolu_01ABC789',
  '\x1b[32m✓\x1b[0m All tests passed\n\x1b[31m✗\x1b[0m One failure',
  false
);

// Non-Bash tool result (should also be rendered)
const readToolUse = createToolUseMessage('toolu_01READ001', 'Read', {
  file_path: '/test/file.ts',
});

const readToolResult = createSDKToolResultMessage(
  'toolu_01READ001',
  'file contents here...',
  false
);

// User message from editor (not SDK) - should still render normally
const editorUserMessage = {
  type: 'user',
  content: 'Hello Claude, help me with this code',
};

describe('Story MSSCI-11928: Persistent Bash output in message stream', () => {
  describe('AC1: Bash tool_result messages added to message stream', () => {
    it('should export extractToolResultsFromUserMessage function', async () => {
      // This new function should extract tool_result blocks from SDK user messages
      const module = await import('../src/public/js/message-view-init.js');

      expect(module.extractToolResultsFromUserMessage).toBeDefined();
      expect(typeof module.extractToolResultsFromUserMessage).toBe('function');
    });

    it('should extract tool_result from SDK user message', async () => {
      const module = await import('../src/public/js/message-view-init.js');

      const results = module.extractToolResultsFromUserMessage(bashToolResultSuccess);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('tool_result');
      expect(results[0].tool_id).toBe('toolu_01ABC123');
      expect(results[0].output).toContain('nothing to commit');
    });

    it('should return empty array for editor user messages (no SDK content)', async () => {
      const module = await import('../src/public/js/message-view-init.js');

      const results = module.extractToolResultsFromUserMessage(editorUserMessage);

      expect(results).toHaveLength(0);
    });

    it('should extract multiple tool_results from single user message', async () => {
      const module = await import('../src/public/js/message-view-init.js');

      // SDK can batch multiple tool results
      const multiResultMessage = {
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_01', content: 'output1', is_error: false },
            { type: 'tool_result', tool_use_id: 'toolu_02', content: 'output2', is_error: false },
          ],
        },
      };

      const results = module.extractToolResultsFromUserMessage(multiResultMessage);

      expect(results).toHaveLength(2);
      expect(results[0].tool_id).toBe('toolu_01');
      expect(results[1].tool_id).toBe('toolu_02');
    });

    it('should preserve is_error flag in extracted results', async () => {
      const module = await import('../src/public/js/message-view-init.js');

      const results = module.extractToolResultsFromUserMessage(bashToolResultError);

      expect(results).toHaveLength(1);
      expect(results[0].is_error).toBe(true);
    });

    it('should return empty array for non-user message types', async () => {
      const module = await import('../src/public/js/message-view-init.js');

      const assistantMessage = { type: 'assistant', content: 'Hello' };
      const results = module.extractToolResultsFromUserMessage(assistantMessage);

      expect(results).toHaveLength(0);
    });
  });

  describe('AC2: Collapsible section shows command in header', () => {
    it('should render Bash tool_result with command in header', async () => {
      const enrichment = await import('../src/public/js/message-enrichment.js');
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      // First cache the tool_use to enable enrichment
      enrichment.enrichMessage(bashToolUse);

      // Now enrich the tool_result
      const toolResult = {
        type: 'tool_result',
        tool_id: 'toolu_01ABC123',
        output: 'On branch main\nnothing to commit',
        is_error: false,
      };
      const enriched = enrichment.enrichMessage(toolResult);

      // Render should produce collapsible with command
      const html = renderers.renderToolResultMessage(enriched);

      expect(html).toContain('git status');
      expect(html).toContain('details');
      expect(html).toContain('summary');
    });

    it('should truncate long commands in header', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const truncated = renderers.truncateCommand(
        'git log --oneline --graph --all --decorate --color=always | head -50'
      );

      expect(truncated.length).toBeLessThanOrEqual(50);
      expect(truncated).toContain('…');
    });
  });

  describe('AC3: Exit code badge shows success (green) or error (red)', () => {
    it('should render exit code 0 with success class', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const html = renderers.formatExitCode(0);

      expect(html).toContain('exit-success');
      expect(html).toContain('0');
    });

    it('should render non-zero exit code with error class', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const html = renderers.formatExitCode(1);

      expect(html).toContain('exit-error');
      expect(html).toContain('1');
    });

    it('should include exit code in Bash tool_result rendering', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      // Directly test the Bash renderer with enriched message
      const bashResult = {
        type: 'tool_result',
        tool_id: 'test-id',
        output: 'test output',
        is_error: false,
        tool_name: 'Bash',
        bash_command: 'ls -la',
        bash_exit_code: 0,
      };

      const html = renderers.renderBashToolResult(bashResult);

      expect(html).toContain('bash-exit-code');
      expect(html).toContain('exit-success');
    });

    it('should show error styling for failed Bash commands', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const bashResult = {
        type: 'tool_result',
        tool_id: 'test-id',
        output: 'command not found',
        is_error: true,
        tool_name: 'Bash',
        bash_command: 'nonexistent-command',
        bash_exit_code: 127,
      };

      const html = renderers.renderBashToolResult(bashResult);

      expect(html).toContain('exit-error');
      expect(html).toContain('127');
    });
  });

  describe('AC4: Output preserved with ANSI color support', () => {
    it('should convert ANSI green to HTML span', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const html = renderers.ansiToHtml('\x1b[32mgreen text\x1b[0m');

      expect(html).toContain('ansi-green');
      expect(html).toContain('green text');
    });

    it('should convert ANSI red to HTML span', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const html = renderers.ansiToHtml('\x1b[31mred text\x1b[0m');

      expect(html).toContain('ansi-red');
    });

    it('should handle multiple ANSI codes in sequence', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const html = renderers.ansiToHtml('\x1b[1m\x1b[32mbold green\x1b[0m normal');

      expect(html).toContain('ansi-bold');
      expect(html).toContain('ansi-green');
    });

    it('should preserve output in Bash result rendering', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const bashResult = {
        type: 'tool_result',
        tool_id: 'test-id',
        output: 'line1\nline2\nline3',
        is_error: false,
        tool_name: 'Bash',
        bash_command: 'echo test',
        bash_exit_code: 0,
      };

      const html = renderers.renderBashToolResult(bashResult);

      expect(html).toContain('line1');
      expect(html).toContain('line2');
      expect(html).toContain('line3');
    });

    it('should escape HTML entities in output', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const bashResult = {
        type: 'tool_result',
        tool_id: 'test-id',
        output: '<script>alert("xss")</script>',
        is_error: false,
        tool_name: 'Bash',
        bash_command: 'echo test',
        bash_exit_code: 0,
      };

      const html = renderers.renderBashToolResult(bashResult);

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('AC5: Collapsed by default, expandable on click', () => {
    it('should render Bash output in details element (collapsed by default)', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const bashResult = {
        type: 'tool_result',
        tool_id: 'test-id',
        output: 'test output',
        is_error: false,
        tool_name: 'Bash',
        bash_command: 'ls',
        bash_exit_code: 0,
      };

      const html = renderers.renderBashToolResult(bashResult);

      // Should use <details> without open attribute (collapsed)
      expect(html).toContain('<details');
      expect(html).not.toMatch(/<details[^>]*open/);
    });

    it('should have summary with command for click target', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const bashResult = {
        type: 'tool_result',
        tool_id: 'test-id',
        output: 'output',
        is_error: false,
        tool_name: 'Bash',
        bash_command: 'pwd',
        bash_exit_code: 0,
      };

      const html = renderers.renderBashToolResult(bashResult);

      expect(html).toContain('<summary');
      expect(html).toContain('pwd');
    });

    it('should expand (open attribute) when verbose mode enabled', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      // Enable verbose mode
      renderers.setVerboseMode(true);

      const bashResult = {
        type: 'tool_result',
        tool_id: 'test-id',
        output: 'output',
        is_error: false,
        tool_name: 'Bash',
        bash_command: 'ls',
        bash_exit_code: 0,
      };

      const html = renderers.renderBashToolResult(bashResult);

      // Should have open attribute when verbose
      expect(html).toMatch(/<details[^>]*open/);

      // Reset
      renderers.setVerboseMode(false);
    });

    it('should have collapsible class for consistent styling', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const bashResult = {
        type: 'tool_result',
        tool_id: 'test-id',
        output: 'output',
        is_error: false,
        tool_name: 'Bash',
        bash_command: 'ls',
        bash_exit_code: 0,
      };

      const html = renderers.renderBashToolResult(bashResult);

      expect(html).toContain('collapsible');
    });
  });

  describe('Integration: End-to-end message processing', () => {
    beforeEach(async () => {
      // Clear enrichment cache between tests
      const enrichment = await import('../src/public/js/message-enrichment.js');
      enrichment.clearToolUseCache();
    });

    it('should enrich Bash tool_result with command from cached tool_use', async () => {
      const enrichment = await import('../src/public/js/message-enrichment.js');

      // Cache the tool_use first (this happens when SDK sends tool_use)
      enrichment.enrichMessage(bashToolUse);

      // Now process the tool_result
      const toolResult = {
        type: 'tool_result',
        tool_id: 'toolu_01ABC123',
        output: 'output here',
        is_error: false,
      };

      const enriched = enrichment.enrichMessage(toolResult);

      expect(enriched.tool_name).toBe('Bash');
      expect(enriched.bash_command).toBe('git status');
      expect(enriched.bash_exit_code).toBe(0);
    });

    it('should detect Bash tool_result correctly', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const bashMessage = {
        type: 'tool_result',
        tool_name: 'Bash',
        output: 'test',
      };

      const nonBashMessage = {
        type: 'tool_result',
        tool_name: 'Read',
        output: 'test',
      };

      expect(renderers.isBashToolResult(bashMessage)).toBe(true);
      expect(renderers.isBashToolResult(nonBashMessage)).toBe(false);
    });

    it('should route Bash tool_result to specialized renderer', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const bashResult = {
        type: 'tool_result',
        tool_id: 'test-id',
        output: 'test output',
        is_error: false,
        tool_name: 'Bash',
        bash_command: 'echo hello',
        bash_exit_code: 0,
      };

      const html = renderers.renderToolResultMessage(bashResult);

      // Should use Bash-specific rendering
      expect(html).toContain('message-bash-result');
      expect(html).toContain('bash-header');
      expect(html).toContain('bash-command');
    });

    it('should still render non-Bash tool_results normally', async () => {
      const enrichment = await import('../src/public/js/message-enrichment.js');
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      // Cache Read tool_use
      enrichment.enrichMessage(readToolUse);

      const toolResult = {
        type: 'tool_result',
        tool_id: 'toolu_01READ001',
        output: 'file contents here...',
        is_error: false,
      };

      const enriched = enrichment.enrichMessage(toolResult);
      const html = renderers.renderToolResultMessage(enriched);

      // Should NOT use Bash-specific rendering
      expect(html).not.toContain('message-bash-result');
      expect(html).toContain('tool-result');
    });
  });
});
