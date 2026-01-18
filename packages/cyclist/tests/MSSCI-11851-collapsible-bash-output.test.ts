/**
 * MSSCI-11851: Collapsible Bash Tool Output Tests
 *
 * Tests for rendering Bash tool results in collapsible sections with
 * command, exit code, and ANSI color preservation.
 *
 * Acceptance Criteria:
 * - AC1: Bash tool results render in collapsible section
 * - AC2: Section shows command and exit code in header
 * - AC3: Collapsed by default, expandable on click
 * - AC4: Output preserves formatting and ANSI colors
 *
 * Design Notes:
 * The tool_result message from Claude CLI only contains tool_id, output, and is_error.
 * To identify Bash results and access command/exit_code, we need enrichment.
 * Tests assume the render function receives an enriched message with:
 * - tool_name: 'Bash' (from correlation with tool_use)
 * - bash_command: string (from tool_use input.command)
 * - bash_exit_code: number (extracted from output or is_error)
 */

import { describe, it, expect } from 'vitest';

// Test fixtures - standard tool result (non-Bash)
const standardToolResult = {
  type: 'tool_result',
  tool_id: 'toolu_standard_123',
  output: 'File contents here...',
  is_error: false,
};

// Test fixtures - Bash tool result (enriched)
const bashToolResultSuccess = {
  type: 'tool_result',
  tool_id: 'toolu_bash_456',
  tool_name: 'Bash',
  bash_command: 'ls -la',
  bash_exit_code: 0,
  output: 'total 32\ndrwxr-xr-x  5 user  staff  160 Jan 18 10:00 .\ndrwxr-xr-x  3 user  staff   96 Jan 18 09:00 ..\n-rw-r--r--  1 user  staff  256 Jan 18 10:00 file.txt',
  is_error: false,
};

const bashToolResultError = {
  type: 'tool_result',
  tool_id: 'toolu_bash_789',
  tool_name: 'Bash',
  bash_command: 'cat /nonexistent',
  bash_exit_code: 1,
  output: 'cat: /nonexistent: No such file or directory',
  is_error: true,
};

const bashToolResultLongCommand = {
  type: 'tool_result',
  tool_id: 'toolu_bash_long',
  tool_name: 'Bash',
  bash_command: 'find . -name "*.ts" -type f | xargs grep -l "import" | head -20',
  bash_exit_code: 0,
  output: './src/index.ts\n./src/cli.ts\n./src/utils.ts',
  is_error: false,
};

// ANSI color test fixtures
const bashToolResultWithAnsi = {
  type: 'tool_result',
  tool_id: 'toolu_bash_ansi',
  tool_name: 'Bash',
  bash_command: 'ls --color=always',
  bash_exit_code: 0,
  // ANSI escape codes: \x1b[32m = green, \x1b[0m = reset, \x1b[34m = blue
  output: '\x1b[32mfile.txt\x1b[0m\n\x1b[34mdirectory\x1b[0m/',
  is_error: false,
};

const bashToolResultMultipleAnsi = {
  type: 'tool_result',
  tool_id: 'toolu_bash_multi_ansi',
  tool_name: 'Bash',
  bash_command: 'git diff --color',
  bash_exit_code: 0,
  // Git diff colors: \x1b[31m = red (deletion), \x1b[32m = green (addition)
  output: '\x1b[31m-old line\x1b[0m\n\x1b[32m+new line\x1b[0m',
  is_error: false,
};

describe('MSSCI-11851: Collapsible Bash Output', () => {

  describe('AC1: Bash tool results render in collapsible section', () => {

    it('should export renderBashToolResult function', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      expect(renderers.renderBashToolResult).toBeDefined();
      expect(typeof renderers.renderBashToolResult).toBe('function');
    });

    it('should render Bash results with details/summary structure', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const html = renderers.renderBashToolResult(bashToolResultSuccess);

      // Should use HTML5 details/summary for native collapsibility
      expect(html).toContain('<details');
      expect(html).toContain('<summary');
      expect(html).toContain('</details>');
    });

    it('should have message-bash-result class for styling', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const html = renderers.renderBashToolResult(bashToolResultSuccess);

      expect(html).toMatch(/class="[^"]*message-bash-result[^"]*"/);
    });

    it('should NOT use details/summary for non-Bash tool results', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const html = renderers.renderToolResultMessage(standardToolResult);

      // Non-Bash results should not have the bash-specific collapsible treatment
      expect(html).not.toContain('message-bash-result');
    });

    it('should delegate Bash results from renderToolResultMessage', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      // When renderToolResultMessage receives a Bash-enriched message,
      // it should use the specialized renderBashToolResult
      const html = renderers.renderToolResultMessage(bashToolResultSuccess);

      expect(html).toContain('message-bash-result');
    });

  });

  describe('AC2: Section shows command and exit code in header', () => {

    it('should display the command in the summary', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const html = renderers.renderBashToolResult(bashToolResultSuccess);

      expect(html).toContain('ls -la');
    });

    it('should display exit code 0 with success indicator', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const html = renderers.renderBashToolResult(bashToolResultSuccess);

      // Should show exit code
      expect(html).toContain('0');
      // Should have success styling class
      expect(html).toMatch(/class="[^"]*exit-success[^"]*"/);
    });

    it('should display non-zero exit code with error indicator', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const html = renderers.renderBashToolResult(bashToolResultError);

      // Should show exit code 1
      expect(html).toContain('1');
      // Should have error styling class
      expect(html).toMatch(/class="[^"]*exit-error[^"]*"/);
    });

    it('should truncate long commands in header with ellipsis', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const html = renderers.renderBashToolResult(bashToolResultLongCommand);

      // Long command should be truncated (not show full command in summary)
      // Full command is 66 chars, should be truncated around 50-60
      expect(html).toContain('…');
      // But the summary should still exist
      expect(html).toContain('<summary');
    });

    it('should export truncateCommand helper function', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      expect(renderers.truncateCommand).toBeDefined();
      expect(typeof renderers.truncateCommand).toBe('function');
    });

    it('should truncate commands over 50 characters', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const longCommand = 'a'.repeat(60);
      const truncated = renderers.truncateCommand(longCommand);

      expect(truncated.length).toBeLessThan(60);
      expect(truncated).toContain('…');
    });

    it('should not truncate short commands', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const shortCommand = 'ls -la';
      const result = renderers.truncateCommand(shortCommand);

      expect(result).toBe(shortCommand);
    });

    it('should export formatExitCode helper function', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      expect(renderers.formatExitCode).toBeDefined();
      expect(typeof renderers.formatExitCode).toBe('function');
    });

    it('should format exit code with appropriate class', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const successResult = renderers.formatExitCode(0);
      expect(successResult).toContain('exit-success');
      expect(successResult).toContain('0');

      const errorResult = renderers.formatExitCode(1);
      expect(errorResult).toContain('exit-error');
      expect(errorResult).toContain('1');
    });

  });

  describe('AC3: Collapsed by default, expandable on click', () => {

    it('should NOT have open attribute by default', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const html = renderers.renderBashToolResult(bashToolResultSuccess);

      // Should not be open by default
      expect(html).not.toMatch(/<details[^>]*\sopen/);
    });

    it('should have open attribute when verbose mode is enabled', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      // Enable verbose mode
      renderers.setVerboseMode(true);

      const html = renderers.renderBashToolResult(bashToolResultSuccess);

      // Should be open in verbose mode
      expect(html).toMatch(/<details[^>]*\sopen/);

      // Reset verbose mode
      renderers.setVerboseMode(false);
    });

    it('should render clickable summary element', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const html = renderers.renderBashToolResult(bashToolResultSuccess);

      // Summary element makes the header clickable
      expect(html).toContain('<summary');
      expect(html).toContain('</summary>');
    });

    it('should contain output in collapsible content area', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const html = renderers.renderBashToolResult(bashToolResultSuccess);

      // Output should be inside details, after summary
      // Structure: <details><summary>...</summary><content>output</content></details>
      expect(html).toContain('file.txt'); // Part of the output
      expect(html).toContain('drwxr-xr-x'); // Part of the output
    });

  });

  describe('AC4: Output preserves formatting and ANSI colors', () => {

    it('should export ansiToHtml conversion function', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      expect(renderers.ansiToHtml).toBeDefined();
      expect(typeof renderers.ansiToHtml).toBe('function');
    });

    it('should convert ANSI green to HTML span', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const result = renderers.ansiToHtml('\x1b[32mgreen text\x1b[0m');

      // Should convert to span with class or inline style
      expect(result).toContain('green text');
      expect(result).toMatch(/<span[^>]*class="[^"]*ansi-green[^"]*"/);
    });

    it('should convert ANSI red to HTML span', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const result = renderers.ansiToHtml('\x1b[31mred text\x1b[0m');

      expect(result).toContain('red text');
      expect(result).toMatch(/<span[^>]*class="[^"]*ansi-red[^"]*"/);
    });

    it('should convert ANSI blue to HTML span', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const result = renderers.ansiToHtml('\x1b[34mblue text\x1b[0m');

      expect(result).toContain('blue text');
      expect(result).toMatch(/<span[^>]*class="[^"]*ansi-blue[^"]*"/);
    });

    it('should handle ANSI bold', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      // ANSI bold: \x1b[1m
      const result = renderers.ansiToHtml('\x1b[1mbold text\x1b[0m');

      expect(result).toContain('bold text');
      expect(result).toMatch(/<span[^>]*class="[^"]*ansi-bold[^"]*"/);
    });

    it('should handle reset sequences correctly', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const result = renderers.ansiToHtml('\x1b[32mgreen\x1b[0m normal');

      // Reset should close the span
      expect(result).toContain('</span>');
      expect(result).toContain('normal');
    });

    it('should preserve output in Bash result rendering', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const html = renderers.renderBashToolResult(bashToolResultWithAnsi);

      // Should contain converted ANSI (not raw escape codes)
      expect(html).toContain('file.txt');
      expect(html).not.toContain('\x1b[32m'); // Raw ANSI should be converted
      expect(html).toMatch(/ansi-green/); // Should have the class
    });

    it('should handle multiple ANSI codes in output', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const html = renderers.renderBashToolResult(bashToolResultMultipleAnsi);

      // Both red and green should be converted
      expect(html).toMatch(/ansi-red/);
      expect(html).toMatch(/ansi-green/);
    });

    it('should preserve whitespace and newlines', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const html = renderers.renderBashToolResult(bashToolResultSuccess);

      // Output should be in a pre element to preserve formatting
      expect(html).toContain('<pre');
      expect(html).toContain('</pre>');
    });

    it('should escape HTML entities in output', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const bashResultWithHtml = {
        ...bashToolResultSuccess,
        output: '<script>alert("xss")</script>',
      };

      const html = renderers.renderBashToolResult(bashResultWithHtml);

      // Should escape HTML to prevent XSS
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should handle output with no ANSI codes', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      const plainOutput = 'just plain text';
      const result = renderers.ansiToHtml(plainOutput);

      expect(result).toBe(plainOutput);
    });

  });

  describe('Integration: Enrichment from tool_use', () => {

    it('should export isBashToolResult helper', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      expect(renderers.isBashToolResult).toBeDefined();
      expect(typeof renderers.isBashToolResult).toBe('function');
    });

    it('should identify enriched Bash results', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      expect(renderers.isBashToolResult(bashToolResultSuccess)).toBe(true);
      expect(renderers.isBashToolResult(standardToolResult)).toBe(false);
    });

    it('should handle missing enrichment gracefully', async () => {
      const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

      // A tool_result without enrichment should still render (as standard)
      const html = renderers.renderToolResultMessage(standardToolResult);

      // Should not throw, should render as regular tool result
      expect(html).toContain('message-tool-result');
      expect(html).not.toContain('message-bash-result');
    });

  });

  describe('AC5: Message enrichment layer (reviewer fix)', () => {

    it('should export enrichMessage function', async () => {
      const enricher = await import('../src/public/js/message-enrichment.js');

      expect(enricher.enrichMessage).toBeDefined();
      expect(typeof enricher.enrichMessage).toBe('function');
    });

    it('should track tool_use messages by tool_id', async () => {
      const enricher = await import('../src/public/js/message-enrichment.js');

      // Reset state for test
      enricher.clearToolUseCache();

      const toolUseMessage = {
        type: 'tool_use',
        tool_id: 'toolu_test_123',
        tool_name: 'Bash',
        input: { command: 'ls -la' },
      };

      // Process tool_use - should cache it
      const result = enricher.enrichMessage(toolUseMessage);

      // tool_use messages pass through unchanged
      expect(result).toBe(toolUseMessage);

      // Verify it was cached
      expect(enricher.getToolUseCache().has('toolu_test_123')).toBe(true);
    });

    it('should enrich Bash tool_result with command and exit code', async () => {
      const enricher = await import('../src/public/js/message-enrichment.js');

      // Reset and set up cache
      enricher.clearToolUseCache();

      // First, process a tool_use
      enricher.enrichMessage({
        type: 'tool_use',
        tool_id: 'toolu_bash_enrich',
        tool_name: 'Bash',
        input: { command: 'echo hello' },
      });

      // Now process the tool_result
      const toolResult = {
        type: 'tool_result',
        tool_id: 'toolu_bash_enrich',
        output: 'hello',
        is_error: false,
      };

      const enriched = enricher.enrichMessage(toolResult);

      // Should be enriched with Bash-specific properties
      expect(enriched.tool_name).toBe('Bash');
      expect(enriched.bash_command).toBe('echo hello');
      expect(enriched.bash_exit_code).toBe(0);
    });

    it('should set exit code to 1 for error results', async () => {
      const enricher = await import('../src/public/js/message-enrichment.js');

      enricher.clearToolUseCache();

      enricher.enrichMessage({
        type: 'tool_use',
        tool_id: 'toolu_bash_error',
        tool_name: 'Bash',
        input: { command: 'cat /nonexistent' },
      });

      const toolResult = {
        type: 'tool_result',
        tool_id: 'toolu_bash_error',
        output: 'cat: /nonexistent: No such file or directory',
        is_error: true,
      };

      const enriched = enricher.enrichMessage(toolResult);

      expect(enriched.bash_exit_code).toBe(1);
    });

    it('should NOT enrich non-Bash tool results', async () => {
      const enricher = await import('../src/public/js/message-enrichment.js');

      enricher.clearToolUseCache();

      // Cache a Read tool_use
      enricher.enrichMessage({
        type: 'tool_use',
        tool_id: 'toolu_read_123',
        tool_name: 'Read',
        input: { file_path: '/some/file.txt' },
      });

      const toolResult = {
        type: 'tool_result',
        tool_id: 'toolu_read_123',
        output: 'file contents',
        is_error: false,
      };

      const result = enricher.enrichMessage(toolResult);

      // Should NOT have Bash-specific properties
      expect(result.tool_name).toBe('Read');
      expect(result.bash_command).toBeUndefined();
      expect(result.bash_exit_code).toBeUndefined();
    });

    it('should handle tool_result without matching tool_use gracefully', async () => {
      const enricher = await import('../src/public/js/message-enrichment.js');

      enricher.clearToolUseCache();

      // Process a tool_result without any prior tool_use
      const orphanResult = {
        type: 'tool_result',
        tool_id: 'toolu_orphan',
        output: 'some output',
        is_error: false,
      };

      const result = enricher.enrichMessage(orphanResult);

      // Should pass through unchanged (no enrichment possible)
      expect(result).toBe(orphanResult);
      expect(result.tool_name).toBeUndefined();
    });

    it('should pass through non-tool messages unchanged', async () => {
      const enricher = await import('../src/public/js/message-enrichment.js');

      const assistantMessage = {
        type: 'assistant',
        content: [{ type: 'text', text: 'Hello!' }],
      };

      const result = enricher.enrichMessage(assistantMessage);

      expect(result).toBe(assistantMessage);
    });

  });

});
