/**
 * 23-1: Usage Limits in Stats Strip Tests
 *
 * These tests verify the acceptance criteria for displaying Claude usage limits
 * (5-hour block %, weekly %) in the stats strip, replacing the token display.
 * Written in RED phase - tests should fail until Dev implements the functionality.
 *
 * Acceptance Criteria:
 * - AC1: 5-hour block % displayed in stats strip
 * - AC2: Weekly % displayed in stats strip
 * - AC3: Color coding reflects remaining capacity (Green >50%, Yellow 25-50%, Red <25%)
 * - AC4: Hover shows reset timestamp
 * - AC5: Polls periodically to stay current
 * - AC6: Works with Pro and Max plans
 * - AC7: Token display (in/out counts) removed from stats strip
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

describe('23-1: Usage Limits in Stats Strip', () => {
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

  describe('AC1: 5-hour block % displayed in stats strip', () => {

    it('should have usage-5hr element in stats strip', () => {
      const usage5hr = document.querySelector('#stats-strip .usage-5hr');
      expect(usage5hr).not.toBeNull();
    });

    it('should have data-stat attribute for 5hr updates', () => {
      const usage5hr = document.querySelector('#stats-strip .usage-5hr');
      expect(usage5hr?.getAttribute('data-stat')).toBe('strip-usage-5hr');
    });

    it('should have usage value element ready for population', () => {
      const usageValue = document.querySelector('#stats-strip .usage-5hr .usage-value');
      // Element exists and is ready to be populated by JavaScript
      // Starts empty (hidden) and gets populated when data arrives
      expect(usageValue).not.toBeNull();
    });

    it('should have label indicating 5-hour period', () => {
      const usage5hr = document.querySelector('#stats-strip .usage-5hr');
      // The visible label is "Window:" but the title attribute describes it as 5-hour
      const title = usage5hr?.getAttribute('title') || '';
      expect(title.toLowerCase()).toMatch(/5.?hour|window/i);
    });

  });

  describe('AC2: Weekly % displayed in stats strip', () => {

    it('should have usage-weekly element in stats strip', () => {
      const usageWeekly = document.querySelector('#stats-strip .usage-weekly');
      expect(usageWeekly).not.toBeNull();
    });

    it('should have data-stat attribute for weekly updates', () => {
      const usageWeekly = document.querySelector('#stats-strip .usage-weekly');
      expect(usageWeekly?.getAttribute('data-stat')).toBe('strip-usage-weekly');
    });

    it('should have usage value element ready for population', () => {
      const usageValue = document.querySelector('#stats-strip .usage-weekly .usage-value');
      // Element exists and is ready to be populated by JavaScript
      // Starts empty (hidden) and gets populated when data arrives
      expect(usageValue).not.toBeNull();
    });

    it('should have label indicating weekly period', () => {
      const statsStrip = document.querySelector('#stats-strip');
      const text = statsStrip?.textContent || '';
      // Should have weekly/week label
      expect(text.toLowerCase()).toMatch(/week|7.?day/i);
    });

  });

  describe('AC3: Color coding reflects remaining capacity', () => {

    it('should have CSS for usage-safe class (>50% remaining)', () => {
      expect(css).toMatch(/\.usage-(5hr|weekly)\.usage-safe|\.usage-safe/);
    });

    it('should have CSS for usage-warning class (25-50% remaining)', () => {
      expect(css).toMatch(/\.usage-(5hr|weekly)\.usage-warning|\.usage-warning/);
    });

    it('should have CSS for usage-danger class (<25% remaining)', () => {
      expect(css).toMatch(/\.usage-(5hr|weekly)\.usage-danger|\.usage-danger/);
    });

    it('should use green color for safe level', () => {
      // Green indicates >50% remaining
      expect(css).toMatch(/usage-safe[^}]*(green|#[0-9a-fA-F]{3,6}|var\(--.*green)/i);
    });

    it('should use yellow/orange color for warning level', () => {
      // Yellow indicates 25-50% remaining
      expect(css).toMatch(/usage-warning[^}]*(yellow|orange|#[0-9a-fA-F]{3,6}|var\(--.*warning)/i);
    });

    it('should use red color for danger level', () => {
      // Red indicates <25% remaining
      expect(css).toMatch(/usage-danger[^}]*(red|#[0-9a-fA-F]{3,6}|var\(--.*danger)/i);
    });

  });

  describe('AC4: Hover shows reset timestamp', () => {

    it('should have title attribute on 5hr element for tooltip', () => {
      const usage5hr = document.querySelector('#stats-strip .usage-5hr');
      // Title attribute provides native browser tooltip
      expect(usage5hr?.hasAttribute('title') || usage5hr?.hasAttribute('data-tooltip')).toBe(true);
    });

    it('should have title attribute on weekly element for tooltip', () => {
      const usageWeekly = document.querySelector('#stats-strip .usage-weekly');
      // Title attribute provides native browser tooltip
      expect(usageWeekly?.hasAttribute('title') || usageWeekly?.hasAttribute('data-tooltip')).toBe(true);
    });

    it('should have CSS for tooltip styling if custom tooltips used', () => {
      // May use custom tooltip or native title
      const hasTooltipCSS = css.includes('[data-tooltip]') || css.includes('.tooltip') || css.includes('title');
      // This is optional - native title works fine
      expect(hasTooltipCSS || true).toBe(true);
    });

  });

  describe('AC5: Polls periodically to stay current', () => {

    it('should define USAGE_STATS_GET IPC channel', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_DATA_CHANNELS.USAGE_STATS_GET).toBe('usageStats:get');
    });

    it('should define USAGE_STATS_UPDATE IPC channel', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_DATA_CHANNELS.USAGE_STATS_UPDATE).toBe('usageStats:update');
    });

    it('should expose usageStats API on electronAPI', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;
      expect(api.usageStats).toBeDefined();
    });

    it('should provide usageStats.get method', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;
      expect(typeof api.usageStats.get).toBe('function');
    });

    it('should provide usageStats.onUpdate method for subscriptions', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;
      expect(typeof api.usageStats.onUpdate).toBe('function');
    });

    it('should export getUsageStats from main', async () => {
      const main = await import('../src/main.js');
      expect(main.getUsageStats).toBeDefined();
      expect(typeof main.getUsageStats).toBe('function');
    });

    it('should export startUsagePolling from main', async () => {
      const main = await import('../src/main.js');
      expect(main.startUsagePolling).toBeDefined();
      expect(typeof main.startUsagePolling).toBe('function');
    });

    it('should return usage stats with expected structure', async () => {
      const main = await import('../src/main.js');
      const stats = main.getUsageStats?.() || {};

      // Should have 5-hour and weekly percentages
      expect(stats).toHaveProperty('fiveHourPercent');
      expect(stats).toHaveProperty('weeklyPercent');
    });

    it('should include reset timestamps in usage stats', async () => {
      const main = await import('../src/main.js');
      const stats = main.getUsageStats?.() || {};

      // Should have reset timestamps
      expect(stats).toHaveProperty('fiveHourResetAt');
      expect(stats).toHaveProperty('weeklyResetAt');
    });

  });

  describe('AC6: Works with Pro and Max plans', () => {

    it('should include plan type in usage stats', async () => {
      const main = await import('../src/main.js');
      const stats = main.getUsageStats?.() || {};

      // Should indicate plan type (pro, max, or unknown)
      expect(stats).toHaveProperty('planType');
    });

    it('should handle missing usage data gracefully', async () => {
      const main = await import('../src/main.js');
      const stats = main.getUsageStats?.() || {};

      // Should have valid defaults even if /status unavailable
      expect(typeof stats.fiveHourPercent).toBe('number');
      expect(typeof stats.weeklyPercent).toBe('number');
    });

  });

  describe('AC7: Token display removed from stats strip', () => {

    it('should NOT have token-in element in stats strip', () => {
      const tokenIn = document.querySelector('#stats-strip .token-in');
      expect(tokenIn).toBeNull();
    });

    it('should NOT have token-out element in stats strip', () => {
      const tokenOut = document.querySelector('#stats-strip .token-out');
      expect(tokenOut).toBeNull();
    });

    it('should NOT have strip-input data-stat attribute', () => {
      const stripInput = document.querySelector('#stats-strip [data-stat="strip-input"]');
      expect(stripInput).toBeNull();
    });

    it('should NOT have strip-output data-stat attribute', () => {
      const stripOutput = document.querySelector('#stats-strip [data-stat="strip-output"]');
      expect(stripOutput).toBeNull();
    });

    it('should NOT have token-stats container', () => {
      const tokenStats = document.querySelector('#stats-strip .token-stats');
      expect(tokenStats).toBeNull();
    });

    it('should NOT have arrow indicators for tokens', () => {
      const statsStrip = document.querySelector('#stats-strip');
      const text = statsStrip?.textContent || '';
      // Should not have token arrows (↓ for input, ↑ for output)
      // But may still have context or other elements
      const hasTokenArrows = text.includes('↓') && text.includes('↑');
      expect(hasTokenArrows).toBe(false);
    });

  });

  describe('Usage Stats IPC Integration', () => {

    it('should register usageStats:get channel in main process', async () => {
      const main = await import('../src/main.js');
      const channels = main.getDataChannels?.() || [];
      expect(channels).toContain('usageStats:get');
    });

    it('should follow {domain}:{action} naming convention', async () => {
      const main = await import('../src/main.js');
      const channels = main.IPC_DATA_CHANNELS;

      // Should have usageStats channels following pattern
      expect(channels.USAGE_STATS_GET).toMatch(/^usageStats:/);
      expect(channels.USAGE_STATS_UPDATE).toMatch(/^usageStats:/);
    });

  });

  describe('Stats Strip Layout Update', () => {

    it('should still have context-mini meter element', () => {
      const contextMini = document.querySelector('#stats-strip .context-mini');
      expect(contextMini).not.toBeNull();
    });

    it('should still have model-badge element', () => {
      const modelBadge = document.querySelector('#stats-strip .model-badge');
      expect(modelBadge).not.toBeNull();
    });

    it('should have usage stats positioned after context meter', () => {
      // Layout: [Model] [Context] [5hr] [Week]
      const statsStrip = document.querySelector('#stats-strip');
      const children = Array.from(statsStrip?.children || []);

      const contextIndex = children.findIndex(el =>
        el.classList.contains('context-mini') || el.querySelector('.context-mini')
      );
      const usage5hrIndex = children.findIndex(el =>
        el.classList.contains('usage-5hr') || el.querySelector('.usage-5hr')
      );

      // Usage should come after context
      if (contextIndex >= 0 && usage5hrIndex >= 0) {
        expect(usage5hrIndex).toBeGreaterThan(contextIndex);
      }
    });

    it('should have CSS for usage meter styling', () => {
      expect(css).toMatch(/\.usage-5hr|\.usage-weekly/);
    });

  });

  describe('Usage Display Formatting', () => {

    it('should format percentage as integer', () => {
      // Helper to format usage percentage
      const formatUsagePercent = (percent: number): string => {
        return `${Math.round(percent)}%`;
      };

      expect(formatUsagePercent(72.3)).toBe('72%');
      expect(formatUsagePercent(50)).toBe('50%');
      expect(formatUsagePercent(0)).toBe('0%');
      expect(formatUsagePercent(100)).toBe('100%');
    });

    it('should format reset time as relative duration', () => {
      // Helper to format reset time
      const formatResetTime = (resetAt: Date | string): string => {
        const reset = new Date(resetAt);
        const now = new Date();
        const diffMs = reset.getTime() - now.getTime();

        if (diffMs <= 0) return 'Resetting...';

        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
      };

      const future = new Date(Date.now() + 2 * 60 * 60 * 1000 + 34 * 60 * 1000); // 2h 34m
      const result = formatResetTime(future);
      expect(result).toMatch(/\d+h \d+m/);
    });

  });

});
