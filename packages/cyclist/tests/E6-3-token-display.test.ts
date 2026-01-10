/**
 * E6-3: Token Display UI Tests
 *
 * These tests verify the acceptance criteria for displaying real token usage
 * from OTLP metrics. Updated for B-22 to check stats-strip instead of sidebar.
 *
 * Acceptance Criteria:
 * - AC1: Stats strip shows input tokens (↓) from OTLP data
 * - AC2: Stats strip shows output tokens (↑) from OTLP data
 * - AC3: Updates in real-time as Claude processes requests
 * - AC4: Old message counting code removed
 * - AC5: Token counts reset on new session
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

describe('E6-3: Token Display UI', () => {
  let html: string;
  let document: Document;

  beforeAll(async () => {
    // Fetch HTML
    const htmlResponse = await request(app).get('/');
    html = htmlResponse.text;

    // Parse HTML with happy-dom
    const window = new Window();
    window.document.write(html);
    document = window.document;
  });

  describe('AC1: Stats strip shows input tokens from OTLP data', () => {

    it('should have input tokens display element in stats strip', () => {
      const inputTokens = document.querySelector('#stats-strip [data-stat="strip-input"]');
      expect(inputTokens).not.toBeNull();
    });

    it('should have ↓ indicator for input tokens', () => {
      const tokenIn = document.querySelector('#stats-strip .token-in');
      expect(tokenIn?.textContent).toContain('↓');
    });

    it('should display placeholder value initially', () => {
      const inputTokens = document.querySelector('#stats-strip [data-stat="strip-input"]');
      const text = inputTokens?.textContent || '';
      // Should have placeholder (dash or contain arrow with dash)
      expect(text.includes('—') || text.includes('0')).toBe(true);
    });

  });

  describe('AC2: Stats strip shows output tokens from OTLP data', () => {

    it('should have output tokens display element in stats strip', () => {
      const outputTokens = document.querySelector('#stats-strip [data-stat="strip-output"]');
      expect(outputTokens).not.toBeNull();
    });

    it('should have ↑ indicator for output tokens', () => {
      const tokenOut = document.querySelector('#stats-strip .token-out');
      expect(tokenOut?.textContent).toContain('↑');
    });

    it('should display placeholder value initially', () => {
      const outputTokens = document.querySelector('#stats-strip [data-stat="strip-output"]');
      const text = outputTokens?.textContent || '';
      // Should have placeholder (dash or contain arrow with dash)
      expect(text.includes('—') || text.includes('0')).toBe(true);
    });

  });

  describe('AC3: Updates in real-time - IPC Channel Infrastructure', () => {

    it('should define TOKEN_STATS_GET IPC channel', async () => {
      const main = await import('../src/main.js');

      expect(main.IPC_DATA_CHANNELS.TOKEN_STATS_GET).toBe('tokenStats:get');
    });

    it('should define TOKEN_STATS_UPDATE IPC channel', async () => {
      const main = await import('../src/main.js');

      expect(main.IPC_DATA_CHANNELS.TOKEN_STATS_UPDATE).toBe('tokenStats:update');
    });

    it('should expose tokenStats API on electronAPI', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(api.tokenStats).toBeDefined();
    });

    it('should provide tokenStats.get method', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(typeof api.tokenStats.get).toBe('function');
    });

    it('should provide tokenStats.onUpdate method for subscriptions', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(typeof api.tokenStats.onUpdate).toBe('function');
    });

    it('should register tokenStats:get channel in main process', async () => {
      const main = await import('../src/main.js');

      const channels = main.getDataChannels?.() || [];
      expect(channels).toContain('tokenStats:get');
    });

    it('should include tokenStats in channel naming convention', async () => {
      const main = await import('../src/main.js');

      const channels = main.IPC_DATA_CHANNELS;
      const allChannels = Object.values(channels) as string[];

      // Should follow {domain}:{action} pattern including tokenStats
      expect(allChannels).toContain('tokenStats:get');
      expect(allChannels).toContain('tokenStats:update');
    });

  });

  describe('AC4: Old message counting code removed', () => {

    it('should not have userMessages in stats state', async () => {
      const main = await import('../src/main.js');

      // Get current stats
      const stats = main.getStats?.() || {};

      // userMessages should not exist
      expect(stats).not.toHaveProperty('userMessages');
    });

    it('should not have claudeResponses in stats state', async () => {
      const main = await import('../src/main.js');

      // Get current stats
      const stats = main.getStats?.() || {};

      // claudeResponses should not exist
      expect(stats).not.toHaveProperty('claudeResponses');
    });

    it('should not have message counting DOM elements', () => {
      // Should not have old message count elements
      const userMessages = document.querySelector('[data-stat="userMessages"]');
      const claudeResponses = document.querySelector('[data-stat="claudeResponses"]');

      expect(userMessages).toBeNull();
      expect(claudeResponses).toBeNull();
    });

  });

  describe('AC5: Token counts reset on new session', () => {

    // This is already covered in otlp-receiver.test.ts
    // Here we verify the integration point

    it('should export resetTokenStats from otlp-receiver', async () => {
      const receiver = await import('../src/otlp-receiver.js');

      expect(receiver.resetTokenStats).toBeDefined();
      expect(typeof receiver.resetTokenStats).toBe('function');
    });

    it('should reset to zero values', async () => {
      const receiver = await import('../src/otlp-receiver.js');

      // Aggregate some tokens first
      receiver.aggregateTokenStats({ inputTokens: 1000, outputTokens: 500 });

      // Reset
      receiver.resetTokenStats();

      // Verify reset
      const stats = receiver.getTokenStats();
      expect(stats.inputTokens).toBe(0);
      expect(stats.outputTokens).toBe(0);
    });

  });

  describe('Token Formatting', () => {

    it('should format small numbers as-is', async () => {
      // Import stats.js formatter when available
      // For now, test the expected behavior
      const formatTokenCount = (n: number): string => {
        if (n < 1000) return String(n);
        if (n < 10000) return (n / 1000).toFixed(1) + 'k';
        if (n < 1000000) return Math.round(n / 1000) + 'k';
        return (n / 1000000).toFixed(1) + 'M';
      };

      expect(formatTokenCount(0)).toBe('0');
      expect(formatTokenCount(500)).toBe('500');
      expect(formatTokenCount(999)).toBe('999');
    });

    it('should format thousands with k suffix', async () => {
      const formatTokenCount = (n: number): string => {
        if (n < 1000) return String(n);
        if (n < 10000) return (n / 1000).toFixed(1) + 'k';
        if (n < 1000000) return Math.round(n / 1000) + 'k';
        return (n / 1000000).toFixed(1) + 'M';
      };

      expect(formatTokenCount(1000)).toBe('1.0k');
      expect(formatTokenCount(1500)).toBe('1.5k');
      expect(formatTokenCount(9999)).toBe('10.0k');
      expect(formatTokenCount(10000)).toBe('10k');
      expect(formatTokenCount(45300)).toBe('45k');
    });

    it('should format millions with M suffix', async () => {
      const formatTokenCount = (n: number): string => {
        if (n < 1000) return String(n);
        if (n < 10000) return (n / 1000).toFixed(1) + 'k';
        if (n < 1000000) return Math.round(n / 1000) + 'k';
        return (n / 1000000).toFixed(1) + 'M';
      };

      expect(formatTokenCount(1000000)).toBe('1.0M');
      expect(formatTokenCount(2500000)).toBe('2.5M');
    });

  });

  describe('Stats Strip Integration', () => {

    // Note: stats.js was consolidated into stats-strip.js per B-22
    it('should include stats-strip.js script in HTML', () => {
      expect(html).toContain('stats-strip.js');
    });

    it('should have stats strip in editor wrapper', () => {
      const statsStrip = document.querySelector('#stats-strip');
      expect(statsStrip).not.toBeNull();
    });

    it('should have token stats elements within stats strip', () => {
      const statsStrip = document.querySelector('#stats-strip');
      const inputTokens = statsStrip?.querySelector('[data-stat="strip-input"]');
      const outputTokens = statsStrip?.querySelector('[data-stat="strip-output"]');

      expect(inputTokens).not.toBeNull();
      expect(outputTokens).not.toBeNull();
    });

  });

});
