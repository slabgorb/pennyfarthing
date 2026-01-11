/**
 * E1-3: Sidebar Layout Tests
 *
 * These tests verify the acceptance criteria for the sidebar layout story.
 * Updated for B-22: Stats moved to prompt bar stats-strip.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

describe('E1-3: Sidebar Layout', () => {
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

  describe('AC1: Sidebar fixed to right edge', () => {
    it('should have sidebar element', () => {
      const sidebar = document.querySelector('#sidebar');
      expect(sidebar).not.toBeNull();
    });

    it('should have sidebar as aside element for semantics', () => {
      const sidebar = document.querySelector('aside#sidebar');
      expect(sidebar).not.toBeNull();
    });

    it('should have fixed width CSS for sidebar', () => {
      // Sidebar should have a defined width (not flex-grow)
      expect(css).toMatch(/#sidebar[^}]*width\s*:/);
    });
  });

  describe('AC2: Portrait section at top (square container)', () => {
    it('should have portrait element inside sidebar', () => {
      const portrait = document.querySelector('#sidebar #portrait');
      expect(portrait).not.toBeNull();
    });

    it('should have portrait as first child of sidebar content', () => {
      const sidebar = document.querySelector('#sidebar');
      const firstSection = sidebar?.querySelector('#portrait, .portrait-section');
      expect(firstSection).not.toBeNull();
    });

    it('should have fixed size styling for portrait', () => {
      // Portrait is 128x128 for balanced display alongside identity info
      expect(css).toMatch(/#portrait[^}]*width:\s*128px/);
      expect(css).toMatch(/#portrait[^}]*height:\s*128px/);
    });

    it('should have placeholder content in portrait section', () => {
      const portrait = document.querySelector('#portrait');
      // Should have either an img, a placeholder div, or meaningful content
      const hasContent = portrait?.innerHTML.trim().length! > 0;
      expect(hasContent).toBe(true);
    });
  });

  describe('AC3: Stats in prompt bar (B-22)', () => {
    // Stats moved from sidebar to prompt bar in B-22
    it('should have stats-strip element in editor wrapper', () => {
      const statsStrip = document.querySelector('#editor-wrapper #stats-strip');
      expect(statsStrip).not.toBeNull();
    });

    it('should have model badge in stats strip', () => {
      const modelBadge = document.querySelector('#stats-strip .model-badge');
      expect(modelBadge).not.toBeNull();
    });

    // 23-1: Token stats replaced by usage limits
    it('should have usage stats in stats strip', () => {
      const usage5hr = document.querySelector('#stats-strip .usage-5hr');
      const usageWeekly = document.querySelector('#stats-strip .usage-weekly');
      expect(usage5hr).not.toBeNull();
      expect(usageWeekly).not.toBeNull();
    });

    it('should have context meter in stats strip', () => {
      const contextMini = document.querySelector('#stats-strip .context-mini');
      expect(contextMini).not.toBeNull();
    });
  });

  describe('AC4: Connection status in stats strip', () => {
    // Connection status is indicated by model badge presence/state
    it('should have model badge for status display', () => {
      const modelBadge = document.querySelector('#stats-strip .model-badge');
      expect(modelBadge).not.toBeNull();
    });

    it('should have data-stat attribute for model updates', () => {
      const modelBadge = document.querySelector('#stats-strip .model-badge');
      expect(modelBadge?.getAttribute('data-stat')).toBe('strip-model');
    });
  });

  describe('AC5: Responsive to window resize', () => {
    it('should use flexbox for sidebar layout', () => {
      // Sidebar should use flex-direction: column for stacking sections
      expect(css).toMatch(/#sidebar[^}]*flex-direction\s*:\s*column/);
    });

    it('should have stats strip using flexbox', () => {
      // Stats strip should use flex for horizontal layout
      expect(css).toMatch(/#stats-strip[^}]*display:\s*flex/);
    });
  });

  describe('AC6: Dark theme matching terminal aesthetic', () => {
    it('should use CSS variables for colors', () => {
      // Should reference the established CSS variables
      expect(css).toMatch(/var\(--bg-/);
      expect(css).toMatch(/var\(--text-/);
    });

    it('should have dark background on sidebar sections', () => {
      // Sections should use dark background colors from variables
      expect(css).toMatch(/#portrait[^}]*background/);
    });

    it('should have appropriate text colors', () => {
      // Should have both primary and secondary text colors defined
      expect(css).toMatch(/--text-primary/);
      expect(css).toMatch(/--text-secondary/);
    });
  });
});
