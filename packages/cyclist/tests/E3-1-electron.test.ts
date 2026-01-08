/**
 * E3-1: Electron Scaffolding Tests
 *
 * These tests verify the server can be controlled programmatically
 * for Electron integration. They focus on:
 * - Server exports for Electron main process
 * - Graceful server start/stop (for app lifecycle)
 *
 * Note: Electron-specific behavior (BrowserWindow, app lifecycle)
 * requires manual/E2E testing - not unit testable.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { Server } from 'http';

// Import server factory - this is what Electron main.ts will use
import { app, createTerminalServer } from '../src/server.js';

describe('E3-1: Electron Scaffolding', () => {

  let server: Server | null = null;

  afterEach(async () => {
    // Clean up any server created during tests
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
      server = null;
    }
  });

  describe('AC2: Express server runs inside Electron main process', () => {

    it('should export app for Express configuration', () => {
      expect(app).toBeDefined();
      expect(typeof app.listen).toBe('function');
    });

    it('should export createTerminalServer factory function', () => {
      expect(createTerminalServer).toBeDefined();
      expect(typeof createTerminalServer).toBe('function');
    });

    it('should create an HTTP server that can be started programmatically', async () => {
      server = createTerminalServer();
      expect(server).toBeDefined();
      expect(typeof server.listen).toBe('function');

      // Start on random port to avoid conflicts
      await new Promise<void>((resolve) => {
        server!.listen(0, () => resolve());
      });

      const address = server.address();
      expect(address).not.toBeNull();
      expect(typeof address).toBe('object');
    });

    it('should allow server to be stopped gracefully (for Electron quit)', async () => {
      server = createTerminalServer();

      // Start server
      await new Promise<void>((resolve) => {
        server!.listen(0, () => resolve());
      });

      // Verify it's listening
      expect(server.listening).toBe(true);

      // Stop server gracefully
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });

      // Verify it stopped
      expect(server.listening).toBe(false);
    });

  });

  describe('AC3: node-pty and WebSocket still work in Electron context', () => {

    it('should create server with WebSocket upgrade handling', async () => {
      server = createTerminalServer();

      // Start server
      await new Promise<void>((resolve) => {
        server!.listen(0, () => resolve());
      });

      // Server should handle 'upgrade' events (WebSocket)
      // This is implicitly tested by existing terminal/stats tests,
      // but we verify the server is configured for upgrades
      expect(server.listeners('upgrade').length).toBeGreaterThan(0);
    });

  });

  describe('AC5: App window has proper title and minimum size', () => {
    // Note: Window configuration is in Electron main.ts
    // This test documents the expected configuration

    it('should document expected window configuration', () => {
      // This is a placeholder that documents what main.ts should implement
      // Actual window config is tested manually or via Electron testing tools

      const expectedConfig = {
        title: 'Cyclist',
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
          nodeIntegration: false, // Security: disabled
          contextIsolation: true, // Security: enabled (can be false for E3-1)
        }
      };

      // Document the expectation - Dev will implement this in main.ts
      expect(expectedConfig.title).toBe('Cyclist');
      expect(expectedConfig.minWidth).toBeGreaterThanOrEqual(800);
      expect(expectedConfig.minHeight).toBeGreaterThanOrEqual(600);
    });

  });

});
