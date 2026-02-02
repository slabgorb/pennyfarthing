/**
 * MSSCI-12795: Session Context State Tracking Tests
 *
 * Tests for SessionContextState interface in ClaudeService that tracks:
 * - lastAgent: The last agent that received context injection
 * - turnCount: Number of messages in the current session
 * - injectedComponents: Components already sent in this session
 *
 * This state is the foundation for the tiered context injection system (MSSCI-12793)
 * which will use it to determine context tiers (FULL, REFRESH, HANDOFF, MINIMAL).
 *
 * Acceptance Criteria:
 * - AC1: SessionContextState interface defined with lastAgent, turnCount, injectedComponents
 * - AC2: State updated on each message in ClaudeService message flow
 * - AC3: State reset on resetSession() - clean slate for new sessions
 * - AC4: Unit tests covering state initialization, updates, and reset
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'child_process';
import { EventEmitter, Readable, Writable } from 'stream';

import {
  ClaudeService,
  SDKMessage,
  ClaudeSpawner,
  // AC1: Import the new interface - will fail until implemented
  SessionContextState,
} from '../src/claude-service.js';

/**
 * Create a mock ChildProcess that emits NDJSON messages on stdout
 * Persistent process model: emits messages on each stdin write
 */
function createMockChildProcess(messages: SDKMessage[]): ChildProcess {
  const emitter = new EventEmitter();
  const mockStdout = new Readable({ read() {} });

  const mockStdin = new Writable({
    write(chunk, _encoding, callback) {
      // Emit messages when stdin is written to
      setImmediate(() => {
        for (const msg of messages) {
          mockStdout.push(JSON.stringify(msg) + '\n');
        }
      });
      callback();
    },
  });

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
      mockStdout.push(null);
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

  return mockProcess;
}

function createMockSpawner(messages: SDKMessage[]): ClaudeSpawner {
  return vi.fn(() => createMockChildProcess(messages));
}

// Sample messages for testing
const sampleSystemMessage: SDKMessage = {
  type: 'system',
  session_id: 'test-session-12795',
  model: 'claude-sonnet-4-20250514',
  cwd: '/test/dir',
  tools: ['Read', 'Write', 'Bash'],
};

const sampleAssistantMessage: SDKMessage = {
  type: 'assistant',
  message: {
    content: [{ type: 'text', text: 'Hello! I am ready to help.' }],
  },
};

const sampleResultMessage: SDKMessage = {
  type: 'result',
  usage: {
    input_tokens: 150,
    output_tokens: 25,
  },
  cost_usd: 0.0012,
  duration_ms: 1234,
  session_id: 'test-session-12795',
};

const standardMessageSequence: SDKMessage[] = [
  sampleSystemMessage,
  sampleAssistantMessage,
  sampleResultMessage,
];

describe('MSSCI-12795: Session Context State Tracking', () => {

  describe('AC1: SessionContextState interface defined', () => {

    it('should export SessionContextState interface from claude-service', () => {
      // This test will fail at compile time if the interface is not exported
      // The import above verifies the interface exists
      const state: SessionContextState = {
        lastAgent: null,
        turnCount: 0,
        injectedComponents: [],
      };
      expect(state).toBeDefined();
    });

    it('should have lastAgent field of type string | null', () => {
      const stateWithNull: SessionContextState = {
        lastAgent: null,
        turnCount: 0,
        injectedComponents: [],
      };
      expect(stateWithNull.lastAgent).toBeNull();

      const stateWithAgent: SessionContextState = {
        lastAgent: 'dev',
        turnCount: 0,
        injectedComponents: [],
      };
      expect(stateWithAgent.lastAgent).toBe('dev');
    });

    it('should have turnCount field of type number', () => {
      const state: SessionContextState = {
        lastAgent: null,
        turnCount: 5,
        injectedComponents: [],
      };
      expect(state.turnCount).toBe(5);
      expect(typeof state.turnCount).toBe('number');
    });

    it('should have injectedComponents field of type string[]', () => {
      const state: SessionContextState = {
        lastAgent: null,
        turnCount: 0,
        injectedComponents: ['persona', 'skills', 'guides'],
      };
      expect(state.injectedComponents).toEqual(['persona', 'skills', 'guides']);
      expect(Array.isArray(state.injectedComponents)).toBe(true);
    });

  });

  describe('AC2: State updated on each message', () => {

    it('should have getContextState method on ClaudeService', () => {
      const service = new ClaudeService();
      expect(typeof service.getContextState).toBe('function');
    });

    it('should initialize with default state (null agent, 0 turns, empty components)', () => {
      const service = new ClaudeService();
      const state = service.getContextState();

      expect(state.lastAgent).toBeNull();
      expect(state.turnCount).toBe(0);
      expect(state.injectedComponents).toEqual([]);
    });

    it('should increment turnCount after each message sent', async () => {
      const mockSpawner = createMockSpawner(standardMessageSequence);
      const service = new ClaudeService({ spawner: mockSpawner });

      // Before any messages
      expect(service.getContextState().turnCount).toBe(0);

      // Send first message
      for await (const _ of service.sendMessage('First message')) {
        // Consume stream
      }

      expect(service.getContextState().turnCount).toBe(1);

      // Send second message (reuse process)
      for await (const _ of service.sendMessage('Second message')) {
        // Consume stream
      }

      expect(service.getContextState().turnCount).toBe(2);
    });

    it('should have setLastAgent method to update agent context', () => {
      const service = new ClaudeService();
      expect(typeof service.setLastAgent).toBe('function');

      service.setLastAgent('tea');
      expect(service.getContextState().lastAgent).toBe('tea');

      service.setLastAgent('dev');
      expect(service.getContextState().lastAgent).toBe('dev');
    });

    it('should have addInjectedComponent method to track sent components', () => {
      const service = new ClaudeService();
      expect(typeof service.addInjectedComponent).toBe('function');

      service.addInjectedComponent('persona');
      expect(service.getContextState().injectedComponents).toContain('persona');

      service.addInjectedComponent('skills');
      expect(service.getContextState().injectedComponents).toContain('skills');

      // Should contain both
      const state = service.getContextState();
      expect(state.injectedComponents).toEqual(['persona', 'skills']);
    });

    it('should not duplicate components when adding same component twice', () => {
      const service = new ClaudeService();

      service.addInjectedComponent('persona');
      service.addInjectedComponent('persona'); // Add again

      const state = service.getContextState();
      const personaCount = state.injectedComponents.filter(c => c === 'persona').length;
      expect(personaCount).toBe(1);
    });

    it('should track state across multiple messages in same session', async () => {
      const mockSpawner = createMockSpawner(standardMessageSequence);
      const service = new ClaudeService({ spawner: mockSpawner });

      // Set initial agent
      service.setLastAgent('sm');
      service.addInjectedComponent('persona');

      // First message
      for await (const _ of service.sendMessage('Hello')) {
        // Consume
      }

      let state = service.getContextState();
      expect(state.lastAgent).toBe('sm');
      expect(state.turnCount).toBe(1);
      expect(state.injectedComponents).toContain('persona');

      // Add more components, change agent
      service.setLastAgent('dev');
      service.addInjectedComponent('skills');

      // Second message
      for await (const _ of service.sendMessage('Continue')) {
        // Consume
      }

      state = service.getContextState();
      expect(state.lastAgent).toBe('dev');
      expect(state.turnCount).toBe(2);
      expect(state.injectedComponents).toEqual(['persona', 'skills']);
    });

  });

  describe('AC3: State reset on resetSession()', () => {

    it('should clear lastAgent to null on resetSession()', async () => {
      const mockSpawner = createMockSpawner(standardMessageSequence);
      const service = new ClaudeService({ spawner: mockSpawner });

      service.setLastAgent('reviewer');
      expect(service.getContextState().lastAgent).toBe('reviewer');

      service.resetSession();

      expect(service.getContextState().lastAgent).toBeNull();
    });

    it('should reset turnCount to 0 on resetSession()', async () => {
      const mockSpawner = createMockSpawner(standardMessageSequence);
      const service = new ClaudeService({ spawner: mockSpawner });

      // Send some messages to increment turn count
      for await (const _ of service.sendMessage('Message 1')) {
        // Consume
      }
      for await (const _ of service.sendMessage('Message 2')) {
        // Consume
      }

      expect(service.getContextState().turnCount).toBe(2);

      service.resetSession();

      expect(service.getContextState().turnCount).toBe(0);
    });

    it('should clear injectedComponents to empty array on resetSession()', async () => {
      const service = new ClaudeService();

      service.addInjectedComponent('persona');
      service.addInjectedComponent('skills');
      service.addInjectedComponent('guides');

      expect(service.getContextState().injectedComponents).toHaveLength(3);

      service.resetSession();

      expect(service.getContextState().injectedComponents).toEqual([]);
    });

    it('should reset all state fields together on resetSession()', async () => {
      const mockSpawner = createMockSpawner(standardMessageSequence);
      const service = new ClaudeService({ spawner: mockSpawner });

      // Build up state
      service.setLastAgent('architect');
      service.addInjectedComponent('persona');
      service.addInjectedComponent('skills');

      for await (const _ of service.sendMessage('Test')) {
        // Consume
      }

      // Verify state is set
      let state = service.getContextState();
      expect(state.lastAgent).toBe('architect');
      expect(state.turnCount).toBe(1);
      expect(state.injectedComponents.length).toBeGreaterThan(0);

      // Reset
      service.resetSession();

      // Verify all fields are reset
      state = service.getContextState();
      expect(state.lastAgent).toBeNull();
      expect(state.turnCount).toBe(0);
      expect(state.injectedComponents).toEqual([]);
    });

    it('should also reset state on clearSession() (alias for resetSession)', async () => {
      const mockSpawner = createMockSpawner(standardMessageSequence);
      const service = new ClaudeService({ spawner: mockSpawner });

      service.setLastAgent('pm');
      service.addInjectedComponent('guides');

      for await (const _ of service.sendMessage('Test')) {
        // Consume
      }

      // Use clearSession instead of resetSession
      service.clearSession();

      const state = service.getContextState();
      expect(state.lastAgent).toBeNull();
      expect(state.turnCount).toBe(0);
      expect(state.injectedComponents).toEqual([]);
    });

  });

  describe('AC4: Additional edge cases and integration', () => {

    it('should preserve context state when reusing process (persistent mode)', async () => {
      const mockSpawner = createMockSpawner(standardMessageSequence);
      const service = new ClaudeService({ spawner: mockSpawner });

      service.setLastAgent('tea');
      service.addInjectedComponent('test-cases');

      // First message
      for await (const _ of service.sendMessage('First')) {
        // Consume
      }

      // Reset spawner call count
      mockSpawner.mockClear();

      // Second message - should reuse process
      for await (const _ of service.sendMessage('Second')) {
        // Consume
      }

      // Verify process was reused
      expect(mockSpawner).not.toHaveBeenCalled();

      // Verify state persisted
      const state = service.getContextState();
      expect(state.lastAgent).toBe('tea');
      expect(state.turnCount).toBe(2);
      expect(state.injectedComponents).toContain('test-cases');
    });

    it('should return immutable state from getContextState', () => {
      const service = new ClaudeService();

      service.setLastAgent('dev');
      service.addInjectedComponent('persona');

      const state1 = service.getContextState();
      const state2 = service.getContextState();

      // Should return new objects each time (not same reference)
      expect(state1).not.toBe(state2);

      // Modifying returned state should not affect internal state
      state1.turnCount = 999;
      state1.injectedComponents.push('hacked');

      const state3 = service.getContextState();
      expect(state3.turnCount).toBe(0);
      expect(state3.injectedComponents).not.toContain('hacked');
    });

    it('should handle setLastAgent with null to clear agent', () => {
      const service = new ClaudeService();

      service.setLastAgent('reviewer');
      expect(service.getContextState().lastAgent).toBe('reviewer');

      service.setLastAgent(null);
      expect(service.getContextState().lastAgent).toBeNull();
    });

    it('should handle hasInjectedComponent query method', () => {
      const service = new ClaudeService();
      expect(typeof service.hasInjectedComponent).toBe('function');

      expect(service.hasInjectedComponent('persona')).toBe(false);

      service.addInjectedComponent('persona');
      expect(service.hasInjectedComponent('persona')).toBe(true);
      expect(service.hasInjectedComponent('skills')).toBe(false);
    });

    it('should handle clearInjectedComponents method', () => {
      const service = new ClaudeService();
      expect(typeof service.clearInjectedComponents).toBe('function');

      service.addInjectedComponent('persona');
      service.addInjectedComponent('skills');
      service.addInjectedComponent('guides');

      expect(service.getContextState().injectedComponents).toHaveLength(3);

      service.clearInjectedComponents();

      expect(service.getContextState().injectedComponents).toEqual([]);
    });

  });

});
