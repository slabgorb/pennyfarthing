/**
 * E3-2: Main Process Architecture Tests
 *
 * These tests verify the IPC architecture for secure Electron communication.
 * They focus on:
 * - Preload script structure and exports
 * - Security configuration verification
 * - Claude SDK IPC handlers
 *
 * Note: PTY-related tests were removed in E7-5 (Programmatic Mode Migration)
 */

import { describe, it, expect } from 'vitest';

describe('E3-2: Main Process Architecture', () => {

  describe('AC1: Preload script exposes safe IPC bridge', () => {

    it('should export preload module from src/preload.ts', async () => {
      const preload = await import('../src/preload.js');
      expect(preload).toBeDefined();
    });

    it('should expose electronAPI structure via contextBridge', async () => {
      const preload = await import('../src/preload.js');
      expect(preload.electronAPI || preload.default).toBeDefined();
    });

    it('should provide claude.send method for SDK communication', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(api.claude).toBeDefined();
      expect(typeof api.claude.send).toBe('function');
    });

    it('should provide claude.setMode method for permission control', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(api.claude).toBeDefined();
      expect(typeof api.claude.setMode).toBe('function');
    });

    it('should provide claude.onMessage method for receiving messages', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(api.claude).toBeDefined();
      expect(typeof api.claude.onMessage).toBe('function');
    });

  });

  describe('AC3: Context isolation enabled for security', () => {

    it('should configure BrowserWindow with contextIsolation: true', async () => {
      const main = await import('../src/main.js');
      const config = main.getWindowConfig?.() || main.windowConfig;
      expect(config).toBeDefined();
      expect(config.webPreferences.contextIsolation).toBe(true);
    });

  });

  describe('AC5: No nodeIntegration in renderer', () => {

    it('should configure BrowserWindow with nodeIntegration: false', async () => {
      const main = await import('../src/main.js');
      const config = main.getWindowConfig?.() || main.windowConfig;
      expect(config).toBeDefined();
      expect(config.webPreferences.nodeIntegration).toBe(false);
    });

    it('should specify preload script path in window config', async () => {
      const main = await import('../src/main.js');
      const config = main.getWindowConfig?.() || main.windowConfig;
      expect(config).toBeDefined();
      expect(config.webPreferences.preload).toBeDefined();
      expect(typeof config.webPreferences.preload).toBe('string');
      expect(config.webPreferences.preload).toContain('preload');
    });

  });

  describe('Integration: IPC Data Channels', () => {

    it('should export data IPC channel constants', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_DATA_CHANNELS).toBeDefined();
      expect(main.IPC_DATA_CHANNELS.STATS_GET).toBe('stats:get');
      expect(main.IPC_DATA_CHANNELS.PERSONA_GET).toBe('persona:get');
    });

    it('should export Claude IPC channel constants', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_CLAUDE_CHANNELS).toBeDefined();
      expect(main.IPC_CLAUDE_CHANNELS.CLAUDE_SEND).toBe('claude:send');
      expect(main.IPC_CLAUDE_CHANNELS.CLAUDE_MESSAGE).toBe('claude:message');
    });

  });

});
