/**
 * 22-2: Abort Button for Running Operations
 *
 * Tests for integrating abort functionality with the Tool Activity Bar.
 * Uses EXISTING stop button (#stop-btn) - no new button element needed.
 *
 * Written in RED phase - tests should fail until Dev implements functionality.
 *
 * Acceptance Criteria:
 * - AC1: Activity bar coordinates with existing stop button during tool execution
 * - AC2: Clicking stop button calls `window.electronAPI.claude.abort()` (already works)
 * - AC3: Escape key triggers abort when stop button enabled (already works)
 * - AC4: Visual feedback shown when abort is triggered (state change in activity bar)
 * - AC5: Activity bar hides gracefully after abort completes
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
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
  };
}

// Factory function for test data
const createToolUseMessage = (overrides: Partial<SDKToolUseMessage> = {}): SDKToolUseMessage => ({
  type: 'tool_use',
  tool_name: 'Bash',
  tool_id: `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  input: { command: 'npm install' },
  ...overrides,
});

describe('22-2: Abort Button for Running Operations', () => {
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

  describe('AC1: Existing stop button works during tool execution', () => {

    it('should have existing stop-btn element in HTML', () => {
      const stopBtn = document.querySelector('#stop-btn');
      expect(stopBtn).not.toBeNull();
    });

    it('should have stop button with title indicating Esc shortcut', () => {
      const stopBtn = document.querySelector('#stop-btn');
      expect(stopBtn?.getAttribute('title')).toMatch(/esc/i);
    });

  });

  describe('AC4: Visual feedback shown when abort is triggered', () => {

    beforeEach(async () => {
      // Reset module state and ensure DOM element exists
      const existing = globalThis.document?.getElementById('tool-activity-bar');
      if (existing) existing.remove();

      // Create activity bar element
      const activityBar = globalThis.document.createElement('div');
      activityBar.id = 'tool-activity-bar';
      activityBar.className = '';
      activityBar.setAttribute('aria-hidden', 'false');

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

      vi.resetModules();
    });

    it('should export handleAbort function from ToolActivityBar.js', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.handleAbort).toBeDefined();
      expect(typeof activityBar.handleAbort).toBe('function');
    });

    it('should export isAborting function from ToolActivityBar.js', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');
      expect(activityBar.isAborting).toBeDefined();
      expect(typeof activityBar.isAborting).toBe('function');
    });

    it('should add "aborting" class to activity bar when handleAbort called', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');

      // Start a tool first
      const toolUse = createToolUseMessage({ tool_id: 'test-abort-1' });
      activityBar.handleToolUse(toolUse);

      // Trigger abort
      activityBar.handleAbort();

      const bar = globalThis.document.getElementById('tool-activity-bar');
      expect(bar?.classList.contains('aborting')).toBe(true);
    });

    it('should set isAborting to true when handleAbort called', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');

      const toolUse = createToolUseMessage({ tool_id: 'test-abort-2' });
      activityBar.handleToolUse(toolUse);

      expect(activityBar.isAborting()).toBe(false);
      activityBar.handleAbort();
      expect(activityBar.isAborting()).toBe(true);
    });

    it('should update tool-name to show "Aborting..." text', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');

      const toolUse = createToolUseMessage({ tool_id: 'test-abort-3', tool_name: 'Bash' });
      activityBar.handleToolUse(toolUse);

      activityBar.handleAbort();

      const toolNameEl = globalThis.document.querySelector('.tool-name');
      expect(toolNameEl?.textContent).toMatch(/abort/i);
    });

    it('should have CSS for .aborting state visual change', () => {
      expect(css).toMatch(/#tool-activity-bar\.aborting/);
    });

  });

  describe('AC5: Activity bar hides gracefully after abort completes', () => {

    beforeEach(async () => {
      const existing = globalThis.document?.getElementById('tool-activity-bar');
      if (existing) existing.remove();

      const activityBar = globalThis.document.createElement('div');
      activityBar.id = 'tool-activity-bar';
      activityBar.className = '';
      activityBar.setAttribute('aria-hidden', 'false');

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

      vi.resetModules();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should hide activity bar after abort with delay', async () => {
      vi.useFakeTimers();

      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');

      // Start a tool
      const toolUse = createToolUseMessage({ tool_id: 'test-hide-1' });
      activityBar.handleToolUse(toolUse);
      expect(activityBar.isBarVisible()).toBe(true);

      // Trigger abort
      activityBar.handleAbort();

      // Bar should still be visible immediately (showing "Aborting...")
      expect(activityBar.isBarVisible()).toBe(true);
      expect(activityBar.isAborting()).toBe(true);

      // After delay, bar should hide
      vi.advanceTimersByTime(1000);
      expect(activityBar.isBarVisible()).toBe(false);
    });

    it('should stop all active tool timers when abort triggered', async () => {
      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');

      // Start multiple tools
      const tool1 = createToolUseMessage({ tool_id: 'tool-1' });
      const tool2 = createToolUseMessage({ tool_id: 'tool-2' });
      activityBar.handleToolUse(tool1);
      activityBar.handleToolUse(tool2);

      expect(activityBar.isToolActive('tool-1')).toBe(true);
      expect(activityBar.isToolActive('tool-2')).toBe(true);

      // Trigger abort
      activityBar.handleAbort();

      // All tools should be stopped
      expect(activityBar.isToolActive('tool-1')).toBe(false);
      expect(activityBar.isToolActive('tool-2')).toBe(false);
    });

    it('should reset aborting state after bar hides', async () => {
      vi.useFakeTimers();

      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');

      const toolUse = createToolUseMessage({ tool_id: 'test-reset' });
      activityBar.handleToolUse(toolUse);

      activityBar.handleAbort();
      expect(activityBar.isAborting()).toBe(true);

      // After hide delay
      vi.advanceTimersByTime(1000);
      expect(activityBar.isAborting()).toBe(false);
    });

    it('should remove aborting class from activity bar after reset', async () => {
      vi.useFakeTimers();

      const activityBar = await import('../src/public/js/components/ToolActivityBar.js');

      const toolUse = createToolUseMessage({ tool_id: 'test-class-reset' });
      activityBar.handleToolUse(toolUse);

      activityBar.handleAbort();

      const bar = globalThis.document.getElementById('tool-activity-bar');
      expect(bar?.classList.contains('aborting')).toBe(true);

      vi.advanceTimersByTime(1000);
      expect(bar?.classList.contains('aborting')).toBe(false);
    });

  });

  describe('CSS Styling for Aborting State', () => {

    it('should have CSS for #tool-activity-bar.aborting state', () => {
      expect(css).toMatch(/#tool-activity-bar\.aborting\s*\{/);
    });

    it('should have distinct visual styling for aborting state', () => {
      // Should change appearance (color, border, etc.)
      expect(css).toMatch(/#tool-activity-bar\.aborting[^}]*(background|border|color)/);
    });

  });

});
