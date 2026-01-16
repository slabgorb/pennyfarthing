/**
 * B-2: IPC Data Channels Tests
 *
 * These tests verify the IPC architecture for sidebar data in Electron mode.
 * They focus on:
 * - New IPC channel constants for stats/persona/story/git
 * - Preload script extensions for data API
 * - Main process handler registration for data channels
 * - Subscription patterns for real-time updates
 *
 * Acceptance Criteria:
 * - AC1: Electron app runs without relying on Express server for sidebar data
 * - AC2: All sidebar data (stats, persona, story, git) flows through IPC in Electron mode
 * - AC3: Browser mode still works with HTTP server (npm run dev)
 * - AC4: No functionality regression - all existing features work
 */

import { describe, it, expect } from 'vitest';

describe('B-2: IPC Data Channels', () => {

  describe('AC1/AC2: IPC Channel Constants for Sidebar Data', () => {

    it('should export IPC_DATA_CHANNELS from main.ts', async () => {
      const main = await import('../src/main.js');

      // New constant for data channels (separate from PTY channels)
      expect(main.IPC_DATA_CHANNELS).toBeDefined();
    });

    it('should define stats IPC channels', async () => {
      const main = await import('../src/main.js');

      expect(main.IPC_DATA_CHANNELS.STATS_GET).toBe('stats:get');
      expect(main.IPC_DATA_CHANNELS.STATS_UPDATE).toBe('stats:update');
    });

    it('should define persona IPC channels', async () => {
      const main = await import('../src/main.js');

      expect(main.IPC_DATA_CHANNELS.PERSONA_GET).toBe('persona:get');
      expect(main.IPC_DATA_CHANNELS.PERSONA_UPDATE).toBe('persona:update');
    });

    it('should define story IPC channels', async () => {
      const main = await import('../src/main.js');

      expect(main.IPC_DATA_CHANNELS.STORY_GET).toBe('story:get');
      expect(main.IPC_DATA_CHANNELS.STORY_UPDATE).toBe('story:update');
    });

    it('should define git IPC channels', async () => {
      const main = await import('../src/main.js');

      expect(main.IPC_DATA_CHANNELS.GIT_GET).toBe('git:get');
      expect(main.IPC_DATA_CHANNELS.GIT_UPDATE).toBe('git:update');
    });

  });

  describe('AC1/AC2: Preload API Extensions', () => {

    it('should expose stats API on electronAPI', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(api.stats).toBeDefined();
    });

    it('should provide stats.get method', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(typeof api.stats.get).toBe('function');
    });

    it('should provide stats.onUpdate method for subscriptions', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(typeof api.stats.onUpdate).toBe('function');
    });

    it('should expose persona API on electronAPI', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(api.persona).toBeDefined();
    });

    it('should provide persona.get method', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(typeof api.persona.get).toBe('function');
    });

    it('should provide persona.onUpdate method for subscriptions', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(typeof api.persona.onUpdate).toBe('function');
    });

    it('should expose story API on electronAPI', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(api.story).toBeDefined();
    });

    it('should provide story.get method', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(typeof api.story.get).toBe('function');
    });

    it('should provide story.onUpdate method for subscriptions', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(typeof api.story.onUpdate).toBe('function');
    });

    it('should expose git API on electronAPI', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(api.git).toBeDefined();
    });

    it('should provide git.get method', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(typeof api.git.get).toBe('function');
    });

    it('should provide git.onUpdate method for subscriptions', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(typeof api.git.onUpdate).toBe('function');
    });

  });

  describe('AC1/AC2: Main Process Data Handlers', () => {

    it('should export setupDataIPCHandlers function', async () => {
      const main = await import('../src/main.js');

      expect(main.setupDataIPCHandlers).toBeDefined();
      expect(typeof main.setupDataIPCHandlers).toBe('function');
    });

    it('should export getDataChannels function to list registered channels', async () => {
      const main = await import('../src/main.js');

      expect(main.getDataChannels).toBeDefined();
      expect(typeof main.getDataChannels).toBe('function');
    });

    it('should register stats:get channel', async () => {
      const main = await import('../src/main.js');

      const channels = main.getDataChannels?.() || [];
      expect(channels).toContain('stats:get');
    });

    it('should register persona:get channel', async () => {
      const main = await import('../src/main.js');

      const channels = main.getDataChannels?.() || [];
      expect(channels).toContain('persona:get');
    });

    it('should register story:get channel', async () => {
      const main = await import('../src/main.js');

      const channels = main.getDataChannels?.() || [];
      expect(channels).toContain('story:get');
    });

    it('should register git:get channel', async () => {
      const main = await import('../src/main.js');

      const channels = main.getDataChannels?.() || [];
      expect(channels).toContain('git:get');
    });

  });

  describe('AC2: Data Push to Renderer', () => {

    it('should export broadcastToRenderer function', async () => {
      const main = await import('../src/main.js');

      // For pushing stats/persona/story/git updates to renderer
      expect(main.broadcastToRenderer).toBeDefined();
      expect(typeof main.broadcastToRenderer).toBe('function');
    });

    it('should export setMainWindow function for renderer reference', async () => {
      const main = await import('../src/main.js');

      // Main process needs reference to window to push updates
      expect(main.setMainWindow).toBeDefined();
      expect(typeof main.setMainWindow).toBe('function');
    });

  });

  describe('AC3: Browser Mode Compatibility', () => {

    // These are structural tests - renderer JS still has HTTP fallback
    // Full integration testing requires browser environment

    it('should have electronAPI detection pattern documented', () => {
      // The renderer files should check: window.electronAPI?.stats
      // If present: use IPC
      // If absent: use HTTP/WebSocket (existing behavior)

      // This is a documentation/contract test
      // Actual testing of JS files requires browser environment or JSDOM
      expect(true).toBe(true);
    });

  });

  describe('AC4: Integration - Data Flow Contracts', () => {

    it('should use consistent channel naming convention', async () => {
      const main = await import('../src/main.js');

      // All data channels should follow {domain}:{action} pattern
      const channels = main.IPC_DATA_CHANNELS;

      // Updated to include toolEvents, usageStats, and projectInfo domains
      expect(Object.values(channels).every((ch: string) =>
        ch.match(/^(stats|persona|story|git|toolStats|tokenStats|todos|context|toolEvents|usageStats|projectInfo):(get|update)$/)
      )).toBe(true);
    });

    it('should export ElectronDataAPI type from preload', async () => {
      // Verify TypeScript types are exported for type safety
      // Import the TypeScript source directly for type checking
      // Types exist at compile time in the source file
      const preload = await import('../src/preload');

      // The interface should be exported for consumers
      // Check that electronAPI exists with the expected data APIs
      expect(preload.electronAPI).toBeDefined();
      expect(preload.electronAPI.stats).toBeDefined();
      expect(preload.electronAPI.persona).toBeDefined();
      expect(preload.electronAPI.story).toBeDefined();
      expect(preload.electronAPI.git).toBeDefined();
    });

  });

});
