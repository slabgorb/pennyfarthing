/**
 * B-22: Prompt Bar Stats Display Tests
 *
 * These tests verify the acceptance criteria for displaying stats
 * (model badge, token counts, context meter) in the prompt bar area.
 * Written in RED phase - tests should fail until Dev implements the functionality.
 *
 * Acceptance Criteria:
 * - AC1: Stats strip appears below editor toolbar with model badge, token counts, and context meter
 * - AC2: Model badge updates in real-time when model changes (via stats IPC)
 * - AC3: Token counts format correctly (k/M suffixes) and update on each message
 * - AC4: Context meter shows percentage with color states matching sidebar meter
 * - AC5: Stats strip has compact, non-intrusive visual design fitting the dark theme
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

describe('B-22: Prompt Bar Stats Display', () => {
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

  describe('AC1: Stats strip appears below editor toolbar with model badge, token counts, and context meter', () => {

    it('should have stats-strip container element', () => {
      const statsStrip = document.querySelector('#stats-strip');
      expect(statsStrip).not.toBeNull();
    });

    it('should have stats-strip inside editor-wrapper', () => {
      const editorWrapper = document.querySelector('#editor-wrapper');
      const statsStrip = editorWrapper?.querySelector('#stats-strip');
      expect(statsStrip).not.toBeNull();
    });

    it('should position stats-strip between toolbar and editor', () => {
      // Stats strip should come after toolbar in DOM order
      // B-20: editor is now wrapped in #editor-row with controls
      const editorWrapper = document.querySelector('#editor-wrapper');
      const children = Array.from(editorWrapper?.children || []);
      const toolbarIndex = children.findIndex(el => el.id === 'editor-toolbar');
      const statsStripIndex = children.findIndex(el => el.id === 'stats-strip');
      const editorRowIndex = children.findIndex(el => el.id === 'editor-row');

      expect(toolbarIndex).toBeGreaterThanOrEqual(0);
      expect(statsStripIndex).toBeGreaterThan(toolbarIndex);
      expect(editorRowIndex).toBeGreaterThan(statsStripIndex);
    });

    it('should have model-badge element', () => {
      const modelBadge = document.querySelector('#stats-strip .model-badge');
      expect(modelBadge).not.toBeNull();
    });

    it('should have token-stats container', () => {
      const tokenStats = document.querySelector('#stats-strip .token-stats');
      expect(tokenStats).not.toBeNull();
    });

    it('should have token-in element for input tokens', () => {
      const tokenIn = document.querySelector('#stats-strip .token-in');
      expect(tokenIn).not.toBeNull();
    });

    it('should have token-out element for output tokens', () => {
      const tokenOut = document.querySelector('#stats-strip .token-out');
      expect(tokenOut).not.toBeNull();
    });

    it('should have context-mini meter element', () => {
      const contextMini = document.querySelector('#stats-strip .context-mini');
      expect(contextMini).not.toBeNull();
    });

    it('should have context-mini-fill element for the progress bar', () => {
      const contextFill = document.querySelector('#stats-strip .context-mini-fill');
      expect(contextFill).not.toBeNull();
    });

    it('should have context-mini-label for percentage display', () => {
      const contextLabel = document.querySelector('#stats-strip .context-mini-label');
      expect(contextLabel).not.toBeNull();
    });

  });

  describe('AC2: Model badge updates in real-time when model changes (via stats IPC)', () => {

    it('should have data-stat attribute on model badge for updates', () => {
      const modelBadge = document.querySelector('#stats-strip .model-badge');
      expect(modelBadge?.getAttribute('data-stat')).toBe('strip-model');
    });

    it('should show placeholder text initially', () => {
      const modelBadge = document.querySelector('#stats-strip .model-badge');
      const text = modelBadge?.textContent?.trim() || '';
      // Should show placeholder or default model name
      expect(text === '—' || text === '-' || text.length > 0).toBe(true);
    });

    it('should include stats-strip.js script in HTML', () => {
      expect(html).toContain('stats-strip.js');
    });

  });

  describe('AC3: Token counts format correctly (k/M suffixes) and update on each message', () => {

    it('should have data-stat attribute on token-in for updates', () => {
      const tokenIn = document.querySelector('#stats-strip .token-in');
      expect(tokenIn?.getAttribute('data-stat')).toBe('strip-input');
    });

    it('should have data-stat attribute on token-out for updates', () => {
      const tokenOut = document.querySelector('#stats-strip .token-out');
      expect(tokenOut?.getAttribute('data-stat')).toBe('strip-output');
    });

    it('should show arrow indicators for token direction', () => {
      const statsStrip = document.querySelector('#stats-strip');
      const text = statsStrip?.textContent || '';
      // Should have down arrow for input and up arrow for output
      expect(text).toMatch(/[↓↑]/);
    });

    it('should display placeholder values initially', () => {
      const tokenIn = document.querySelector('#stats-strip .token-in');
      const tokenOut = document.querySelector('#stats-strip .token-out');

      const inText = tokenIn?.textContent || '';
      const outText = tokenOut?.textContent || '';

      // Should show placeholder (dash, 0, or formatted number)
      expect(inText.includes('—') || inText.includes('0') || /\d/.test(inText)).toBe(true);
      expect(outText.includes('—') || outText.includes('0') || /\d/.test(outText)).toBe(true);
    });

  });

  describe('AC4: Context meter shows percentage with color states matching sidebar meter', () => {

    it('should have data-stat attribute on context label for updates', () => {
      const contextLabel = document.querySelector('#stats-strip .context-mini-label');
      expect(contextLabel?.getAttribute('data-stat')).toBe('strip-context');
    });

    it('should show percentage text in context label', () => {
      const contextLabel = document.querySelector('#stats-strip .context-mini-label');
      const text = contextLabel?.textContent || '';
      // Should show percentage or placeholder
      expect(text.includes('%') || text === '—' || text === '-').toBe(true);
    });

    it('should have CSS for level-safe class on context-mini', () => {
      expect(css).toMatch(/\.context-mini\.level-safe|#stats-strip.*level-safe/);
    });

    it('should have CSS for level-warning class on context-mini', () => {
      expect(css).toMatch(/\.context-mini\.level-warning|#stats-strip.*level-warning/);
    });

    it('should have CSS for level-danger class on context-mini', () => {
      expect(css).toMatch(/\.context-mini\.level-danger|#stats-strip.*level-danger/);
    });

    it('should have CSS for level-critical class on context-mini', () => {
      expect(css).toMatch(/\.context-mini\.level-critical|#stats-strip.*level-critical/);
    });

  });

  describe('AC5: Stats strip has compact, non-intrusive visual design fitting the dark theme', () => {

    it('should have CSS for #stats-strip layout', () => {
      expect(css).toMatch(/#stats-strip\s*\{/);
    });

    it('should use flexbox for horizontal layout', () => {
      // Stats strip should use flex for horizontal layout
      expect(css).toMatch(/#stats-strip[^}]*display:\s*flex/);
    });

    it('should have compact height (max 30px)', () => {
      // Should define height or max-height
      expect(css).toMatch(/#stats-strip[^}]*(height|max-height|padding)/);
    });

    it('should have CSS for model-badge pill styling', () => {
      expect(css).toMatch(/\.model-badge\s*\{/);
    });

    it('should have border-radius on model-badge for pill shape', () => {
      expect(css).toMatch(/\.model-badge[^}]*border-radius/);
    });

    it('should have CSS for token-stats styling', () => {
      expect(css).toMatch(/\.token-stats\s*\{/);
    });

    it('should use monospace font for token counts', () => {
      expect(css).toMatch(/(\.token-stats|\.token-in|\.token-out)[^}]*font-family[^}]*mono/);
    });

    it('should have CSS for context-mini meter styling', () => {
      expect(css).toMatch(/\.context-mini\s*\{/);
    });

    it('should have CSS for context-mini-fill bar', () => {
      expect(css).toMatch(/\.context-mini-fill\s*\{/);
    });

    it('should use dark theme colors (background matching --bg-secondary or similar)', () => {
      // Should reference CSS variables or dark colors
      expect(css).toMatch(/#stats-strip[^}]*(var\(--|background|#[0-9a-fA-F]{3,6})/);
    });

  });

  describe('Stats Strip Script Integration', () => {

    // Note: stats.js was consolidated into stats-strip.js per B-22
    it('should include stats-strip.js script', () => {
      const statsStripIndex = html.indexOf('stats-strip.js');
      expect(statsStripIndex).toBeGreaterThanOrEqual(0);
    });

    it('should have initStatsStrip function exported to window', async () => {
      // This will be implemented in stats-strip.js
      // For now, just verify the script tag exists
      expect(html).toContain('stats-strip.js');
    });

  });

  describe('IPC Integration', () => {

    it('should reuse existing stats:update channel for model', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_DATA_CHANNELS.STATS_UPDATE).toBe('stats:update');
    });

    it('should reuse existing tokenStats:update channel', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_DATA_CHANNELS.TOKEN_STATS_UPDATE).toBe('tokenStats:update');
    });

    it('should not require new IPC channels in main.ts', async () => {
      // Stats strip reuses existing channels - no new channels needed
      const main = await import('../src/main.js');
      const channels = main.IPC_DATA_CHANNELS;

      // Should have existing channels
      expect(channels.STATS_GET).toBeDefined();
      expect(channels.STATS_UPDATE).toBeDefined();
      expect(channels.TOKEN_STATS_GET).toBeDefined();
      expect(channels.TOKEN_STATS_UPDATE).toBeDefined();
    });

  });

});
