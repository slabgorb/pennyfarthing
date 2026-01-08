/**
 * E7-2: Message Renderer Tests
 *
 * Tests verify the MessageView component correctly renders SDK messages
 * to replace xterm.js terminal display.
 *
 * Acceptance Criteria:
 * - AC1: Text messages render with markdown formatting
 * - AC2: Tool use blocks show tool name and input
 * - AC3: Tool results display with proper formatting
 * - AC4: Scrolling is smooth, no visual jumping
 * - AC5: Streaming text appears progressively
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  SDKMessage,
  SDKSystemMessage,
  SDKAssistantMessage,
  SDKToolUseMessage,
  SDKToolResultMessage,
  SDKResultMessage,
  SDKErrorMessage,
} from '../src/claude-service.js';

// Sample messages for testing (reused from E7-1 patterns)
const sampleSystemMessage: SDKSystemMessage = {
  type: 'system',
  session_id: 'test-session-abc123',
  model: 'claude-sonnet-4-20250514',
  cwd: '/test/dir',
  tools: ['Read', 'Write', 'Bash'],
};

const sampleAssistantMessage: SDKAssistantMessage = {
  type: 'assistant',
  message: {
    content: [{ type: 'text', text: 'Hello! How can I help you today?' }],
  },
};

const sampleMarkdownMessage: SDKAssistantMessage = {
  type: 'assistant',
  message: {
    content: [{
      type: 'text',
      text: '# Header\n\nThis is **bold** and *italic* text.\n\n```typescript\nconst x = 1;\n```\n\n- List item 1\n- List item 2',
    }],
  },
};

const sampleToolUseMessage: SDKToolUseMessage = {
  type: 'tool_use',
  tool_name: 'Read',
  tool_id: 'tool_123',
  input: { file_path: '/test/file.ts' },
};

const sampleToolResultMessage: SDKToolResultMessage = {
  type: 'tool_result',
  tool_id: 'tool_123',
  output: 'export const hello = "world";',
};

const sampleToolErrorMessage: SDKToolResultMessage = {
  type: 'tool_result',
  tool_id: 'tool_456',
  output: 'Error: File not found',
  is_error: true,
};

const sampleResultMessage: SDKResultMessage = {
  type: 'result',
  usage: {
    input_tokens: 150,
    output_tokens: 25,
  },
  cost_usd: 0.0012,
  duration_ms: 1234,
  session_id: 'test-session-abc123',
};

const sampleErrorMessage: SDKErrorMessage = {
  type: 'error',
  error: 'Connection failed',
  code: 'NETWORK_ERROR',
};

describe('E7-2: Message Renderer', () => {

  describe('Module Structure', () => {

    it('should export MessageView component', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.MessageView).toBeDefined();
    });

    it('should export createMessageView factory function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.createMessageView).toBeDefined();
      expect(typeof messageView.createMessageView).toBe('function');
    });

    it('should export addMessage function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.addMessage).toBeDefined();
      expect(typeof messageView.addMessage).toBe('function');
    });

    it('should export clearMessages function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.clearMessages).toBeDefined();
      expect(typeof messageView.clearMessages).toBe('function');
    });

    it('should export MESSAGE_VIEW_CONTAINER_ID constant', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      // The container ID the message view mounts to
      expect(messageView.MESSAGE_VIEW_CONTAINER_ID).toBeDefined();
      expect(typeof messageView.MESSAGE_VIEW_CONTAINER_ID).toBe('string');
    });

  });

  describe('AC1: Text messages render with markdown formatting', () => {

    it('should export renderTextMessage function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.renderTextMessage).toBeDefined();
      expect(typeof messageView.renderTextMessage).toBe('function');
    });

    it('should export parseMarkdown function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.parseMarkdown).toBeDefined();
      expect(typeof messageView.parseMarkdown).toBe('function');
    });

    it('should convert markdown headers to HTML', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.parseMarkdown('# Header');

      expect(html).toContain('<h1');
      expect(html).toContain('Header');
    });

    it('should convert bold text to HTML', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.parseMarkdown('This is **bold** text');

      expect(html).toContain('<strong>');
      expect(html).toContain('bold');
    });

    it('should convert italic text to HTML', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.parseMarkdown('This is *italic* text');

      expect(html).toContain('<em>');
      expect(html).toContain('italic');
    });

    it('should convert code blocks to HTML with syntax highlighting', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.parseMarkdown('```typescript\nconst x = 1;\n```');

      expect(html).toContain('<pre');
      expect(html).toContain('<code');
      expect(html).toContain('language-typescript');
      // Code should contain keyword highlighting for 'const'
      expect(html).toContain('<span class="keyword">const</span>');
      expect(html).toContain('x =');
      expect(html).toContain('<span class="number">1</span>');
    });

    it('should convert unordered lists to HTML', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.parseMarkdown('- Item 1\n- Item 2');

      expect(html).toContain('<ul');
      expect(html).toContain('<li');
      expect(html).toContain('Item 1');
      expect(html).toContain('Item 2');
    });

    it('should convert ordered lists to HTML', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.parseMarkdown('1. First\n2. Second');

      expect(html).toContain('<ol');
      expect(html).toContain('<li');
      expect(html).toContain('First');
      expect(html).toContain('Second');
    });

    // B-15: Multi-line list items should collapse to single line
    it('should handle ordered list items with inline formatting (B-15)', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      // List item with inline code and bold that might wrap
      const md = '1. Use `npm install` to install **dependencies**\n2. Run `npm start` to begin';
      const html = messageView.parseMarkdown(md);

      expect(html).toContain('<ol');
      expect(html).toContain('<li>');
      expect(html).toContain('<code>npm install</code>');
      expect(html).toContain('<strong>dependencies</strong>');
      expect(html).toContain('<code>npm start</code>');
      // Both items should be in the same ordered list
      expect(html.match(/<ol/g)?.length).toBe(1);
    });

    it('should handle consecutive list items correctly (B-15)', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      // Consecutive list items should all be captured
      const md = '1. First item with `code`\n2. Second item with **bold**\n3. Third item';
      const html = messageView.parseMarkdown(md);

      expect(html).toContain('<ol');
      expect(html).toContain('<code>code</code>');
      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('Third item');
      // All three items should be in the same ordered list
      expect(html.match(/<li>/g)?.length).toBe(3);
    });

    it('should collapse multi-line list items into single items (B-15)', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      // Multi-line list item with indented continuation
      const md = '1. First line of item\n   continues here\n   and here\n2. Second item';
      const html = messageView.parseMarkdown(md);

      expect(html).toContain('<ol');
      // Continuation should be joined with spaces
      expect(html).toContain('First line of item continues here and here');
      expect(html).toContain('Second item');
      // Should only have 2 list items
      expect(html.match(/<li>/g)?.length).toBe(2);
    });

    it('should render SDKAssistantMessage text content', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderTextMessage(sampleAssistantMessage);

      expect(html).toContain('Hello! How can I help you today?');
    });

    it('should render SDKAssistantMessage with full markdown', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderTextMessage(sampleMarkdownMessage);

      expect(html).toContain('<h1');
      expect(html).toContain('<strong>');
      expect(html).toContain('<em>');
      expect(html).toContain('<pre');
      expect(html).toContain('<ul');
    });

  });

  describe('AC2: Tool use blocks show tool name and input', () => {

    it('should export renderToolUseMessage function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.renderToolUseMessage).toBeDefined();
      expect(typeof messageView.renderToolUseMessage).toBe('function');
    });

    it('should display tool name prominently', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderToolUseMessage(sampleToolUseMessage);

      expect(html).toContain('Read');
      // Should have some kind of tool indicator class or element
      expect(html).toMatch(/class="[^"]*tool[^"]*"/i);
    });

    it('should display tool input as formatted JSON', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderToolUseMessage(sampleToolUseMessage);

      expect(html).toContain('file_path');
      expect(html).toContain('/test/file.ts');
    });

    it('should include tool_id for correlation', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderToolUseMessage(sampleToolUseMessage);

      // Tool ID should be present (for linking to results)
      expect(html).toContain('tool_123');
    });

    it('should export isToolUseCollapsible function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.isToolUseCollapsible).toBeDefined();
      expect(typeof messageView.isToolUseCollapsible).toBe('function');
    });

    it('should make tool blocks collapsible by default', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const isCollapsible = messageView.isToolUseCollapsible(sampleToolUseMessage);

      expect(isCollapsible).toBe(true);
    });

  });

  describe('AC3: Tool results display with proper formatting', () => {

    it('should export renderToolResultMessage function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.renderToolResultMessage).toBeDefined();
      expect(typeof messageView.renderToolResultMessage).toBe('function');
    });

    it('should display tool result output', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderToolResultMessage(sampleToolResultMessage);

      expect(html).toContain('export const hello');
    });

    it('should apply syntax highlighting to code output', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderToolResultMessage(sampleToolResultMessage);

      // Should have code-related class for styling
      expect(html).toMatch(/<(pre|code)/);
    });

    it('should indicate error state for tool errors', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderToolResultMessage(sampleToolErrorMessage);

      // Should have error indicator
      expect(html).toMatch(/class="[^"]*error[^"]*"/i);
      expect(html).toContain('Error: File not found');
    });

    it('should link tool result to corresponding tool use via tool_id', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderToolResultMessage(sampleToolResultMessage);

      expect(html).toContain('tool_123');
    });

    it('should make long tool results collapsible', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const longOutput: SDKToolResultMessage = {
        type: 'tool_result',
        tool_id: 'tool_789',
        output: 'A'.repeat(1000), // Long output
      };

      const html = messageView.renderToolResultMessage(longOutput);

      // Should have collapse/expand capability
      expect(html).toMatch(/collaps/i);
    });

  });

  describe('AC4: Scrolling is smooth, no visual jumping', () => {

    it('should export scrollToBottom function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.scrollToBottom).toBeDefined();
      expect(typeof messageView.scrollToBottom).toBe('function');
    });

    it('should export isUserScrolledUp function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.isUserScrolledUp).toBeDefined();
      expect(typeof messageView.isUserScrolledUp).toBe('function');
    });

    it('should export setAutoScroll function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.setAutoScroll).toBeDefined();
      expect(typeof messageView.setAutoScroll).toBe('function');
    });

    it('should export getAutoScroll function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.getAutoScroll).toBeDefined();
      expect(typeof messageView.getAutoScroll).toBe('function');
    });

    it('should enable auto-scroll by default', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const autoScroll = messageView.getAutoScroll();

      expect(autoScroll).toBe(true);
    });

    it('should allow disabling auto-scroll', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      messageView.setAutoScroll(false);
      const autoScroll = messageView.getAutoScroll();

      expect(autoScroll).toBe(false);
    });

    it('should export SCROLL_THRESHOLD constant', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      // Threshold for detecting if user has scrolled up
      expect(messageView.SCROLL_THRESHOLD).toBeDefined();
      expect(typeof messageView.SCROLL_THRESHOLD).toBe('number');
      expect(messageView.SCROLL_THRESHOLD).toBeGreaterThan(0);
    });

  });

  describe('AC5: Streaming text appears progressively', () => {

    it('should export updateStreamingMessage function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.updateStreamingMessage).toBeDefined();
      expect(typeof messageView.updateStreamingMessage).toBe('function');
    });

    it('should export startStreamingMessage function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.startStreamingMessage).toBeDefined();
      expect(typeof messageView.startStreamingMessage).toBe('function');
    });

    it('should export endStreamingMessage function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.endStreamingMessage).toBeDefined();
      expect(typeof messageView.endStreamingMessage).toBe('function');
    });

    it('should export getStreamingState function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.getStreamingState).toBeDefined();
      expect(typeof messageView.getStreamingState).toBe('function');
    });

    it('should return streaming state object with isStreaming property', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const state = messageView.getStreamingState();

      expect(state).toHaveProperty('isStreaming');
      expect(typeof state.isStreaming).toBe('boolean');
    });

    it('should return streaming state with currentText property', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const state = messageView.getStreamingState();

      expect(state).toHaveProperty('currentText');
      expect(typeof state.currentText).toBe('string');
    });

  });

  describe('Message type rendering dispatch', () => {

    it('should export renderMessage function that handles all types', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.renderMessage).toBeDefined();
      expect(typeof messageView.renderMessage).toBe('function');
    });

    it('should render system messages', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderMessage(sampleSystemMessage);

      expect(html).toContain('claude-sonnet');
      expect(html).toContain('test-session-abc123');
    });

    it('should render assistant messages', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderMessage(sampleAssistantMessage);

      expect(html).toContain('Hello! How can I help you today?');
    });

    it('should render tool_use messages', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderMessage(sampleToolUseMessage);

      expect(html).toContain('Read');
    });

    it('should render tool_result messages', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderMessage(sampleToolResultMessage);

      expect(html).toContain('export const hello');
    });

    it('should render result messages (session end)', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderMessage(sampleResultMessage);

      // Should show usage stats
      expect(html).toContain('150'); // input tokens
      expect(html).toContain('25');  // output tokens
    });

    it('should render error messages with error styling', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      const html = messageView.renderMessage(sampleErrorMessage);

      expect(html).toContain('Connection failed');
      expect(html).toMatch(/class="[^"]*error[^"]*"/i);
    });

  });

  describe('Theme integration', () => {

    it('should export applyTheme function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.applyTheme).toBeDefined();
      expect(typeof messageView.applyTheme).toBe('function');
    });

    it('should export THEME_CLASSES constant', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.THEME_CLASSES).toBeDefined();
      expect(messageView.THEME_CLASSES.dark).toBeDefined();
      expect(messageView.THEME_CLASSES.light).toBeDefined();
    });

  });

  describe('Message store integration', () => {

    it('should export message-store module', async () => {
      const messageStore = await import('../src/public/js/message-store.js');

      expect(messageStore).toBeDefined();
    });

    it('should export getMessages function', async () => {
      const messageStore = await import('../src/public/js/message-store.js');

      expect(messageStore.getMessages).toBeDefined();
      expect(typeof messageStore.getMessages).toBe('function');
    });

    it('should export addMessage function', async () => {
      const messageStore = await import('../src/public/js/message-store.js');

      expect(messageStore.addMessage).toBeDefined();
      expect(typeof messageStore.addMessage).toBe('function');
    });

    it('should export clearMessages function', async () => {
      const messageStore = await import('../src/public/js/message-store.js');

      expect(messageStore.clearMessages).toBeDefined();
      expect(typeof messageStore.clearMessages).toBe('function');
    });

    it('should export subscribeToMessages function', async () => {
      const messageStore = await import('../src/public/js/message-store.js');

      expect(messageStore.subscribeToMessages).toBeDefined();
      expect(typeof messageStore.subscribeToMessages).toBe('function');
    });

  });

});
