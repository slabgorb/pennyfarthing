/**
 * B-14: Enhanced Message Display Tests
 *
 * Tests verify the MessageView component shows enhanced information:
 * - Init message shows model name and permission mode
 * - Result message shows turn count and duration
 * - Tool use blocks show execution status indicator
 * - Streaming text shows visual indicator
 *
 * Acceptance Criteria:
 * - AC1: Init message shows model name (e.g., "opus-4-5")
 * - AC2: Init message shows permission mode
 * - AC3: Result message shows turn count ("3 turns")
 * - AC4: Result message shows duration ("2.8s")
 * - AC5: Tool use blocks show execution status indicator
 * - AC6: Streaming text shows visual indicator while generating
 * - AC7: All existing functionality preserved (no regression)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Extended message types for B-14 (includes fields from Claude CLI stream-json)
interface B14SystemMessage {
  type: 'system';
  subtype?: 'init';
  session_id: string;
  model: string;
  cwd?: string;
  tools?: string[];
  permissionMode?: string;
  claude_code_version?: string;
}

interface B14ResultMessage {
  type: 'result';
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  session_id?: string;
}

// Test fixtures
const initMessageWithAllFields: B14SystemMessage = {
  type: 'system',
  subtype: 'init',
  session_id: 'test-session-abc123',
  model: 'claude-opus-4-5-20251101',
  cwd: '/test/project',
  tools: ['Read', 'Write', 'Bash', 'Grep', 'Glob'],
  permissionMode: 'acceptEdits',
  claude_code_version: '1.0.42',
};

const initMessageMinimal: B14SystemMessage = {
  type: 'system',
  subtype: 'init',
  session_id: 'test-session-xyz789',
  model: 'claude-sonnet-4-20250514',
};

const resultMessageWithTurns: B14ResultMessage = {
  type: 'result',
  usage: {
    input_tokens: 1500,
    output_tokens: 250,
  },
  cost_usd: 0.0156,
  duration_ms: 2847,
  num_turns: 3,
  session_id: 'test-session-abc123',
};

const resultMessageMinimal: B14ResultMessage = {
  type: 'result',
  usage: {
    input_tokens: 100,
    output_tokens: 50,
  },
  cost_usd: 0.0012,
  duration_ms: 1234,
};

describe('B-14: Enhanced Message Display', () => {

  describe('AC1: Init message shows model name', () => {

    it('should extract short model name from full model ID', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      // New function to export for model name parsing
      expect(messageView.formatModelName).toBeDefined();
      expect(typeof messageView.formatModelName).toBe('function');
    });

    it('should format claude-opus-4-5-20251101 as opus-4-5', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const shortName = messageView.formatModelName('claude-opus-4-5-20251101');

      expect(shortName).toBe('opus-4-5');
    });

    it('should format claude-sonnet-4-20250514 as sonnet-4', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const shortName = messageView.formatModelName('claude-sonnet-4-20250514');

      expect(shortName).toBe('sonnet-4');
    });

    it('should handle unknown model formats gracefully', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const shortName = messageView.formatModelName('some-unknown-model');

      // Should return the original or a reasonable fallback
      expect(shortName).toBeTruthy();
    });

    it('should display model name in init message', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderSystemMessage(initMessageWithAllFields);

      // Should contain the formatted model name
      expect(html).toContain('opus-4-5');
    });

    it('should include model name element with identifiable class', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderSystemMessage(initMessageWithAllFields);

      // Should have a class for styling the model name
      expect(html).toMatch(/class="[^"]*init-model[^"]*"/);
    });

  });

  describe('AC2: Init message shows permission mode', () => {

    it('should export formatPermissionMode function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.formatPermissionMode).toBeDefined();
      expect(typeof messageView.formatPermissionMode).toBe('function');
    });

    it('should format acceptEdits as human-readable label', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const label = messageView.formatPermissionMode('acceptEdits');

      expect(label).toBe('Accept Edits');
    });

    it('should format dangerouslySkipPermissions appropriately', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const label = messageView.formatPermissionMode('dangerouslySkipPermissions');

      // Should be concise but clear about the dangerous mode
      expect(label).toMatch(/skip/i);
    });

    it('should format default mode', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const label = messageView.formatPermissionMode('default');

      expect(label).toBe('Default');
    });

    it('should format plan mode', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const label = messageView.formatPermissionMode('plan');

      expect(label).toBe('Plan Mode');
    });

    it('should display permission mode in init message', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderSystemMessage(initMessageWithAllFields);

      // Should contain the formatted permission mode
      expect(html).toContain('Accept Edits');
    });

    it('should include permission mode element with identifiable class', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderSystemMessage(initMessageWithAllFields);

      // Should have a class for styling the permission mode
      expect(html).toMatch(/class="[^"]*init-mode[^"]*"/);
    });

    it('should handle missing permission mode gracefully', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderSystemMessage(initMessageMinimal);

      // Should not throw, should still render
      expect(html).toContain('message-system');
    });

  });

  describe('AC3: Result message shows turn count', () => {

    it('should export formatTurnCount function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.formatTurnCount).toBeDefined();
      expect(typeof messageView.formatTurnCount).toBe('function');
    });

    it('should format 1 turn correctly (singular)', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const formatted = messageView.formatTurnCount(1);

      expect(formatted).toBe('1 turn');
    });

    it('should format multiple turns correctly (plural)', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const formatted = messageView.formatTurnCount(3);

      expect(formatted).toBe('3 turns');
    });

    it('should display turn count in result message', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderResultMessage(resultMessageWithTurns);

      // Should contain the turn count
      expect(html).toContain('3 turns');
    });

    it('should include turn count element with identifiable class', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderResultMessage(resultMessageWithTurns);

      // Should have a class for styling the turn count
      expect(html).toMatch(/class="[^"]*result-turns[^"]*"/);
    });

    it('should handle missing turn count gracefully', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderResultMessage(resultMessageMinimal);

      // Should not throw, should not show turn count
      expect(html).not.toContain('turn');
    });

  });

  describe('AC4: Result message shows duration', () => {

    it('should export formatDuration function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.formatDuration).toBeDefined();
      expect(typeof messageView.formatDuration).toBe('function');
    });

    it('should format milliseconds to seconds with one decimal', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const formatted = messageView.formatDuration(2847);

      expect(formatted).toBe('2.8s');
    });

    it('should format sub-second durations', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const formatted = messageView.formatDuration(450);

      expect(formatted).toBe('0.5s');
    });

    it('should format exact seconds', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const formatted = messageView.formatDuration(5000);

      expect(formatted).toBe('5.0s');
    });

    it('should display formatted duration in result message', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderResultMessage(resultMessageWithTurns);

      // Should contain the duration in the new format
      expect(html).toContain('2.8s');
    });

  });

  describe('AC5: Tool use blocks show execution status indicator', () => {

    it('should export getToolStatus function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.getToolStatus).toBeDefined();
      expect(typeof messageView.getToolStatus).toBe('function');
    });

    it('should export setToolStatus function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.setToolStatus).toBeDefined();
      expect(typeof messageView.setToolStatus).toBe('function');
    });

    it('should track tool execution status by tool_id', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      messageView.setToolStatus('tool_123', 'running');
      const status = messageView.getToolStatus('tool_123');

      expect(status).toBe('running');
    });

    it('should update status to complete when tool result arrives', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      messageView.setToolStatus('tool_456', 'running');
      messageView.setToolStatus('tool_456', 'complete');
      const status = messageView.getToolStatus('tool_456');

      expect(status).toBe('complete');
    });

    it('should return undefined for unknown tool_id', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const status = messageView.getToolStatus('unknown_tool');

      expect(status).toBeUndefined();
    });

    it('should include status indicator in tool use HTML', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const toolUse = {
        type: 'tool_use',
        tool_name: 'Read',
        tool_id: 'tool_789',
        input: { file_path: '/test/file.ts' },
      };

      const html = messageView.renderToolUseMessage(toolUse);

      // Should have a status indicator element
      expect(html).toMatch(/class="[^"]*tool-status[^"]*"/);
    });

    it('should export clearToolStatuses function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.clearToolStatuses).toBeDefined();
      expect(typeof messageView.clearToolStatuses).toBe('function');
    });

  });

  describe('AC6: Streaming text shows visual indicator while generating', () => {

    it('should show thinking indicator when streaming starts', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      // showThinking should be called when streaming begins
      expect(messageView.showThinking).toBeDefined();
      expect(typeof messageView.showThinking).toBe('function');
    });

    it('should hide thinking indicator when streaming ends', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      // hideThinking should be called when streaming completes
      expect(messageView.hideThinking).toBeDefined();
      expect(typeof messageView.hideThinking).toBe('function');
    });

    it('should return streaming state with indicator visibility', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const state = messageView.getStreamingState();

      // Streaming state should exist
      expect(state).toHaveProperty('isStreaming');
    });

    // Note: Visual indicator animation testing is better done manually
    // as it involves CSS animations and DOM state

  });

  describe('AC7: All existing functionality preserved (no regression)', () => {

    it('should still render basic system messages', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const systemMessage = {
        type: 'system',
        session_id: 'test-123',
        model: 'claude-sonnet-4-20250514',
        cwd: '/test',
        tools: ['Read'],
      };

      const html = messageView.renderSystemMessage(systemMessage);

      expect(html).toContain('message-system');
    });

    it('should still render result messages with tokens and cost', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderResultMessage(resultMessageWithTurns);

      // Original functionality: tokens and cost
      expect(html).toContain('1500');  // input tokens
      expect(html).toContain('250');   // output tokens
      expect(html).toContain('0.0156'); // cost
    });

    it('should still render tool use messages with name and input', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const toolUse = {
        type: 'tool_use',
        tool_name: 'Bash',
        tool_id: 'tool_abc',
        input: { command: 'ls -la' },
      };

      const html = messageView.renderToolUseMessage(toolUse);

      expect(html).toContain('Bash');
      expect(html).toContain('ls -la');
    });

    it('should still support auto-scroll functionality', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.getAutoScroll).toBeDefined();
      expect(messageView.setAutoScroll).toBeDefined();
      expect(messageView.scrollToBottom).toBeDefined();
    });

    it('should still support streaming message updates', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.startStreamingMessage).toBeDefined();
      expect(messageView.updateStreamingMessage).toBeDefined();
      expect(messageView.endStreamingMessage).toBeDefined();
    });

    it('should still export parseMarkdown function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.parseMarkdown).toBeDefined();

      const html = messageView.parseMarkdown('**bold** and *italic*');

      expect(html).toContain('<strong>');
      expect(html).toContain('<em>');
    });

  });

  describe('Permission denials display', () => {

    const resultWithDenials = {
      type: 'result',
      usage: { input_tokens: 100, output_tokens: 50 },
      cost_usd: 0.01,
      duration_ms: 1000,
      num_turns: 1,
      permission_denials: [
        {
          tool_name: 'Write',
          tool_use_id: 'toolu_123',
          tool_input: { file_path: '/etc/test.txt', content: 'hello' },
        },
      ],
    };

    const resultWithMultipleDenials = {
      type: 'result',
      usage: { input_tokens: 100, output_tokens: 50 },
      cost_usd: 0.01,
      duration_ms: 1000,
      num_turns: 2,
      permission_denials: [
        {
          tool_name: 'Write',
          tool_use_id: 'toolu_123',
          tool_input: { file_path: '/etc/passwd', content: 'bad' },
        },
        {
          tool_name: 'WebFetch',
          tool_use_id: 'toolu_456',
          tool_input: { url: 'https://evil.com', prompt: 'fetch' },
        },
      ],
    };

    const resultNoDenials = {
      type: 'result',
      usage: { input_tokens: 100, output_tokens: 50 },
      cost_usd: 0.01,
      duration_ms: 1000,
      permission_denials: [],
    };

    it('should display permission denials when present', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderResultMessage(resultWithDenials);

      expect(html).toContain('Permission Denied');
      expect(html).toContain('Write');
      expect(html).toContain('/etc/test.txt');
    });

    it('should add has-denials class when denials present', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderResultMessage(resultWithDenials);

      expect(html).toContain('has-denials');
    });

    it('should show multiple denials', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderResultMessage(resultWithMultipleDenials);

      expect(html).toContain('Write');
      expect(html).toContain('WebFetch');
      expect(html).toContain('/etc/passwd');
      expect(html).toContain('https://evil.com');
    });

    it('should not show denials section when empty array', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderResultMessage(resultNoDenials);

      expect(html).not.toContain('Permission Denied');
      expect(html).not.toContain('has-denials');
    });

    it('should show help text for granting permissions', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderResultMessage(resultWithDenials);

      expect(html).toContain('settings.local.json');
      expect(html).toContain('/permissions grant');
    });

  });

});
