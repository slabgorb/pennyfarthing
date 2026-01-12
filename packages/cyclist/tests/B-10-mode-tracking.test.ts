/**
 * B-10: Mode Toggle Bug Tests
 *
 * Tests for the mode tracking feature that distinguishes between:
 * - `activeMode`: The mode actually used in the current/last query
 * - `pendingMode`: The mode the user has selected (will apply on next query)
 *
 * Bug: Mode button updates visually but doesn't reflect actual running mode.
 * Fix: Track both modes, show indicator when they differ.
 *
 * Acceptance Criteria:
 * - AC1: Mode change takes effect immediately OR user is notified it applies to next query
 * - AC2: Mode button accurately reflects the ACTUAL mode of running session
 * - AC3: All permission modes work correctly
 * - AC4: No confusion between displayed mode and actual behavior
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'child_process';
import { EventEmitter, Readable, Writable } from 'stream';

import {
  ClaudeService,
  SDKMessage,
  PermissionMode,
  ClaudeSpawner
} from '../src/claude-service.js';

/**
 * Create a mock ChildProcess that emits NDJSON messages on stdout
 */
function createMockChildProcess(messages: SDKMessage[], exitCode = 0): ChildProcess {
  const emitter = new EventEmitter();

  // Create mock stdin stream
  const stdinData: string[] = [];
  const mockStdin = new Writable({
    write(chunk, _encoding, callback) {
      stdinData.push(chunk.toString());
      callback();
    },
  });

  // Create mock stdout stream that will emit messages
  const mockStdout = new Readable({ read() {} });

  // Create mock stderr stream
  const mockStderr = new Readable({ read() {} });

  const mockProcess = Object.assign(emitter, {
    pid: 12345,
    stdin: mockStdin,
    stdout: mockStdout,
    stderr: mockStderr,
    stdio: [mockStdin, mockStdout, mockStderr, null, null] as ChildProcess['stdio'],
    connected: true,
    killed: false,
    exitCode: null,
    signalCode: null,
    spawnargs: ['claude'],
    spawnfile: 'claude',
    kill: vi.fn((signal?: NodeJS.Signals | number): boolean => {
      mockProcess.killed = true;
      setImmediate(() => {
        emitter.emit('close', signal ? 1 : 0, signal || null);
      });
      return true;
    }),
    send: vi.fn(),
    disconnect: vi.fn(),
    unref: vi.fn(),
    ref: vi.fn(),
    [Symbol.dispose]: vi.fn(),
  }) as unknown as ChildProcess;

  // Emit messages asynchronously to simulate streaming
  setImmediate(() => {
    for (const msg of messages) {
      mockStdout.push(JSON.stringify(msg) + '\n');
    }
    // Signal end of stdout
    mockStdout.push(null);
    // Emit close event
    emitter.emit('close', exitCode, null);
  });

  return mockProcess;
}

/**
 * Create a mock spawner that returns a mock ChildProcess with given messages
 */
function createMockSpawner(messages: SDKMessage[], exitCode = 0): ClaudeSpawner {
  return vi.fn(() => createMockChildProcess(messages, exitCode));
}

// Sample messages for testing
const sampleSystemMessage: SDKMessage = {
  type: 'system',
  session_id: 'test-session-abc123',
  model: 'claude-sonnet-4-20250514',
  cwd: '/test/dir',
  tools: ['Read', 'Write', 'Bash'],
};

const sampleResultMessage: SDKMessage = {
  type: 'result',
  usage: {
    input_tokens: 150,
    output_tokens: 25,
  },
  cost_usd: 0.0012,
  duration_ms: 1234,
  session_id: 'test-session-abc123',
};

describe('B-10: Mode Toggle Bug Fix', () => {

  describe('AC1: Mode change notification - activeMode vs pendingMode tracking', () => {

    it('should have getActiveMode method', () => {
      const service = new ClaudeService();
      // NEW API: getActiveMode() returns the mode used in the last query
      expect(typeof service.getActiveMode).toBe('function');
    });

    it('should have getPendingMode method', () => {
      const service = new ClaudeService();
      // NEW API: getPendingMode() returns the mode user has selected
      expect(typeof service.getPendingMode).toBe('function');
    });

    it('should track activeMode as undefined before first query', () => {
      const service = new ClaudeService();
      // Before any query, activeMode should be undefined (no query has run yet)
      expect(service.getActiveMode()).toBeUndefined();
    });

    it('should update activeMode after query completes', async () => {
      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      // Set pending mode before query
      service.setPermissionMode('plan');

      // Run a query
      for await (const _ of service.sendMessage('Test')) {
        // Consume stream
      }

      // After query, activeMode should match what was used
      expect(service.getActiveMode()).toBe('plan');
    });

    it('should show pending mode differs from active mode after mode change', async () => {
      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      // Run first query in acceptEdits mode
      for await (const _ of service.sendMessage('Test')) {
        // Consume stream
      }

      expect(service.getActiveMode()).toBe('acceptEdits');
      expect(service.getPendingMode()).toBe('acceptEdits');

      // Change mode WITHOUT running another query
      service.setPermissionMode('plan');

      // Now pending differs from active
      expect(service.getActiveMode()).toBe('acceptEdits');  // Last query used acceptEdits
      expect(service.getPendingMode()).toBe('plan');        // User selected plan
    });

    it('should have hasPendingModeChange method', () => {
      const service = new ClaudeService();
      // NEW API: Returns true when pending != active
      expect(typeof service.hasPendingModeChange).toBe('function');
    });

    it('should return true for hasPendingModeChange when modes differ', async () => {
      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      // Run a query
      for await (const _ of service.sendMessage('Test')) {
        // Consume stream
      }

      // Initially no pending change
      expect(service.hasPendingModeChange()).toBe(false);

      // Change mode
      service.setPermissionMode('dangerouslySkipPermissions');

      // Now there's a pending change
      expect(service.hasPendingModeChange()).toBe(true);
    });

    it('should clear pending mode change after next query', async () => {
      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      // Run first query
      for await (const _ of service.sendMessage('First')) {
        // Consume stream
      }

      // Change mode
      service.setPermissionMode('plan');
      expect(service.hasPendingModeChange()).toBe(true);

      // Run second query - should apply the pending mode
      for await (const _ of service.sendMessage('Second')) {
        // Consume stream
      }

      // After second query, modes should match again
      expect(service.hasPendingModeChange()).toBe(false);
      expect(service.getActiveMode()).toBe('plan');
      expect(service.getPendingMode()).toBe('plan');
    });

  });

  describe('AC2: Mode button accurately reflects actual mode', () => {

    it('should have getModeState method returning both modes', () => {
      const service = new ClaudeService();
      // NEW API: Returns { activeMode, pendingMode, hasPendingChange }
      expect(typeof service.getModeState).toBe('function');
    });

    it('should return complete mode state object', async () => {
      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      // Run a query
      for await (const _ of service.sendMessage('Test')) {
        // Consume stream
      }

      const state = service.getModeState();

      expect(state).toHaveProperty('activeMode');
      expect(state).toHaveProperty('pendingMode');
      expect(state).toHaveProperty('hasPendingChange');
    });

    it('should accurately represent mode state after query then change', async () => {
      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      // Query in default mode
      for await (const _ of service.sendMessage('Test')) {
        // Consume stream
      }

      let state = service.getModeState();
      expect(state.activeMode).toBe('acceptEdits');
      expect(state.pendingMode).toBe('acceptEdits');
      expect(state.hasPendingChange).toBe(false);

      // Change to plan mode
      service.setPermissionMode('plan');

      state = service.getModeState();
      expect(state.activeMode).toBe('acceptEdits');  // Still the last query's mode
      expect(state.pendingMode).toBe('plan');        // What user selected
      expect(state.hasPendingChange).toBe(true);     // They differ!
    });

  });

  describe('AC3: All permission modes work correctly', () => {

    const allModes: PermissionMode[] = ['default', 'plan', 'acceptEdits', 'dangerouslySkipPermissions'];

    it.each(allModes)('should correctly track %s mode', async (mode) => {
      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      service.setPermissionMode(mode);

      for await (const _ of service.sendMessage('Test')) {
        // Consume stream
      }

      expect(service.getActiveMode()).toBe(mode);
      expect(service.getPendingMode()).toBe(mode);
    });

    it('should track mode transitions between all modes', async () => {
      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      // Start with default
      service.setPermissionMode('default');
      for await (const _ of service.sendMessage('Query 1')) { }
      expect(service.getActiveMode()).toBe('default');

      // Change to plan (without query yet)
      service.setPermissionMode('plan');
      expect(service.getActiveMode()).toBe('default');
      expect(service.getPendingMode()).toBe('plan');

      // Query applies plan mode
      for await (const _ of service.sendMessage('Query 2')) { }
      expect(service.getActiveMode()).toBe('plan');

      // Change to dangerouslySkipPermissions
      service.setPermissionMode('dangerouslySkipPermissions');
      expect(service.hasPendingModeChange()).toBe(true);
    });

  });

  describe('AC4: No confusion between displayed mode and actual behavior', () => {

    it('should pass correct --permission-mode flag to CLI based on pending mode', async () => {
      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      service.setPermissionMode('plan');

      for await (const _ of service.sendMessage('Test')) {
        // Consume stream
      }

      // Verify the CLI was called with the correct mode flag
      expect(mockSpawner).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--permission-mode', 'plan']),
        expect.any(Object)
      );
    });

    it('should use pending mode for query even when active mode differs', async () => {
      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      // First query sets active mode
      for await (const _ of service.sendMessage('First')) { }

      // Change pending mode
      service.setPermissionMode('dangerouslySkipPermissions');

      // Reset mock to track the second call
      mockSpawner.mockClear();

      // Second query should use pending mode
      for await (const _ of service.sendMessage('Second')) { }

      // Should NOT include --permission-mode for dangerouslySkipPermissions
      // (the flag is already handled by --dangerously-skip-permissions)
      const callArgs = mockSpawner.mock.calls[0][1] as string[];
      expect(callArgs).not.toContain('--permission-mode');
    });

  });

  describe('Edge cases', () => {

    it('should handle rapid mode changes before query', async () => {
      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      // Rapid mode changes
      service.setPermissionMode('plan');
      service.setPermissionMode('acceptEdits');
      service.setPermissionMode('dangerouslySkipPermissions');
      service.setPermissionMode('default');

      // Only the final mode should be pending
      expect(service.getPendingMode()).toBe('default');

      for await (const _ of service.sendMessage('Test')) { }

      expect(service.getActiveMode()).toBe('default');
    });

    it('should handle mode state before first query (undefined activeMode)', () => {
      const service = new ClaudeService();

      const state = service.getModeState();

      expect(state.activeMode).toBeUndefined();
      expect(state.pendingMode).toBe('acceptEdits'); // Default
      // hasPendingChange should be true since active is undefined
      expect(state.hasPendingChange).toBe(true);
    });

    it('should maintain mode state across session reset', async () => {
      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      // Run query
      for await (const _ of service.sendMessage('Test')) { }

      // Change mode
      service.setPermissionMode('plan');

      // Reset session
      service.resetSession();

      // Pending mode should persist, active mode should reset
      expect(service.getPendingMode()).toBe('plan');
      expect(service.getActiveMode()).toBeUndefined();
    });

    it('should reset activeMode on clearSession() (B-10 fix)', async () => {
      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      // Run query to set activeMode
      for await (const _ of service.sendMessage('Test')) { }

      expect(service.getActiveMode()).toBe('acceptEdits');

      // Clear session (used by IPC handler)
      service.clearSession();

      // activeMode should be cleared, just like resetSession()
      expect(service.getActiveMode()).toBeUndefined();
      // pendingMode should persist
      expect(service.getPendingMode()).toBe('acceptEdits');
    });

  });

});
