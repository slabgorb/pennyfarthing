/**
 * 22-1: Tool Activity Bar Component Tests
 *
 * These tests verify the acceptance criteria for the Tool Activity Bar,
 * a prominent sticky component that shows currently executing tools.
 * Written in RED phase - tests should fail until Dev implements the functionality.
 *
 * Acceptance Criteria:
 * - AC1: Activity bar appears when tool execution starts
 * - AC2: Shows tool name and primary parameter (file, command, pattern)
 * - AC3: Elapsed time updates in real-time
 * - AC4: Bar disappears gracefully when tool completes
 * - AC5: Works in both Electron and web modes
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

// SDK message types matching claude-service.ts
interface SDKToolUseMessage {
  type: 'tool_use';
  tool_name: string;
  tool_id: string;
  input: {
    command?: string;
    file_path?: string;
    pattern?: string;
    description?: string;
    query?: string;
    url?: string;
  };
}

interface SDKToolResultMessage {
  type: 'tool_result';
  tool_id: string;
  output: string;
  is_error?: boolean;
}

// Factory functions for test data
const createToolUseMessage = (overrides: Partial<SDKToolUseMessage> = {}): SDKToolUseMessage => ({
  type: 'tool_use',
  tool_name: 'Bash',
  tool_id: `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  input: { command: 'npm install' },
  ...overrides,
});

const createToolResultMessage = (toolId: string, overrides: Partial<Omit<SDKToolResultMessage, 'tool_id'>> = {}): SDKToolResultMessage => ({
  type: 'tool_result',
  tool_id: toolId,
  output: 'Command completed successfully',
  ...overrides,
});

describe('22-1: Tool Activity Bar Component', () => {
  let html: string;
  let document: Document;
  let css: string;

  beforeAll(async () => {
    // Fetch HTML
    const htmlResponse = await request(app).get('/');
    html = htmlResponse.text;

    // Parse HTML with happy-dom
    const window = new Window();
    window.document.write(html);
    document = window.document;

    // Fetch CSS
    const cssResponse = await request(app).get('/styles.css');
    css = cssResponse.text;
  });

  describe('AC1: Activity bar appears when tool execution starts', () => {

    it('should have tool-activity-bar container element in HTML', () => {
      const activityBar = document.querySelector('#tool-activity-bar');
      expect(activityBar).not.toBeNull();
    });

    it('should have tool-activity-bar positioned at bottom of message view', () => {
      // Activity bar should be inside or adjacent to main content area
      const mainContent = document.querySelector('#message-view, #main-content, .message-container');
      expect(mainContent).not.toBeNull();
      // Activity bar should exist in DOM
      const activityBar = document.querySelector('#tool-activity-bar');
      expect(activityBar).not.toBeNull();
    });

    it('should include ToolActivityBar.js script in HTML', () => {
      expect(html).toContain('ToolActivityBar.js');
    });

    it('should have hidden state by default (no active tool)', () => {
      const activityBar = document.querySelector('#tool-activity-bar');
      // Should have hidden class or aria-hidden by default
      const isHidden = activityBar?.classList.contains('hidden') ||
                       activityBar?.getAttribute('aria-hidden') === 'true' ||
                       activityBar?.hasAttribute('hidden');
      expect(isHidden).toBe(true);
    });

    it('should have status indicator element', () => {
      const statusIndicator = document.querySelector('#tool-activity-bar .tool-status-indicator');
      expect(statusIndicator).not.toBeNull();
    });

    it('should have CSS for activity bar visibility transitions', () => {
      // Should have transition or animation for appear/disappear
      expect(css).toMatch(/#tool-activity-bar[^}]*(transition|animation)/);
    });

  });

  describe('AC2: Shows tool name and primary parameter (file, command, pattern)', () => {

    it('should have tool-icon element for displaying tool icon', () => {
      const toolIcon = document.querySelector('#tool-activity-bar .tool-icon');
      expect(toolIcon).not.toBeNull();
    });

    it('should have tool-name element for displaying tool name', () => {
      const toolName = document.querySelector('#tool-activity-bar .tool-name');
      expect(toolName).not.toBeNull();
    });

    it('should have tool-param element for displaying primary parameter', () => {
      const toolParam = document.querySelector('#tool-activity-bar .tool-param');
      expect(toolParam).not.toBeNull();
    });

    it('should export extractPrimaryParam function from ToolActivityBar.js', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.extractPrimaryParam).toBeDefined();
      expect(typeof activityBar.extractPrimaryParam).toBe('function');
    });

    it('should extract command from Bash tool input', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      const message = createToolUseMessage({
        tool_name: 'Bash',
        input: { command: 'npm install --save-dev vitest' },
      });
      const param = activityBar.extractPrimaryParam(message);
      expect(param).toContain('npm');
    });

    it('should extract file_path from Read tool input', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      const message = createToolUseMessage({
        tool_name: 'Read',
        input: { file_path: '/Users/test/project/src/app.js' },
      });
      const param = activityBar.extractPrimaryParam(message);
      expect(param).toContain('app.js');
    });

    it('should extract pattern from Grep tool input', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      const message = createToolUseMessage({
        tool_name: 'Grep',
        input: { pattern: 'TODO|FIXME' },
      });
      const param = activityBar.extractPrimaryParam(message);
      expect(param).toContain('TODO');
    });

    it('should extract description from Task tool input', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      const message = createToolUseMessage({
        tool_name: 'Task',
        input: { description: 'Search for tests' },
      });
      const param = activityBar.extractPrimaryParam(message);
      expect(param).toContain('Search');
    });

    it('should truncate long parameters with ellipsis', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      const longCommand = 'npm install --save-dev @types/node @types/react @types/react-dom typescript eslint prettier';
      const message = createToolUseMessage({
        tool_name: 'Bash',
        input: { command: longCommand },
      });
      const param = activityBar.extractPrimaryParam(message);
      // Should be truncated (less than original) and end with ellipsis
      expect(param.length).toBeLessThan(longCommand.length);
      expect(param).toMatch(/…$/);
    });

  });

  describe('AC3: Elapsed time updates in real-time', () => {

    it('should have elapsed-time element for displaying timer', () => {
      const elapsedTime = document.querySelector('#tool-activity-bar .elapsed-time');
      expect(elapsedTime).not.toBeNull();
    });

    it('should export startTimer function from ToolActivityBar.js', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.startTimer).toBeDefined();
      expect(typeof activityBar.startTimer).toBe('function');
    });

    it('should export stopTimer function from ToolActivityBar.js', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.stopTimer).toBeDefined();
      expect(typeof activityBar.stopTimer).toBe('function');
    });

    it('should format elapsed time as seconds (e.g., "1.2s")', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.formatElapsedTime).toBeDefined();
      const formatted = activityBar.formatElapsedTime(1234); // 1.234 seconds in ms
      expect(formatted).toMatch(/\d+\.\d+s/);
    });

    it('should update elapsed time display at regular intervals', async () => {
      vi.useFakeTimers();

      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      const toolId = 'test-tool-123';

      // Start timer
      activityBar.startTimer(toolId);

      // Advance time by 1 second
      vi.advanceTimersByTime(1000);

      // Get current elapsed time
      const elapsed = activityBar.getElapsedTime(toolId);
      expect(elapsed).toBeGreaterThanOrEqual(1000);

      // Stop timer
      activityBar.stopTimer(toolId);

      vi.useRealTimers();
    });

    it('should track multiple concurrent tools by tool_id', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');

      const toolId1 = 'tool-1';
      const toolId2 = 'tool-2';

      // Start both timers
      activityBar.startTimer(toolId1);
      activityBar.startTimer(toolId2);

      // Both should be tracking
      expect(activityBar.isToolActive(toolId1)).toBe(true);
      expect(activityBar.isToolActive(toolId2)).toBe(true);

      // Stop first, second should still be active
      activityBar.stopTimer(toolId1);
      expect(activityBar.isToolActive(toolId1)).toBe(false);
      expect(activityBar.isToolActive(toolId2)).toBe(true);

      activityBar.stopTimer(toolId2);
    });

  });

  describe('AC4: Bar disappears gracefully when tool completes', () => {

    beforeEach(async () => {
      // Reset module state and ensure DOM element exists for each test
      // Clear any existing element
      const existing = globalThis.document?.getElementById('tool-activity-bar');
      if (existing) {
        existing.remove();
      }
      
      // Create activity bar element with all required child elements
      const activityBar = globalThis.document.createElement('div');
      activityBar.id = 'tool-activity-bar';
      activityBar.className = 'hidden';
      activityBar.setAttribute('aria-hidden', 'true');
      
      // Create child elements that the component expects
      const statusIndicator = globalThis.document.createElement('div');
      statusIndicator.className = 'tool-status-indicator';
      activityBar.appendChild(statusIndicator);
      
      const toolIcon = globalThis.document.createElement('span');
      toolIcon.className = 'tool-icon';
      activityBar.appendChild(toolIcon);
      
      const toolName = globalThis.document.createElement('span');
      toolName.className = 'tool-name';
      activityBar.appendChild(toolName);
      
      const toolParam = globalThis.document.createElement('span');
      toolParam.className = 'tool-param';
      activityBar.appendChild(toolParam);
      
      const elapsedTime = globalThis.document.createElement('span');
      elapsedTime.className = 'elapsed-time';
      activityBar.appendChild(elapsedTime);
      
      globalThis.document.body.appendChild(activityBar);
      
      // Clear module cache to reset singleton state
      vi.resetModules();
    });


    it('should export showActivityBar function', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.showActivityBar).toBeDefined();
      expect(typeof activityBar.showActivityBar).toBe('function');
    });

    it('should export hideActivityBar function', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.hideActivityBar).toBeDefined();
      expect(typeof activityBar.hideActivityBar).toBe('function');
    });

    it('should have CSS transition for hide animation', () => {
      // Look for fade-out, slide, or opacity transition
      expect(css).toMatch(/#tool-activity-bar[^}]*(opacity|transform|visibility)[^}]*transition/);
    });

    it('should export handleToolUse function for processing tool_use messages', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.handleToolUse).toBeDefined();
      expect(typeof activityBar.handleToolUse).toBe('function');
    });

    it('should export handleToolResult function for processing tool_result messages', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.handleToolResult).toBeDefined();
      expect(typeof activityBar.handleToolResult).toBe('function');
    });

    it('should correlate tool_result with tool_use by tool_id', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');

      const toolId = 'test-correlation-123';
      const toolUse = createToolUseMessage({ tool_id: toolId });
      const toolResult = createToolResultMessage(toolId);

      // Handle tool_use - should start tracking
      activityBar.handleToolUse(toolUse);
      expect(activityBar.isToolActive(toolId)).toBe(true);

      // Handle tool_result - should stop tracking
      activityBar.handleToolResult(toolResult);
      expect(activityBar.isToolActive(toolId)).toBe(false);
    });

    it('should hide bar after brief delay when last tool completes', async () => {
      vi.useFakeTimers();

      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');

      const toolId = 'test-hide-123';
      const toolUse = createToolUseMessage({ tool_id: toolId });
      const toolResult = createToolResultMessage(toolId);

      activityBar.handleToolUse(toolUse);
      activityBar.handleToolResult(toolResult);

      // Bar should still be visible immediately (for fade-out)
      expect(activityBar.isBarVisible()).toBe(true);

      // After delay, bar should be hidden
      vi.advanceTimersByTime(500);
      expect(activityBar.isBarVisible()).toBe(false);

      vi.useRealTimers();
    });

  });

  describe('AC5: Works in both Electron and web modes', () => {

    it('should export initToolActivityBar function', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.initToolActivityBar).toBeDefined();
      expect(typeof activityBar.initToolActivityBar).toBe('function');
    });

    it('should detect Electron environment via window.electronAPI', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.isElectronEnvironment).toBeDefined();
      expect(typeof activityBar.isElectronEnvironment).toBe('function');
    });

    it('should subscribe to IPC messages in Electron mode', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      // Should have a method to subscribe to IPC
      expect(activityBar.subscribeToMessages).toBeDefined();
      expect(typeof activityBar.subscribeToMessages).toBe('function');
    });

    it('should support manual message injection for web mode', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      // Should be able to manually inject messages (for web adapter)
      expect(activityBar.handleMessage).toBeDefined();
      expect(typeof activityBar.handleMessage).toBe('function');
    });

    it('should gracefully handle missing electronAPI', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');

      // Should not throw when electronAPI is missing
      expect(() => {
        activityBar.initToolActivityBar();
      }).not.toThrow();
    });

  });

  describe('Component CSS Styling', () => {

    it('should have CSS for #tool-activity-bar container', () => {
      expect(css).toMatch(/#tool-activity-bar\s*\{/);
    });

    it('should use sticky or fixed positioning', () => {
      expect(css).toMatch(/#tool-activity-bar[^}]*(position:\s*(sticky|fixed))/);
    });

    it('should have CSS for .tool-icon styling', () => {
      expect(css).toMatch(/\.tool-icon\s*\{|#tool-activity-bar[^}]*\.tool-icon/);
    });

    it('should have CSS for .tool-name styling', () => {
      expect(css).toMatch(/\.tool-name\s*\{|#tool-activity-bar[^}]*\.tool-name/);
    });

    it('should have CSS for .tool-param styling', () => {
      expect(css).toMatch(/\.tool-param\s*\{|#tool-activity-bar[^}]*\.tool-param/);
    });

    it('should have CSS for .elapsed-time styling with monospace font', () => {
      expect(css).toMatch(/\.elapsed-time[^}]*font-family[^}]*mono/);
    });

    it('should have CSS for hidden state', () => {
      expect(css).toMatch(/#tool-activity-bar\.hidden|#tool-activity-bar\[hidden\]/);
    });

    it('should use dark theme colors matching the application', () => {
      // Should use CSS variables or dark colors
      expect(css).toMatch(/#tool-activity-bar[^}]*(var\(--|background|#[0-9a-fA-F]{3,6})/);
    });

    it('should have z-index to appear above message content', () => {
      expect(css).toMatch(/#tool-activity-bar[^}]*z-index/);
    });

  });

  describe('Tool Icon Mapping', () => {

    it('should export TOOL_ICONS constant', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.TOOL_ICONS).toBeDefined();
      expect(typeof activityBar.TOOL_ICONS).toBe('object');
    });

    it('should have icon for Bash tool', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.TOOL_ICONS.Bash).toBeDefined();
    });

    it('should have icon for Read tool', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.TOOL_ICONS.Read).toBeDefined();
    });

    it('should have icon for Write tool', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.TOOL_ICONS.Write).toBeDefined();
    });

    it('should have icon for Edit tool', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.TOOL_ICONS.Edit).toBeDefined();
    });

    it('should have icon for Task tool', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.TOOL_ICONS.Task).toBeDefined();
    });

    it('should have default icon for unknown tools', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.TOOL_ICONS.default).toBeDefined();
    });

    it('should export getToolIcon function', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.getToolIcon).toBeDefined();
      expect(typeof activityBar.getToolIcon).toBe('function');
    });

    it('should return default icon for unknown tool', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      const icon = activityBar.getToolIcon('UnknownTool');
      expect(icon).toBe(activityBar.TOOL_ICONS.default);
    });

  });

});
