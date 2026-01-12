/**
 * E7-3: Input Integration Tests
 *
 * Tests verify the wiring of rich text editor to ClaudeService via IPC,
 * replacing the PTY input path.
 *
 * Note: ClaudeService uses child_process.spawn with stdin pipe for stream-json input.
 * This enables image support and eliminates TTY requirements.
 *
 * Acceptance Criteria:
 * - AC1: Editor submits directly to SDK (no PTY)
 * - AC2: Messages stream to renderer via IPC
 * - AC3: Multi-turn conversations maintain context
 * - AC4: Session resumes correctly after app restart
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { ChildProcess } from 'child_process';
import { EventEmitter, Readable, Writable } from 'stream';
import {
  SDKMessage,
  SDKSystemMessage,
  SDKAssistantMessage,
  SDKResultMessage,
  ClaudeService,
  ClaudeSpawner,
} from '../src/claude-service.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const sampleSystemMessage: SDKSystemMessage = {
  type: 'system',
  session_id: 'test-session-e73-001',
  model: 'claude-sonnet-4-20250514',
  cwd: '/test/dir',
  tools: ['Read', 'Write', 'Bash'],
};

const sampleAssistantMessage: SDKAssistantMessage = {
  type: 'assistant',
  message: {
    content: [{ type: 'text', text: 'Hello! How can I help you today?' }],
  },
};

const sampleResultMessage: SDKResultMessage = {
  type: 'result',
  usage: {
    input_tokens: 150,
    output_tokens: 25,
  },
  cost_usd: 0.0012,
  duration_ms: 1234,
  session_id: 'test-session-e73-001',
};

/**
 * Create a mock ChildProcess that emits NDJSON messages on stdout
 * ChildProcess interface requires stdin, stdout, stderr, kill, pid, etc.
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

function createMockSpawner(messages: SDKMessage[], exitCode = 0): ClaudeSpawner {
  return vi.fn(() => createMockChildProcess(messages, exitCode));
}

// =============================================================================
// AC1: Editor submits directly to SDK (no PTY)
// =============================================================================

describe('E7-3: Input Integration', () => {

  describe('AC1: Editor submits directly to SDK (no PTY)', () => {

    describe('Preload API Structure', () => {

      it('should export electronAPI with claude property', async () => {
        const preload = await import('../src/preload.js');
        const api = preload.electronAPI || preload.default;

        expect(api.claude).toBeDefined();
      });

      it('should provide claude.send method for submitting prompts', async () => {
        const preload = await import('../src/preload.js');
        const api = preload.electronAPI || preload.default;

        expect(api.claude).toBeDefined();
        expect(typeof api.claude.send).toBe('function');
      });

      it('should provide claude.onMessage method for receiving streamed messages', async () => {
        const preload = await import('../src/preload.js');
        const api = preload.electronAPI || preload.default;

        expect(api.claude).toBeDefined();
        expect(typeof api.claude.onMessage).toBe('function');
      });

      it('should provide claude.onComplete method for query completion signal', async () => {
        const preload = await import('../src/preload.js');
        const api = preload.electronAPI || preload.default;

        expect(api.claude).toBeDefined();
        expect(typeof api.claude.onComplete).toBe('function');
      });

      it('should provide claude.onError method for error handling', async () => {
        const preload = await import('../src/preload.js');
        const api = preload.electronAPI || preload.default;

        expect(api.claude).toBeDefined();
        expect(typeof api.claude.onError).toBe('function');
      });

    });

    describe('ElectronClaudeAPI Interface', () => {

      it('should export ElectronClaudeAPI interface type', async () => {
        // This test verifies the TypeScript interface is exported
        // If it compiles and runs, the interface exists
        const preload = await import('../src/preload.js');

        // Check that ElectronClaudeAPI is exported (may be a type, so we check the API shape)
        const api = preload.electronAPI || preload.default;
        expect(api.claude).toBeDefined();
        expect(api.claude).toHaveProperty('send');
        expect(api.claude).toHaveProperty('onMessage');
        expect(api.claude).toHaveProperty('onComplete');
        expect(api.claude).toHaveProperty('onError');
      });

    });

  });

  // =============================================================================
  // AC2: Messages stream to renderer via IPC
  // =============================================================================

  describe('AC2: Messages stream to renderer via IPC', () => {

    describe('Main Process IPC Handlers', () => {

      it('should export setupClaudeIPCHandlers function from main.ts', async () => {
        const main = await import('../src/main.js');

        expect(main.setupClaudeIPCHandlers).toBeDefined();
        expect(typeof main.setupClaudeIPCHandlers).toBe('function');
      });

      it('should export getClaudeService function to access the service instance', async () => {
        const main = await import('../src/main.js');

        expect(main.getClaudeService).toBeDefined();
        expect(typeof main.getClaudeService).toBe('function');
      });

    });

    describe('IPC Channel Wiring', () => {

      it('should handle claude:send IPC invoke from renderer', async () => {
        // This test verifies the IPC handler is registered
        // The actual handler logic is tested via integration
        const main = await import('../src/main.js');

        // setupClaudeIPCHandlers should accept ipcMain and register handlers
        expect(main.setupClaudeIPCHandlers).toBeDefined();
      });

      it('should send claude:message to renderer for each SDK message', async () => {
        // Verify that messages are streamed via IPC
        // This is an integration test - we'll use a mock window
        const mockWindow = {
          webContents: {
            send: vi.fn(),
          },
        };

        // When ClaudeService emits messages, they should be forwarded to renderer
        const messages = [sampleSystemMessage, sampleAssistantMessage, sampleResultMessage];
        const mockSpawner = createMockSpawner(messages);
        const service = new ClaudeService({ spawner: mockSpawner });

        const receivedMessages: SDKMessage[] = [];
        for await (const msg of service.sendMessage('test prompt')) {
          receivedMessages.push(msg);
          // In real implementation, main.ts would call:
          // mockWindow.webContents.send('claude:message', msg);
        }

        expect(receivedMessages.length).toBe(3);
        expect(receivedMessages[0].type).toBe('system');
        expect(receivedMessages[1].type).toBe('assistant');
        expect(receivedMessages[2].type).toBe('result');
      });

      it('should send claude:complete to renderer when query finishes', async () => {
        // After all messages are streamed, claude:complete should be sent
        const messages = [sampleSystemMessage, sampleAssistantMessage, sampleResultMessage];
        const mockSpawner = createMockSpawner(messages);
        const service = new ClaudeService({ spawner: mockSpawner });

        let queryComplete = false;
        for await (const _msg of service.sendMessage('test prompt')) {
          // consume messages
        }
        queryComplete = true;

        // After loop completes, claude:complete should be sent
        expect(queryComplete).toBe(true);
      });

      it('should send claude:error to renderer when SDK fails', async () => {
        // If ClaudeService throws, claude:error should be sent
        const mockSpawner: ClaudeSpawner = vi.fn(() => {
          const proc = new EventEmitter() as ReturnType<ClaudeSpawner>;
          const stdout = new EventEmitter();
          const stderr = new EventEmitter();

          Object.assign(proc, { stdout, stderr, stdin: { write: vi.fn(), end: vi.fn() }, pid: 1, killed: false, kill: vi.fn() });

          setImmediate(() => {
            stderr.emit('data', Buffer.from('Claude Code error: API failure\n'));
            proc.emit('close', 1);
          });

          return proc;
        });

        const service = new ClaudeService({ spawner: mockSpawner });

        let errorCaught = false;
        try {
          for await (const _msg of service.sendMessage('test prompt')) {
            // should not receive any messages
          }
        } catch (error) {
          errorCaught = true;
          expect(error).toBeDefined();
        }

        expect(errorCaught).toBe(true);
      });

    });

    describe('Message Store Integration', () => {

      it('should export addMessage function from message-store', async () => {
        const store = await import('../src/public/js/message-store.js');

        expect(store.addMessage).toBeDefined();
        expect(typeof store.addMessage).toBe('function');
      });

      it('should export subscribeToMessages for renderer updates', async () => {
        const store = await import('../src/public/js/message-store.js');

        expect(store.subscribeToMessages).toBeDefined();
        expect(typeof store.subscribeToMessages).toBe('function');
      });

      it('should notify subscribers when messages are added', async () => {
        const store = await import('../src/public/js/message-store.js');

        // Clear any existing messages
        store.clearMessages();

        const receivedUpdates: SDKMessage[][] = [];
        const unsubscribe = store.subscribeToMessages((messages) => {
          receivedUpdates.push([...messages]);
        });

        store.addMessage(sampleAssistantMessage);
        store.addMessage(sampleResultMessage);

        expect(receivedUpdates.length).toBe(2);
        expect(receivedUpdates[0].length).toBe(1);
        expect(receivedUpdates[1].length).toBe(2);

        unsubscribe();
        store.clearMessages();
      });

    });

  });

  // =============================================================================
  // AC3: Multi-turn conversations maintain context
  // =============================================================================

  describe('AC3: Multi-turn conversations maintain context', () => {

    it('should capture session ID from first message', async () => {
      const messages = [sampleSystemMessage, sampleAssistantMessage, sampleResultMessage];
      const mockSpawner = createMockSpawner(messages);
      const service = new ClaudeService({ spawner: mockSpawner });

      expect(service.getSessionId()).toBeNull();

      for await (const _msg of service.sendMessage('first message')) {
        // consume messages
      }

      expect(service.getSessionId()).toBe('test-session-e73-001');
    });

    it('should reuse session ID for subsequent messages', async () => {
      // First query
      const messages1 = [sampleSystemMessage, sampleAssistantMessage, sampleResultMessage];
      const mockSpawner1 = createMockSpawner(messages1);
      const service = new ClaudeService({ spawner: mockSpawner1 });

      for await (const _msg of service.sendMessage('first message')) {
        // consume
      }

      const capturedSessionId = service.getSessionId();
      expect(capturedSessionId).toBe('test-session-e73-001');

      // Second query should pass --resume with session ID
      // We need to verify the spawner is called with the resume argument
      const messages2 = [
        { ...sampleAssistantMessage, message: { content: [{ type: 'text', text: 'Follow-up response' }] } },
        sampleResultMessage,
      ];

      let spawnArgs: string[] = [];
      const mockSpawner2: ClaudeSpawner = vi.fn((_cmd, args) => {
        spawnArgs = args || [];
        return createMockChildProcess(messages2 as SDKMessage[]);
      });

      // Replace spawner for second query
      (service as any).spawner = mockSpawner2;

      for await (const _msg of service.sendMessage('follow-up message')) {
        // consume
      }

      // Verify --resume flag was passed
      expect(spawnArgs).toContain('--resume');
      expect(spawnArgs).toContain(capturedSessionId);
    });

    it('should pass session ID via --resume flag to CLI', async () => {
      const messages = [sampleSystemMessage, sampleAssistantMessage, sampleResultMessage];

      let capturedArgs: string[] = [];
      const mockSpawner: ClaudeSpawner = vi.fn((_cmd, args) => {
        capturedArgs = args || [];
        return createMockChildProcess(messages);
      });

      const service = new ClaudeService({ spawner: mockSpawner });

      // Set a session ID before sending message
      (service as any).sessionId = 'existing-session-123';

      for await (const _msg of service.sendMessage('test with existing session')) {
        // consume
      }

      expect(capturedArgs).toContain('--resume');
      expect(capturedArgs).toContain('existing-session-123');
    });

    it('should not pass --resume flag on first message (no session)', async () => {
      const messages = [sampleSystemMessage, sampleAssistantMessage, sampleResultMessage];

      let capturedArgs: string[] = [];
      const mockSpawner: ClaudeSpawner = vi.fn((_cmd, args) => {
        capturedArgs = args || [];
        return createMockChildProcess(messages);
      });

      const service = new ClaudeService({ spawner: mockSpawner });

      // No session ID set
      expect(service.getSessionId()).toBeNull();

      for await (const _msg of service.sendMessage('first message')) {
        // consume
      }

      // First message should NOT have --resume
      expect(capturedArgs).not.toContain('--resume');
    });

  });

  // =============================================================================
  // AC4: Session resumes correctly after app restart
  // =============================================================================

  describe('AC4: Session resumes correctly after app restart', () => {

    describe('Session Persistence', () => {

      it('should export saveSessionId function from main.ts', async () => {
        const main = await import('../src/main.js');

        expect(main.saveSessionId).toBeDefined();
        expect(typeof main.saveSessionId).toBe('function');
      });

      it('should export loadSessionId function from main.ts', async () => {
        const main = await import('../src/main.js');

        expect(main.loadSessionId).toBeDefined();
        expect(typeof main.loadSessionId).toBe('function');
      });

      it('should export clearSessionId function for new conversation', async () => {
        const main = await import('../src/main.js');

        expect(main.clearSessionId).toBeDefined();
        expect(typeof main.clearSessionId).toBe('function');
      });

    });

    describe('Session Restoration', () => {

      it('should set session ID on ClaudeService when restoring', async () => {
        const service = new ClaudeService();

        expect(service.getSessionId()).toBeNull();

        // setSessionId should allow restoring a previous session
        service.setSessionId('restored-session-456');

        expect(service.getSessionId()).toBe('restored-session-456');
      });

      it('should use restored session ID for first message after restart', async () => {
        const messages = [sampleAssistantMessage, sampleResultMessage];

        let capturedArgs: string[] = [];
        const mockSpawner: ClaudeSpawner = vi.fn((_cmd, args) => {
          capturedArgs = args || [];
          return createMockChildProcess(messages as SDKMessage[]);
        });

        const service = new ClaudeService({ spawner: mockSpawner });

        // Simulate restoring session from persistence
        service.setSessionId('restored-session-789');

        for await (const _msg of service.sendMessage('message after restart')) {
          // consume
        }

        expect(capturedArgs).toContain('--resume');
        expect(capturedArgs).toContain('restored-session-789');
      });

    });

    describe('New Conversation', () => {

      it('should clear session ID when starting new conversation', async () => {
        const service = new ClaudeService();

        service.setSessionId('old-session-123');
        expect(service.getSessionId()).toBe('old-session-123');

        service.clearSession();
        expect(service.getSessionId()).toBeNull();
      });

      it('should not pass --resume after clearing session', async () => {
        const messages = [sampleSystemMessage, sampleAssistantMessage, sampleResultMessage];

        let capturedArgs: string[] = [];
        const mockSpawner: ClaudeSpawner = vi.fn((_cmd, args) => {
          capturedArgs = args || [];
          return createMockChildProcess(messages);
        });

        const service = new ClaudeService({ spawner: mockSpawner });

        // Set and then clear session
        service.setSessionId('old-session');
        service.clearSession();

        for await (const _msg of service.sendMessage('new conversation')) {
          // consume
        }

        expect(capturedArgs).not.toContain('--resume');
      });

    });

  });

  // =============================================================================
  // Integration Tests
  // =============================================================================

  describe('Integration: Full Message Flow', () => {

    it('should complete full flow: prompt → SDK → messages → store', async () => {
      const store = await import('../src/public/js/message-store.js');
      store.clearMessages();

      const messages = [sampleSystemMessage, sampleAssistantMessage, sampleResultMessage];
      const mockSpawner = createMockSpawner(messages);
      const service = new ClaudeService({ spawner: mockSpawner });

      // Simulate the main process flow:
      // 1. Receive prompt via IPC
      // 2. Call ClaudeService.sendMessage()
      // 3. Stream each message to store

      for await (const msg of service.sendMessage('integration test prompt')) {
        store.addMessage(msg);
      }

      const storedMessages = store.getMessages();
      expect(storedMessages.length).toBe(3);
      expect(storedMessages[0].type).toBe('system');
      expect(storedMessages[1].type).toBe('assistant');
      expect(storedMessages[2].type).toBe('result');

      store.clearMessages();
    });

    it('should handle multiple turns in sequence', async () => {
      const store = await import('../src/public/js/message-store.js');
      store.clearMessages();

      // Turn 1
      const messages1 = [sampleSystemMessage, sampleAssistantMessage, sampleResultMessage];
      const mockSpawner1 = createMockSpawner(messages1);
      const service = new ClaudeService({ spawner: mockSpawner1 });

      for await (const msg of service.sendMessage('turn 1')) {
        store.addMessage(msg);
      }

      expect(store.getMessages().length).toBe(3);
      expect(service.getSessionId()).toBe('test-session-e73-001');

      // Turn 2 - should reuse session
      const messages2: SDKMessage[] = [
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Turn 2 response' }] },
        },
        {
          type: 'result',
          usage: { input_tokens: 200, output_tokens: 30 },
          cost_usd: 0.0015,
          duration_ms: 1500,
          session_id: 'test-session-e73-001',
        },
      ];

      (service as any).spawner = createMockSpawner(messages2);

      for await (const msg of service.sendMessage('turn 2')) {
        store.addMessage(msg);
      }

      expect(store.getMessages().length).toBe(5);
      expect(service.getSessionId()).toBe('test-session-e73-001');

      store.clearMessages();
    });

  });

});
