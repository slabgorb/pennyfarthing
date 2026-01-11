/**
 * 23-3: Command Abstraction Layer (IPC) Tests
 *
 * These tests verify the IPC architecture for Claude Code command execution.
 * They focus on:
 * - IPC channel constants for command execution
 * - Preload script extensions for command API
 * - Main process handler registration for command channels
 * - Command execution and result broadcasting
 *
 * Acceptance Criteria:
 * - AC1: IPC channels defined as constants
 * - AC2: Handlers registered in setupCommandIPCHandlers()
 * - AC3: Preload exposes command API
 * - AC4: Commands execute in Claude PTY session
 * - AC5: Results broadcast back to renderer
 */

import { describe, it, expect } from 'vitest';

describe('23-3: Command Abstraction Layer (IPC)', () => {

  describe('AC1: IPC Channel Constants', () => {

    it('should export IPC_COMMAND_CHANNELS from main.ts', async () => {
      const main = await import('../src/main.js');

      expect(main.IPC_COMMAND_CHANNELS).toBeDefined();
    });

    it('should define command:execute channel', async () => {
      const main = await import('../src/main.js');

      expect(main.IPC_COMMAND_CHANNELS.EXECUTE).toBe('command:execute');
    });

    it('should define command:result channel for broadcasting results', async () => {
      const main = await import('../src/main.js');

      expect(main.IPC_COMMAND_CHANNELS.RESULT).toBe('command:result');
    });

    it('should define command:error channel for broadcasting errors', async () => {
      const main = await import('../src/main.js');

      expect(main.IPC_COMMAND_CHANNELS.ERROR).toBe('command:error');
    });

  });

  describe('AC2: Handler Registration', () => {

    it('should export setupCommandIPCHandlers function', async () => {
      const main = await import('../src/main.js');

      expect(main.setupCommandIPCHandlers).toBeDefined();
      expect(typeof main.setupCommandIPCHandlers).toBe('function');
    });

    it('should export getCommandChannels function to list registered channels', async () => {
      const main = await import('../src/main.js');

      expect(main.getCommandChannels).toBeDefined();
      expect(typeof main.getCommandChannels).toBe('function');
    });

    it('should register command:execute channel', async () => {
      const main = await import('../src/main.js');

      const channels = main.getCommandChannels?.() || [];
      expect(channels).toContain('command:execute');
    });

  });

  describe('AC3: Preload Command API', () => {

    it('should expose command API on electronAPI', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(api.command).toBeDefined();
    });

    it('should provide command.execute method', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(typeof api.command.execute).toBe('function');
    });

    it('should provide command.onResult method for receiving results', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(typeof api.command.onResult).toBe('function');
    });

    it('should provide command.onError method for receiving errors', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(typeof api.command.onError).toBe('function');
    });

  });

  describe('AC4/AC5: Command Execution Contract', () => {

    it('should use consistent channel naming convention', async () => {
      const main = await import('../src/main.js');

      // All command channels should follow command:{action} pattern
      const channels = main.IPC_COMMAND_CHANNELS;

      expect(Object.values(channels).every((ch: string) =>
        ch.match(/^command:(execute|result|error)$/)
      )).toBe(true);
    });

    it('should export broadcastToRenderer for result broadcasting', async () => {
      const main = await import('../src/main.js');

      // Already exists, but verify it's available for command results
      expect(main.broadcastToRenderer).toBeDefined();
      expect(typeof main.broadcastToRenderer).toBe('function');
    });

  });

  describe('Integration: Type Safety', () => {

    it('should export ElectronCommandAPI type from preload', async () => {
      const preload = await import('../src/preload');

      // The interface should be exported for consumers
      // Check that electronAPI exists with the expected command API
      expect(preload.electronAPI).toBeDefined();
      expect(preload.electronAPI.command).toBeDefined();
    });

  });

});
