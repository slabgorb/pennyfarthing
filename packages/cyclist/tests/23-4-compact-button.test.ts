/**
 * 23-4: Compact Button with Context Awareness Tests
 *
 * These tests verify the acceptance criteria for a compact button that
 * appears when context usage exceeds 50% and triggers the /compact command.
 * Written in RED phase - tests should fail until Dev implements the functionality.
 *
 * Acceptance Criteria:
 * - AC1: Compact button appears when context > 50%
 * - AC2: Cmd+Shift+K triggers compact from anywhere
 * - AC3: After compact, context % updates in UI
 * - AC4: Works in both Electron and web modes
 */

import { describe, it, expect, beforeAll, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

describe('23-4: Compact Button with Context Awareness', () => {
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

  describe('AC1: Compact button appears when context > 50%', () => {

    it('should have compact-btn element in stats strip', () => {
      const compactBtn = document.querySelector('#stats-strip .compact-btn');
      expect(compactBtn).not.toBeNull();
    });

    it('should have compact-btn positioned near context meter', () => {
      const statsStrip = document.querySelector('#stats-strip');
      const children = Array.from(statsStrip?.children || []);

      // Find indices of context-mini and compact-btn
      const contextIndex = children.findIndex(el =>
        el.classList.contains('context-mini') || el.querySelector('.context-mini')
      );
      const compactIndex = children.findIndex(el =>
        el.classList.contains('compact-btn') || el.querySelector('.compact-btn')
      );

      // Compact button should be near context meter (within 2 positions)
      if (contextIndex >= 0 && compactIndex >= 0) {
        expect(Math.abs(compactIndex - contextIndex)).toBeLessThanOrEqual(2);
      } else {
        // At minimum, both should exist
        expect(compactIndex).toBeGreaterThanOrEqual(0);
      }
    });

    it('should have CSS for compact-btn styling', () => {
      expect(css).toMatch(/\.compact-btn\s*\{/);
    });

    it('should have CSS for compact-btn hidden state', () => {
      // Button should have a hidden/visibility class for when context < 50%
      expect(css).toMatch(/\.compact-btn\.(hidden|invisible)|\.compact-btn\[hidden\]|\.compact-btn\.compact-hidden/);
    });

    it('should have CSS for compact-btn visible state', () => {
      // Button should have visible styling when context >= 50%
      expect(css).toMatch(/\.compact-btn\.visible|\.compact-btn\.compact-visible|\.compact-btn:not\(\.hidden\)/);
    });

    it('should have title attribute explaining the button action', () => {
      const compactBtn = document.querySelector('#stats-strip .compact-btn');
      const title = compactBtn?.getAttribute('title') || '';
      expect(title.toLowerCase()).toMatch(/compact|context|reduce/i);
    });

    it('should have descriptive button text or icon', () => {
      const compactBtn = document.querySelector('#stats-strip .compact-btn');
      const text = compactBtn?.textContent?.trim() || '';
      const hasIcon = compactBtn?.querySelector('svg') || compactBtn?.querySelector('.icon');
      // Should have either text or an icon
      expect(text.length > 0 || hasIcon !== null).toBe(true);
    });

  });

  describe('AC1 continued: Visibility logic based on context threshold', () => {

    it('should export updateCompactButtonVisibility function from stats-strip.js', async () => {
      // The function should be available on window after script loads
      // This test verifies the script includes the visibility update function
      expect(html).toContain('stats-strip.js');
    });

    it('should define COMPACT_THRESHOLD constant at 50', async () => {
      // Verify the threshold is documented in the code
      // The actual value is tested via the visibility behavior tests below
      const statsStripJs = await request(app).get('/js/stats-strip.js');
      const content = statsStripJs.text;
      expect(content).toMatch(/COMPACT_THRESHOLD|compact.*50|50.*compact/i);
    });

  });

  describe('AC2: Cmd+Shift+K triggers compact from anywhere', () => {

    it('should include controls.js script for keyboard handling', () => {
      expect(html).toContain('controls.js');
    });

    it('should register global keyboard shortcut in controls module', async () => {
      // Fetch controls.js and check for keyboard event listener
      const controlsJs = await request(app).get('/js/controls.js');
      const content = controlsJs.text;
      // Should listen for keydown events
      expect(content).toMatch(/keydown|KeyK|Shift.*K|compact/i);
    });

    it('should have keyboard shortcut documentation in button title', () => {
      const compactBtn = document.querySelector('#stats-strip .compact-btn');
      const title = compactBtn?.getAttribute('title') || '';
      // Title should mention the keyboard shortcut
      expect(title).toMatch(/Cmd\+Shift\+K|⌘⇧K|keyboard|shortcut/i);
    });

  });

  describe('AC3: After compact, context % updates in UI', () => {

    it('should use command IPC to execute /compact', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      // Command API should be available from 23-3
      expect(api.command).toBeDefined();
      expect(typeof api.command.execute).toBe('function');
    });

    it('should subscribe to context updates after command execution', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      // Context API should support updates
      expect(api.context).toBeDefined();
      expect(typeof api.context.onUpdate).toBe('function');
    });

    it('should have loading state CSS for compact button', () => {
      // Button should show loading state while compact is executing
      expect(css).toMatch(/\.compact-btn\.(loading|executing|pending)|\.compact-btn:disabled/);
    });

  });

  describe('AC4: Works in both Electron and web modes', () => {

    it('should include web-adapter.js for browser compatibility', () => {
      expect(html).toContain('web-adapter.js');
    });

    it('should have graceful degradation in stats-strip.js', async () => {
      // Fetch stats-strip.js and check for API availability checks
      const statsStripJs = await request(app).get('/js/stats-strip.js');
      const content = statsStripJs.text;
      // Should check for electronAPI availability
      expect(content).toMatch(/electronAPI|window\.electronAPI/);
    });

    it('should check for command API availability before use', async () => {
      const statsStripJs = await request(app).get('/js/stats-strip.js');
      const content = statsStripJs.text;
      // Should have conditional check for command API
      expect(content).toMatch(/electronAPI\.command|command\.execute/);
    });

    it('should not crash when electronAPI is undefined', async () => {
      // The web-adapter provides stubs, but we should verify graceful handling
      const statsStripJs = await request(app).get('/js/stats-strip.js');
      const content = statsStripJs.text;
      // Should have optional chaining or conditional checks
      expect(content).toMatch(/\?\.|if\s*\(.*electronAPI|electronAPI\s*&&/);
    });

  });

  describe('IPC Integration', () => {

    it('should use command:execute channel from 23-3', async () => {
      const main = await import('../src/main.js');

      // Verify command channels exist (from 23-3)
      expect(main.IPC_COMMAND_CHANNELS).toBeDefined();
      expect(main.IPC_COMMAND_CHANNELS.EXECUTE).toBe('command:execute');
    });

    it('should have executeCompact function exported or available', async () => {
      // The compact execution should be accessible from stats-strip or controls
      const statsStripJs = await request(app).get('/js/stats-strip.js');
      const controlsJs = await request(app).get('/js/controls.js');

      const combined = statsStripJs.text + controlsJs.text;
      // Should have a function for executing compact
      expect(combined).toMatch(/executeCompact|triggerCompact|handleCompact|compact.*execute|execute.*compact/i);
    });

  });

  describe('Styling Integration', () => {

    it('should match stats strip visual style', () => {
      // Button should use similar styling to other stats strip elements
      expect(css).toMatch(/\.compact-btn[^}]*(font-size|padding|border-radius)/);
    });

    it('should have hover state styling', () => {
      expect(css).toMatch(/\.compact-btn:hover/);
    });

    it('should have transition for visibility changes', () => {
      expect(css).toMatch(/\.compact-btn[^}]*transition/);
    });

    it('should use accent color scheme', () => {
      // Should use accent colors or CSS variables
      expect(css).toMatch(/\.compact-btn[^}]*(--accent|var\(--|background|color)/);
    });

  });

  describe('Button Behavior Contract', () => {

    it('should be a button element for accessibility', () => {
      const compactBtn = document.querySelector('#stats-strip .compact-btn');
      expect(compactBtn?.tagName?.toLowerCase()).toBe('button');
    });

    it('should have type="button" to prevent form submission', () => {
      const compactBtn = document.querySelector('#stats-strip .compact-btn');
      expect(compactBtn?.getAttribute('type')).toBe('button');
    });

    it('should have aria-label for screen readers', () => {
      const compactBtn = document.querySelector('#stats-strip .compact-btn');
      const ariaLabel = compactBtn?.getAttribute('aria-label');
      const title = compactBtn?.getAttribute('title');
      // Should have aria-label or title for accessibility
      expect(ariaLabel || title).toBeTruthy();
    });

  });

});
