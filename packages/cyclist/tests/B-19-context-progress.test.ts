/**
 * B-19: Context Usage Progress Bar Tests
 *
 * These tests verify the acceptance criteria for displaying context window
 * usage as a visual progress bar. Updated for B-22 to check stats-strip.
 * Written in RED phase - tests should fail until Dev implements the functionality.
 *
 * Acceptance Criteria:
 * - AC1: Progress bar shows current context usage percentage
 * - AC2: Bar changes color based on usage level (green <50%, yellow 50-80%, red >80%)
 * - AC3: Critical state (>95%) has visual warning (pulse animation)
 * - AC4: Tooltip shows raw token counts (used/total)
 * - AC5: Updates in real-time as conversation progresses
 * - AC6: Graceful handling when context data unavailable (show "—")
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

// Context meter utility functions - will be implemented in context-meter.ts
// Import will fail until Dev creates the module
const importContextMeter = async () => {
  try {
    return await import('../src/context-meter.js');
  } catch {
    return null;
  }
};

describe('B-19: Context Usage Progress Bar', () => {
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

  describe('AC1: Progress bar shows current context usage percentage', () => {

    it('should have context-mini container element in stats strip', () => {
      const contextMini = document.querySelector('#stats-strip .context-mini');
      expect(contextMini).not.toBeNull();
    });

    it('should have progress fill element inside context-mini', () => {
      const progressFill = document.querySelector('#stats-strip .context-mini-fill');
      expect(progressFill).not.toBeNull();
    });

    it('should have context-mini-label element for percentage', () => {
      const label = document.querySelector('#stats-strip .context-mini-label');
      expect(label).not.toBeNull();
    });

    it('should calculate correct percentage from token counts', async () => {
      const contextMeter = await importContextMeter();
      expect(contextMeter).not.toBeNull();

      const { calculateContextPercentage } = contextMeter!;
      expect(calculateContextPercentage).toBeDefined();

      // 50,000 tokens used of 200,000 limit = 25%
      expect(calculateContextPercentage(50000, 200000)).toBe(25);
    });

    it('should cap percentage at 100%', async () => {
      const contextMeter = await importContextMeter();
      expect(contextMeter).not.toBeNull();

      const { calculateContextPercentage } = contextMeter!;

      // 250,000 tokens used of 200,000 limit = should cap at 100%
      expect(calculateContextPercentage(250000, 200000)).toBe(100);
    });

    it('should handle zero limit gracefully', async () => {
      const contextMeter = await importContextMeter();
      expect(contextMeter).not.toBeNull();

      const { calculateContextPercentage } = contextMeter!;

      // Avoid division by zero
      expect(calculateContextPercentage(1000, 0)).toBe(0);
    });

  });

  describe('AC2: Bar changes color based on usage level', () => {

    it('should export getContextLevel function', async () => {
      const contextMeter = await importContextMeter();
      expect(contextMeter).not.toBeNull();

      expect(contextMeter!.getContextLevel).toBeDefined();
    });

    it('should return "safe" for usage under 50%', async () => {
      const contextMeter = await importContextMeter();
      expect(contextMeter).not.toBeNull();

      const { getContextLevel } = contextMeter!;

      expect(getContextLevel(0)).toBe('safe');
      expect(getContextLevel(25)).toBe('safe');
      expect(getContextLevel(49)).toBe('safe');
    });

    it('should return "warning" for usage 50-79%', async () => {
      const contextMeter = await importContextMeter();
      expect(contextMeter).not.toBeNull();

      const { getContextLevel } = contextMeter!;

      expect(getContextLevel(50)).toBe('warning');
      expect(getContextLevel(65)).toBe('warning');
      expect(getContextLevel(79)).toBe('warning');
    });

    it('should return "danger" for usage 80-94%', async () => {
      const contextMeter = await importContextMeter();
      expect(contextMeter).not.toBeNull();

      const { getContextLevel } = contextMeter!;

      expect(getContextLevel(80)).toBe('danger');
      expect(getContextLevel(90)).toBe('danger');
      expect(getContextLevel(94)).toBe('danger');
    });

    it('should return "critical" for usage 95%+', async () => {
      const contextMeter = await importContextMeter();
      expect(contextMeter).not.toBeNull();

      const { getContextLevel } = contextMeter!;

      expect(getContextLevel(95)).toBe('critical');
      expect(getContextLevel(99)).toBe('critical');
      expect(getContextLevel(100)).toBe('critical');
    });

    it('should have CSS for level-safe class with green color', () => {
      expect(css).toMatch(/\.context-mini\.level-safe|level-safe.*\.context-mini-fill/);
      // Should reference green color variable or hex
      expect(css).toMatch(/--status-ready|#[0-9a-fA-F]{3,6}|green|rgb/);
    });

    it('should have CSS for level-warning class with yellow color', () => {
      expect(css).toMatch(/\.context-mini\.level-warning|level-warning.*\.context-mini-fill/);
    });

    it('should have CSS for level-danger class with red color', () => {
      expect(css).toMatch(/\.context-mini\.level-danger|level-danger.*\.context-mini-fill/);
    });

    it('should have CSS for level-critical class', () => {
      expect(css).toMatch(/\.context-mini\.level-critical|level-critical.*\.context-mini-fill/);
    });

  });

  describe('AC3: Critical state has visual warning (pulse animation)', () => {

    it('should have pulse animation keyframes defined', () => {
      expect(css).toMatch(/@keyframes\s+pulse/);
    });

    it('should apply pulse animation to critical level', () => {
      // level-critical should have animation property
      expect(css).toMatch(/level-critical[^}]*animation[^}]*pulse/);
    });

  });

  describe('AC4: Tooltip shows raw token counts', () => {

    it('should have context-mini element for tooltip support', () => {
      const contextMini = document.querySelector('#stats-strip .context-mini');
      expect(contextMini).not.toBeNull();
    });

    it('should export formatTooltip function', async () => {
      const contextMeter = await importContextMeter();
      expect(contextMeter).not.toBeNull();

      expect(contextMeter!.formatTooltip).toBeDefined();
    });

    it('should format tooltip with used/total tokens', async () => {
      const contextMeter = await importContextMeter();
      expect(contextMeter).not.toBeNull();

      const { formatTooltip } = contextMeter!;

      // Should show human-readable format: "50,000 / 200,000 tokens"
      const tooltip = formatTooltip(50000, 200000);
      expect(tooltip).toContain('50');
      expect(tooltip).toContain('200');
      expect(tooltip).toMatch(/token/i);
    });

    it('should format large token counts with commas', async () => {
      const contextMeter = await importContextMeter();
      expect(contextMeter).not.toBeNull();

      const { formatTooltip } = contextMeter!;

      const tooltip = formatTooltip(150000, 200000);
      // Should have comma formatting: "150,000"
      expect(tooltip).toMatch(/150,000|150\.0k|150k/);
    });

  });

  describe('AC5: Updates in real-time as conversation progresses', () => {

    it('should define CONTEXT_UPDATE IPC channel in main.ts', async () => {
      const main = await import('../src/main.js');

      // Should have context update channel
      expect(main.IPC_DATA_CHANNELS.CONTEXT_UPDATE).toBe('context:update');
    });

    it('should expose context API on electronAPI', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(api.context).toBeDefined();
    });

    it('should provide context.onUpdate method for subscriptions', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(typeof api.context.onUpdate).toBe('function');
    });

    it('should include context.js script in HTML', () => {
      expect(html).toContain('context.js');
    });

  });

  describe('AC6: Graceful handling when context data unavailable', () => {

    it('should show placeholder initially in DOM', () => {
      const label = document.querySelector('#stats-strip .context-mini-label');
      const text = label?.textContent || '';

      // Should show dash or placeholder before data available
      expect(text === '—' || text === '-' || text === '—%' || text === '0%').toBe(true);
    });

    it('should handle undefined input tokens', async () => {
      const contextMeter = await importContextMeter();
      expect(contextMeter).not.toBeNull();

      const { calculateContextPercentage } = contextMeter!;

      // Should handle undefined/null gracefully
      expect(calculateContextPercentage(undefined as unknown as number, 200000)).toBe(0);
    });

    it('should handle undefined output tokens', async () => {
      const contextMeter = await importContextMeter();
      expect(contextMeter).not.toBeNull();

      const { calculateContextPercentage } = contextMeter!;

      // Should handle undefined/null gracefully
      expect(calculateContextPercentage(null as unknown as number, 200000)).toBe(0);
    });

    it('should show dash for unavailable context in formatTooltip', async () => {
      const contextMeter = await importContextMeter();
      expect(contextMeter).not.toBeNull();

      const { formatTooltip } = contextMeter!;

      // When no data available, should show placeholder
      const tooltip = formatTooltip(undefined as unknown as number, 200000);
      expect(tooltip).toMatch(/—|unavailable|no data/i);
    });

  });

  describe('Context Meter Module Structure', () => {

    it('should have context-meter module at src/context-meter.ts', async () => {
      const contextMeter = await importContextMeter();

      // Module should exist and export required functions
      expect(contextMeter).not.toBeNull();
    });

    it('should export DEFAULT_CONTEXT_LIMIT constant', async () => {
      const contextMeter = await importContextMeter();
      expect(contextMeter).not.toBeNull();

      expect(contextMeter!.DEFAULT_CONTEXT_LIMIT).toBeDefined();
      expect(contextMeter!.DEFAULT_CONTEXT_LIMIT).toBe(200000);
    });

    it('should export all required functions', async () => {
      const contextMeter = await importContextMeter();
      expect(contextMeter).not.toBeNull();

      expect(contextMeter!.calculateContextPercentage).toBeDefined();
      expect(contextMeter!.getContextLevel).toBeDefined();
      expect(contextMeter!.formatTooltip).toBeDefined();
    });

  });

  describe('CSS Structure', () => {

    it('should have .context-mini class defined', () => {
      expect(css).toMatch(/\.context-mini\s*\{/);
    });

    it('should have .context-mini-fill class with transition for smooth animation', () => {
      expect(css).toMatch(/\.context-mini-fill[^}]*transition/);
    });

    it('should have .context-mini-label class for percentage display', () => {
      expect(css).toMatch(/\.context-mini-label/);
    });

  });

});
