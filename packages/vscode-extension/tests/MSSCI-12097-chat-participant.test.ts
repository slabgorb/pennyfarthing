/**
 * MSSCI-12097: VS Code Chat API integration for Claude conversations
 *
 * BDD-style tests implementing the Chat API integration.
 * Tests are written to FAIL until Dev implements the chat participant.
 *
 * Acceptance Criteria:
 * - AC1: @pennyfarthing appears in VS Code chat view
 * - AC2: User can send messages via chat input
 * - AC3: Assistant responses stream in real-time from Claude
 * - AC4: Slash commands (/sm, /tea, etc.) invoke agent switches
 * - AC5: Tool use displays with collapsible details
 * - AC6: Works alongside GitHub Copilot Chat
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// ============================================================================
// VS Code Chat API Mocks
// ============================================================================

// Mock ChatResponseStream for streaming responses
class MockChatResponseStream {
  private chunks: string[] = [];

  markdown = vi.fn((content: string) => {
    this.chunks.push(content);
  });

  progress = vi.fn((message: string) => {
    // Progress indicator
  });

  reference = vi.fn((uri: any, options?: any) => {
    // Reference to file/symbol
  });

  button = vi.fn((command: any) => {
    // Action button
  });

  getChunks(): string[] {
    return this.chunks;
  }
}

// Mock ChatRequest
interface MockChatRequest {
  prompt: string;
  command?: string;
  references?: any[];
  location?: any;
}

// Mock ChatContext with conversation history
interface MockChatContext {
  history: Array<{
    participant: string;
    request?: { prompt: string };
    response?: string[];
  }>;
}

// Mock CancellationToken
const mockCancellationToken = {
  isCancellationRequested: false,
  onCancellationRequested: vi.fn(),
};

// Mock ChatParticipant
class MockChatParticipant {
  id: string;
  displayName?: string;
  iconPath?: any;
  subCommands: Array<{ name: string; description: string }> = [];
  private handler: any;
  private disposed = false;

  constructor(id: string, handler: any) {
    this.id = id;
    this.handler = handler;
  }

  dispose = vi.fn(() => {
    this.disposed = true;
  });

  isDisposed(): boolean {
    return this.disposed;
  }

  async handleRequest(
    request: MockChatRequest,
    context: MockChatContext,
    response: MockChatResponseStream,
    token: typeof mockCancellationToken
  ) {
    return this.handler(request, context, response, token);
  }
}

// Mock vscode.chat namespace
const mockChat = {
  createChatParticipant: vi.fn(
    (id: string, handler: any) => new MockChatParticipant(id, handler)
  ),
};

// Mock VS Code EventEmitter
class MockEventEmitter<T> {
  private listeners: ((e: T) => void)[] = [];
  fire = vi.fn((data?: T) => {
    this.listeners.forEach((listener) => listener(data as T));
  });
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => {} };
  };
  dispose = vi.fn();
}

const mockOutputChannel = {
  appendLine: vi.fn(),
  dispose: vi.fn(),
  show: vi.fn(),
};

const mockTerminal = {
  sendText: vi.fn(),
  show: vi.fn(),
  dispose: vi.fn(),
};

const mockWorkspaceFolder = {
  uri: { fsPath: '/mock/workspace' },
  name: 'mock-workspace',
  index: 0,
};

// Full VS Code mock including chat API
const mockVscode = {
  chat: mockChat,
  window: {
    createOutputChannel: vi.fn(() => mockOutputChannel),
    activeTerminal: mockTerminal,
    terminals: [mockTerminal],
    registerTerminalProfileProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTerminalLinkProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showQuickPick: vi.fn(),
  },
  workspace: {
    workspaceFolders: [mockWorkspaceFolder],
  },
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    executeCommand: vi.fn(),
  },
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path, scheme: 'file' })),
  },
  EventEmitter: MockEventEmitter,
  CancellationTokenSource: class {
    token = mockCancellationToken;
    cancel = vi.fn();
    dispose = vi.fn();
  },
};

vi.mock('vscode', () => mockVscode);

// Mock WebSocket for message streaming
class MockWebSocket extends EventEmitter {
  readyState = 1;
  send = vi.fn();
  close = vi.fn();
}

// ============================================================================
// Tests
// ============================================================================

describe('MSSCI-12097: VS Code Chat API integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ==========================================================================
  // AC1: @pennyfarthing appears in VS Code chat view
  // ==========================================================================
  describe('AC1: Chat participant registration', () => {
    it('should have providers/chat-participant.ts file', async () => {
      const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const chatPath = join(
        __dirname,
        '..',
        'src',
        'providers',
        'chat-participant.ts'
      );
      expect(existsSync(chatPath)).toBe(true);
    });

    it('should export PennyfarthingChatParticipant class', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      expect(chatModule.PennyfarthingChatParticipant).toBeDefined();
    });

    it('should register chat participant with id "pennyfarthing"', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();

      participant.register();

      expect(mockChat.createChatParticipant).toHaveBeenCalledWith(
        'pennyfarthing',
        expect.any(Function)
      );
    });

    it('should set display name to "Pennyfarthing"', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();

      const registered = participant.register();

      expect(registered.displayName).toBe('Pennyfarthing');
    });

    it('should set appropriate icon path', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();

      const registered = participant.register();

      expect(registered.iconPath).toBeDefined();
    });

    it('should register participant on extension activation', async () => {
      const { activate } = await import('../src/extension');
      const mockContext = {
        subscriptions: [],
        extensionPath: '/mock/path',
      };

      await activate(mockContext as any);

      expect(mockChat.createChatParticipant).toHaveBeenCalledWith(
        'pennyfarthing',
        expect.any(Function)
      );
    });

    it('should dispose participant on extension deactivation', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      const registered = participant.register();

      participant.dispose();

      expect(registered.dispose).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // AC2: User can send messages via chat input
  // ==========================================================================
  describe('AC2: Sending messages to Claude', () => {
    it('should forward user message to active terminal', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      const request: MockChatRequest = {
        prompt: 'Help me fix this bug',
      };
      const context: MockChatContext = { history: [] };
      const response = new MockChatResponseStream();

      await participant.handleRequest(
        request,
        context,
        response,
        mockCancellationToken
      );

      expect(mockTerminal.sendText).toHaveBeenCalledWith('Help me fix this bug');
    });

    it('should show progress indicator while waiting for response', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      const request: MockChatRequest = { prompt: 'Test message' };
      const context: MockChatContext = { history: [] };
      const response = new MockChatResponseStream();

      await participant.handleRequest(
        request,
        context,
        response,
        mockCancellationToken
      );

      expect(response.progress).toHaveBeenCalledWith(
        expect.stringContaining('Sending to Claude')
      );
    });

    it('should handle empty prompt gracefully', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      const request: MockChatRequest = { prompt: '' };
      const context: MockChatContext = { history: [] };
      const response = new MockChatResponseStream();

      await participant.handleRequest(
        request,
        context,
        response,
        mockCancellationToken
      );

      expect(response.markdown).toHaveBeenCalledWith(
        expect.stringContaining('empty')
      );
      expect(mockTerminal.sendText).not.toHaveBeenCalled();
    });

    it('should show error when no terminal is available', async () => {
      mockVscode.window.activeTerminal = undefined as any;
      mockVscode.window.terminals = [];

      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      const request: MockChatRequest = { prompt: 'Test message' };
      const context: MockChatContext = { history: [] };
      const response = new MockChatResponseStream();

      await participant.handleRequest(
        request,
        context,
        response,
        mockCancellationToken
      );

      expect(response.markdown).toHaveBeenCalledWith(
        expect.stringContaining('No Claude terminal')
      );

      // Restore
      mockVscode.window.activeTerminal = mockTerminal;
      mockVscode.window.terminals = [mockTerminal];
    });

    it('should escape special characters in user input', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      const request: MockChatRequest = {
        prompt: 'Fix `code` with $variable',
      };
      const context: MockChatContext = { history: [] };
      const response = new MockChatResponseStream();

      await participant.handleRequest(
        request,
        context,
        response,
        mockCancellationToken
      );

      // Should pass through but not cause shell injection
      expect(mockTerminal.sendText).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // AC3: Assistant responses stream in real-time from Claude
  // ==========================================================================
  describe('AC3: Streaming assistant responses', () => {
    it('should subscribe to WheelHub /ws/messages channel', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();

      // Should have method to connect to WheelHub
      expect(typeof participant.connectToWheelHub).toBe('function');
    });

    it('should register /ws/messages channel in WebSocketManager', async () => {
      const { WebSocketManager } = await import(
        '../src/server/websocket-manager'
      );
      const wsManager = new WebSocketManager();

      expect(wsManager.hasChannel('/ws/messages')).toBe(true);
    });

    it('should stream markdown chunks to response', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      const request: MockChatRequest = { prompt: 'Test' };
      const context: MockChatContext = { history: [] };
      const response = new MockChatResponseStream();

      // Simulate WheelHub pushing message chunks
      const wsManager = participant.getWebSocketManager();
      const responsePromise = participant.handleRequest(
        request,
        context,
        response,
        mockCancellationToken
      );

      // Simulate streaming chunks
      wsManager?.broadcastMessages({ content: 'Hello ', type: 'chunk' });
      wsManager?.broadcastMessages({ content: 'world!', type: 'chunk' });
      wsManager?.broadcastMessages({ type: 'done' });

      await responsePromise;

      const chunks = response.getChunks();
      expect(chunks).toContain('Hello ');
      expect(chunks).toContain('world!');
    });

    it('should handle cancellation during streaming', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      const cancelToken = {
        ...mockCancellationToken,
        isCancellationRequested: true,
      };

      const request: MockChatRequest = { prompt: 'Test' };
      const context: MockChatContext = { history: [] };
      const response = new MockChatResponseStream();

      await participant.handleRequest(request, context, response, cancelToken);

      expect(response.markdown).toHaveBeenCalledWith(
        expect.stringContaining('cancelled')
      );
    });

    it('should handle connection errors gracefully', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      // Simulate disconnected state
      participant.handleDisconnect();

      const request: MockChatRequest = { prompt: 'Test' };
      const context: MockChatContext = { history: [] };
      const response = new MockChatResponseStream();

      await participant.handleRequest(
        request,
        context,
        response,
        mockCancellationToken
      );

      expect(response.markdown).toHaveBeenCalledWith(
        expect.stringMatching(/not connected|reconnect/i)
      );
    });

    it('should timeout if no response within reasonable time', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();
      participant.setResponseTimeout(100); // 100ms for test

      const request: MockChatRequest = { prompt: 'Test' };
      const context: MockChatContext = { history: [] };
      const response = new MockChatResponseStream();

      await participant.handleRequest(
        request,
        context,
        response,
        mockCancellationToken
      );

      expect(response.markdown).toHaveBeenCalledWith(
        expect.stringContaining('timed out')
      );
    });
  });

  // ==========================================================================
  // AC4: Slash commands (/sm, /tea, etc.) invoke agent switches
  // ==========================================================================
  describe('AC4: Slash command handling', () => {
    it('should define subCommands for all agents', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();

      const registered = participant.register();

      expect(registered.subCommands).toContainEqual(
        expect.objectContaining({ name: 'sm' })
      );
      expect(registered.subCommands).toContainEqual(
        expect.objectContaining({ name: 'tea' })
      );
      expect(registered.subCommands).toContainEqual(
        expect.objectContaining({ name: 'dev' })
      );
      expect(registered.subCommands).toContainEqual(
        expect.objectContaining({ name: 'reviewer' })
      );
    });

    it('should include descriptions for each subCommand', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();

      const registered = participant.register();

      const smCommand = registered.subCommands.find((c) => c.name === 'sm');
      expect(smCommand?.description).toMatch(/scrum master/i);
    });

    it('should handle /sm command to switch to Scrum Master', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      const request: MockChatRequest = {
        prompt: 'start new work',
        command: 'sm',
      };
      const context: MockChatContext = { history: [] };
      const response = new MockChatResponseStream();

      await participant.handleRequest(
        request,
        context,
        response,
        mockCancellationToken
      );

      expect(mockTerminal.sendText).toHaveBeenCalledWith('/sm');
      expect(mockTerminal.sendText).toHaveBeenCalledWith('start new work');
    });

    it('should handle /tea command to switch to Test Engineer', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      const request: MockChatRequest = {
        prompt: 'write tests',
        command: 'tea',
      };
      const context: MockChatContext = { history: [] };
      const response = new MockChatResponseStream();

      await participant.handleRequest(
        request,
        context,
        response,
        mockCancellationToken
      );

      expect(mockTerminal.sendText).toHaveBeenCalledWith('/tea');
    });

    it('should handle /dev command to switch to Developer', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      const request: MockChatRequest = {
        prompt: 'implement feature',
        command: 'dev',
      };
      const context: MockChatContext = { history: [] };
      const response = new MockChatResponseStream();

      await participant.handleRequest(
        request,
        context,
        response,
        mockCancellationToken
      );

      expect(mockTerminal.sendText).toHaveBeenCalledWith('/dev');
    });

    it('should handle /reviewer command to switch to Reviewer', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      const request: MockChatRequest = {
        prompt: 'review code',
        command: 'reviewer',
      };
      const context: MockChatContext = { history: [] };
      const response = new MockChatResponseStream();

      await participant.handleRequest(
        request,
        context,
        response,
        mockCancellationToken
      );

      expect(mockTerminal.sendText).toHaveBeenCalledWith('/reviewer');
    });

    it('should show confirmation after agent switch', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      const request: MockChatRequest = {
        prompt: '',
        command: 'sm',
      };
      const context: MockChatContext = { history: [] };
      const response = new MockChatResponseStream();

      await participant.handleRequest(
        request,
        context,
        response,
        mockCancellationToken
      );

      expect(response.markdown).toHaveBeenCalledWith(
        expect.stringMatching(/switching.*scrum master/i)
      );
    });
  });

  // ==========================================================================
  // AC5: Tool use displays with collapsible details
  // ==========================================================================
  describe('AC5: Tool use display', () => {
    it('should parse tool_use blocks from Claude response', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();

      const rawResponse = `
        I'll read the file.
        <tool_use>
        <name>Read</name>
        <input>{"file_path": "/path/to/file.ts"}</input>
        </tool_use>
        Here's what I found...
      `;

      const parsed = participant.parseToolUse(rawResponse);

      expect(parsed.tools).toHaveLength(1);
      expect(parsed.tools[0].name).toBe('Read');
      expect(parsed.tools[0].input.file_path).toBe('/path/to/file.ts');
    });

    it('should render tool use as collapsible markdown section', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      const request: MockChatRequest = { prompt: 'Read the config' };
      const context: MockChatContext = { history: [] };
      const response = new MockChatResponseStream();

      // Simulate tool use in response
      const wsManager = participant.getWebSocketManager();
      const responsePromise = participant.handleRequest(
        request,
        context,
        response,
        mockCancellationToken
      );

      wsManager?.broadcastMessages({
        type: 'tool_use',
        name: 'Read',
        input: { file_path: '/config.json' },
      });
      wsManager?.broadcastMessages({ type: 'done' });

      await responsePromise;

      const chunks = response.getChunks();
      const toolMarkdown = chunks.find((c) => c.includes('Read'));

      expect(toolMarkdown).toBeDefined();
      expect(toolMarkdown).toMatch(/<details>|📄|tool/i);
    });

    it('should display tool result summary', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();

      const toolResult = {
        name: 'Bash',
        input: { command: 'npm test' },
        result: 'All tests passed',
        success: true,
      };

      const markdown = participant.formatToolResult(toolResult);

      expect(markdown).toContain('Bash');
      expect(markdown).toContain('npm test');
      expect(markdown).toContain('passed');
    });

    it('should use error styling for failed tool results', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();

      const toolResult = {
        name: 'Bash',
        input: { command: 'npm test' },
        result: 'Test failed: 3 errors',
        success: false,
      };

      const markdown = participant.formatToolResult(toolResult);

      expect(markdown).toMatch(/error|failed|❌/i);
    });

    it('should handle multiple tool uses in single response', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();

      const rawResponse = `
        <tool_use><name>Read</name><input>{"file_path": "a.ts"}</input></tool_use>
        <tool_use><name>Read</name><input>{"file_path": "b.ts"}</input></tool_use>
        <tool_use><name>Edit</name><input>{"file_path": "a.ts"}</input></tool_use>
      `;

      const parsed = participant.parseToolUse(rawResponse);

      expect(parsed.tools).toHaveLength(3);
    });

    it('should truncate long tool inputs in display', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();

      const toolResult = {
        name: 'Write',
        input: {
          file_path: '/path/to/file.ts',
          content: 'x'.repeat(5000), // Very long content
        },
        result: 'File written',
        success: true,
      };

      const markdown = participant.formatToolResult(toolResult);

      // Should truncate, not show full 5000 chars
      expect(markdown.length).toBeLessThan(1000);
      expect(markdown).toContain('...');
    });
  });

  // ==========================================================================
  // AC6: Works alongside GitHub Copilot Chat
  // ==========================================================================
  describe('AC6: Copilot coexistence', () => {
    it('should use unique participant id that does not conflict with Copilot', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();

      const registered = participant.register();

      // Should not use 'copilot' or 'github' in the id
      expect(registered.id).toBe('pennyfarthing');
      expect(registered.id).not.toMatch(/copilot|github/i);
    });

    it('should not interfere with @github mentions', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      // Messages without @pennyfarthing should not be handled
      // This is enforced by VS Code's routing - we just verify our handler
      // only processes requests routed to us

      const request: MockChatRequest = { prompt: 'Test' };
      const context: MockChatContext = { history: [] };
      const response = new MockChatResponseStream();

      // Our handler should process this (VS Code routes to us)
      await participant.handleRequest(
        request,
        context,
        response,
        mockCancellationToken
      );

      // Should have processed it
      expect(mockTerminal.sendText).toHaveBeenCalled();
    });

    it('should maintain separate conversation history from Copilot', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      // Context should only include our participant's history
      const context: MockChatContext = {
        history: [
          { participant: 'pennyfarthing', request: { prompt: 'help' } },
          { participant: 'github.copilot', request: { prompt: 'explain' } },
        ],
      };

      const filteredHistory = participant.filterHistory(context);

      expect(filteredHistory).toHaveLength(1);
      expect(filteredHistory[0].participant).toBe('pennyfarthing');
    });

    it('should register in contributes.chatParticipants in package.json', async () => {
      const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');

      const packageJsonPath = join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

      expect(packageJson.contributes?.chatParticipants).toBeDefined();
      expect(packageJson.contributes.chatParticipants).toContainEqual(
        expect.objectContaining({
          id: 'pennyfarthing',
        })
      );
    });

    it('should specify VS Code engine >=1.85 for Chat API support', async () => {
      const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');

      const packageJsonPath = join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

      // Check engine version supports Chat API (1.85+)
      const engineVersion = packageJson.engines?.vscode;
      expect(engineVersion).toBeDefined();

      // Extract major.minor version
      const versionMatch = engineVersion.match(/\d+\.\d+/);
      expect(versionMatch).toBeTruthy();

      const [major, minor] = versionMatch[0].split('.').map(Number);
      expect(major * 100 + minor).toBeGreaterThanOrEqual(185);
    });

    it('should handle context when both Copilot and Pennyfarthing are active', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      // Both participants might be shown in the chat view
      // Our participant should function normally

      const request: MockChatRequest = { prompt: 'help' };
      const context: MockChatContext = { history: [] };
      const response = new MockChatResponseStream();

      await participant.handleRequest(
        request,
        context,
        response,
        mockCancellationToken
      );

      // Should successfully process without errors
      expect(response.markdown).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // WebSocket Integration Tests
  // ==========================================================================
  describe('WebSocket integration', () => {
    it('should add onMessages listener method to WebSocketManager', async () => {
      const { WebSocketManager } = await import(
        '../src/server/websocket-manager'
      );
      const wsManager = new WebSocketManager();

      expect(typeof wsManager.onMessages).toBe('function');
    });

    it('should broadcast messages to listeners', async () => {
      const { WebSocketManager } = await import(
        '../src/server/websocket-manager'
      );
      const wsManager = new WebSocketManager();

      const listener = vi.fn();
      wsManager.onMessages(listener);

      wsManager.broadcastMessages({ content: 'Hello', type: 'chunk' });

      expect(listener).toHaveBeenCalledWith({ content: 'Hello', type: 'chunk' });
    });

    it('should cleanup listener on dispose', async () => {
      const { WebSocketManager } = await import(
        '../src/server/websocket-manager'
      );
      const wsManager = new WebSocketManager();

      const listener = vi.fn();
      const unsubscribe = wsManager.onMessages(listener);

      unsubscribe();

      wsManager.broadcastMessages({ content: 'Hello', type: 'chunk' });

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
