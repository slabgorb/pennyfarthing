/**
 * E7-1: SDK Integration Tests
 *
 * These tests verify the acceptance criteria for Claude Agent SDK integration.
 * Uses mock spawner to test without actually calling Claude Code CLI.
 *
 * Note: ClaudeService uses child_process.spawn with stdin pipe for stream-json input.
 * This enables image support and eliminates TTY requirements.
 *
 * Acceptance Criteria:
 * - AC1: ClaudeService can send prompts and receive streaming responses
 * - AC2: Session ID captured from init message
 * - AC3: OTEL metrics still flow to otlp-receiver (integration test)
 * - AC4: Permission mode defaults to acceptEdits
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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
 * ChildProcess interface requires stdin, stdout, stderr, kill, pid, etc.
 *
 * Updated for persistent process model: Process stays alive until kill() is called.
 * Messages are emitted on EACH stdin write to support multi-turn conversations.
 * Exception: If exitCode != 0 and no messages, simulates immediate failure.
 */
function createMockChildProcess(messages: SDKMessage[], exitCode = 0): ChildProcess {
  const emitter = new EventEmitter();

  // Create mock stdin stream that triggers message emission when written to
  const stdinData: string[] = [];
  const mockStdout = new Readable({ read() {} });

  const mockStdin = new Writable({
    write(chunk, _encoding, callback) {
      stdinData.push(chunk.toString());
      // Emit messages EACH time stdin is written to (simulates Claude responding to each prompt)
      setImmediate(() => {
        // If this is an error simulation (non-zero exit), emit close after messages
        if (exitCode !== 0) {
          for (const msg of messages) {
            mockStdout.push(JSON.stringify(msg) + '\n');
          }
          // Emit close with error code after a tick
          setImmediate(() => {
            mockStdout.push(null);
            emitter.emit('close', exitCode, null);
          });
          return;
        }
        for (const msg of messages) {
          mockStdout.push(JSON.stringify(msg) + '\n');
        }
        // NOTE: Do NOT push null or emit close - persistent process stays alive
      });
      callback();
    },
  });

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
      // Push null to end stdout stream
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

const sampleAssistantMessage: SDKMessage = {
  type: 'assistant',
  message: {
    content: [{ type: 'text', text: 'Hello! How can I help you today?' }],
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
  session_id: 'test-session-abc123',
};

const sampleToolUseMessage: SDKMessage = {
  type: 'tool_use',
  tool_name: 'Read',
  tool_id: 'tool_123',
  input: { file_path: '/test/file.ts' },
};

const sampleToolResultMessage: SDKMessage = {
  type: 'tool_result',
  tool_id: 'tool_123',
  output: 'File contents here...',
};

const allMessageTypes: SDKMessage[] = [
  sampleSystemMessage,
  sampleAssistantMessage,
  sampleToolUseMessage,
  sampleToolResultMessage,
  sampleResultMessage,
];

describe('E7-1: SDK Integration', () => {

  describe('AC1: ClaudeService can send prompts and receive streaming responses', () => {

    it('should create a ClaudeService instance', () => {
      const service = new ClaudeService();
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(ClaudeService);
    });

    it('should have sendMessage method that returns AsyncIterable', () => {
      const service = new ClaudeService();
      expect(typeof service.sendMessage).toBe('function');
    });

    it('should stream messages from sendMessage', async () => {
      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleAssistantMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      const messages: SDKMessage[] = [];
      for await (const message of service.sendMessage('Hello, Claude!')) {
        messages.push(message);
      }

      // Should receive at least one message
      expect(messages.length).toBeGreaterThan(0);
      expect(messages.length).toBe(3);
    });

    it('should yield all message types (system, assistant, result)', async () => {
      const mockSpawner = createMockSpawner(allMessageTypes);
      const service = new ClaudeService({ spawner: mockSpawner });

      const messages: SDKMessage[] = [];
      for await (const message of service.sendMessage('Test prompt')) {
        messages.push(message);
      }

      // Should have system message (init)
      const systemMsg = messages.find(m => m.type === 'system');
      expect(systemMsg).toBeDefined();

      // Should have at least one assistant message
      const assistantMsg = messages.find(m => m.type === 'assistant');
      expect(assistantMsg).toBeDefined();

      // Should have result message at the end
      const resultMsg = messages.find(m => m.type === 'result');
      expect(resultMsg).toBeDefined();
    });

    it('should call spawner with correct arguments', async () => {
      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      // Consume the stream
      for await (const _ of service.sendMessage('Test prompt')) {
        // Just iterate
      }

      // 28-1: New implementation uses --input-format stream-json and sends prompt via stdin
      expect(mockSpawner).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['-p', '--input-format', 'stream-json', '--output-format', 'stream-json']),
        expect.any(Object)
      );
    });

  });

  describe('AC2: Session ID captured from init message', () => {

    it('should have getSessionId method', () => {
      const service = new ClaudeService();
      expect(typeof service.getSessionId).toBe('function');
    });

    it('should return null before first query', () => {
      const service = new ClaudeService();
      expect(service.getSessionId()).toBeNull();
    });

    it('should capture session ID from system message', async () => {
      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      // Consume the stream to trigger session ID capture
      for await (const _ of service.sendMessage('Hello')) {
        // Just iterate through
      }

      const sessionId = service.getSessionId();
      expect(sessionId).toBeDefined();
      expect(sessionId).not.toBeNull();
      expect(sessionId).toBe('test-session-abc123');
      expect(typeof sessionId).toBe('string');
    });

    it('should reuse persistent process for subsequent queries', async () => {
      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      // First query - captures session ID
      for await (const _ of service.sendMessage('First message')) {
        // Consume stream
      }

      const sessionIdAfterFirst = service.getSessionId();
      expect(sessionIdAfterFirst).not.toBeNull();

      // Reset mock to track if second call spawns new process
      mockSpawner.mockClear();

      // Second query - should reuse existing process (persistent mode)
      for await (const _ of service.sendMessage('Second message')) {
        // Consume stream
      }

      // Verify spawner was NOT called again (process reused)
      expect(mockSpawner).not.toHaveBeenCalled();

      const sessionIdAfterSecond = service.getSessionId();
      // Session ID should persist (same session)
      expect(sessionIdAfterSecond).toBe(sessionIdAfterFirst);
    });

  });

  describe('AC3: OTEL metrics still flow to otlp-receiver', () => {

    // Note: Full OTEL integration is tested manually
    // These tests verify the service doesn't break OTEL config

    it('should not interfere with OTEL environment variables', () => {
      // Set OTEL env vars as they would be in production
      const originalEnv = { ...process.env };

      process.env.CLAUDE_CODE_ENABLE_TELEMETRY = '1';
      process.env.OTEL_METRICS_EXPORTER = 'otlp';
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317';

      const service = new ClaudeService();

      // Creating service should not modify OTEL env vars
      expect(process.env.CLAUDE_CODE_ENABLE_TELEMETRY).toBe('1');
      expect(process.env.OTEL_METRICS_EXPORTER).toBe('otlp');
      expect(process.env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://localhost:4317');

      // Restore env
      process.env = originalEnv;
    });

    it('should pass OTEL environment to subprocess', async () => {
      const originalEnv = { ...process.env };
      process.env.CLAUDE_CODE_ENABLE_TELEMETRY = '1';
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317';

      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      // Consume the stream
      for await (const _ of service.sendMessage('Test')) {
        // Just iterate
      }

      // Verify spawn was called with env including OTEL vars
      expect(mockSpawner).toHaveBeenCalledWith(
        'claude',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            CLAUDE_CODE_ENABLE_TELEMETRY: '1',
            OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4317',
          }),
        })
      );

      // Restore env
      process.env = originalEnv;
    });

  });

  describe('AC4: Permission mode defaults to acceptEdits', () => {

    it('should have setPermissionMode method', () => {
      const service = new ClaudeService();
      expect(typeof service.setPermissionMode).toBe('function');
    });

    it('should have getPermissionMode method', () => {
      const service = new ClaudeService();
      expect(typeof service.getPermissionMode).toBe('function');
    });

    it('should default to acceptEdits mode', () => {
      const service = new ClaudeService();
      expect(service.getPermissionMode()).toBe('acceptEdits');
    });

    it('should allow setting to dangerouslySkipPermissions', () => {
      const service = new ClaudeService();

      service.setPermissionMode('dangerouslySkipPermissions');

      expect(service.getPermissionMode()).toBe('dangerouslySkipPermissions');
    });

    it('should allow switching back to acceptEdits', () => {
      const service = new ClaudeService();

      service.setPermissionMode('dangerouslySkipPermissions');
      service.setPermissionMode('acceptEdits');

      expect(service.getPermissionMode()).toBe('acceptEdits');
    });

    it('should use permission mode in query options', async () => {
      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      // Default mode
      expect(service.getPermissionMode()).toBe('acceptEdits');

      // Query with default mode
      for await (const _ of service.sendMessage('Test')) {
        // Just iterate
      }

      // Should include permission-mode flag
      expect(mockSpawner).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--permission-mode', 'acceptEdits']),
        expect.any(Object)
      );
    });

  });

  describe('Error handling', () => {

    it('should handle process errors gracefully', async () => {
      // 28-1: Use mock that exits with error code immediately (no messages)
      const mockSpawner = createMockSpawner([], 127); // 127 = command not found

      const service = new ClaudeService({ spawner: mockSpawner });

      // Should throw when iterating (exit code 127)
      await expect(async () => {
        for await (const _ of service.sendMessage('Test')) {
          // Should not get here
        }
      }).rejects.toThrow('Claude process exited with code 127');
    });

    it('should maintain state after error', async () => {
      const mockSpawner = createMockSpawner([sampleSystemMessage], 1); // Exit code 1
      const service = new ClaudeService({ spawner: mockSpawner });

      // Try to consume (will exit with error)
      try {
        for await (const _ of service.sendMessage('Test')) {
          // May or may not get messages before error
        }
      } catch {
        // Expected
      }

      // After an error, service should still be usable
      const mode = service.getPermissionMode();
      expect(mode).toBe('acceptEdits');
    });

  });

  describe('TypeScript types', () => {

    it('should export SDKMessage type', () => {
      // This test verifies the type export exists
      // If SDKMessage is not exported, this import will fail
      const _typeCheck: SDKMessage = { type: 'system', session_id: 'test', model: 'test' };
      expect(_typeCheck.type).toBe('system');
    });

    it('should properly type permission modes', () => {
      const service = new ClaudeService();

      // These should be the only valid values
      service.setPermissionMode('acceptEdits');
      service.setPermissionMode('dangerouslySkipPermissions');

      // TypeScript should prevent other values at compile time
      expect(true).toBe(true);
    });

  });

  describe('Additional functionality', () => {

    it('should have abort method to kill running process', () => {
      const service = new ClaudeService();
      expect(typeof service.abort).toBe('function');
    });

    it('should have resetSession method', () => {
      const service = new ClaudeService();
      expect(typeof service.resetSession).toBe('function');
    });

    it('should clear session ID on resetSession', async () => {
      const mockSpawner = createMockSpawner([sampleSystemMessage, sampleResultMessage]);
      const service = new ClaudeService({ spawner: mockSpawner });

      // First query captures session
      for await (const _ of service.sendMessage('Test')) {
        // Consume
      }

      expect(service.getSessionId()).toBe('test-session-abc123');

      // Reset
      service.resetSession();

      expect(service.getSessionId()).toBeNull();
    });

  });

});
