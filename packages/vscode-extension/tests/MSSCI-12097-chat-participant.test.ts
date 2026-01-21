/**
 * MSSCI-12097: VS Code Chat API integration for Claude conversations
 *
 * Tests for the Chat Participant that spawns Claude CLI directly
 * using stream-json format (not terminal forwarding).
 *
 * Acceptance Criteria:
 * - AC1: @pennyfarthing appears in VS Code chat view
 * - AC2: User can send messages via chat input
 * - AC3: Assistant responses stream in real-time from Claude CLI
 * - AC4: Slash commands (/sm, /tea, etc.) invoke agent switches
 * - AC5: Tool use displays with formatted output
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

  progress = vi.fn((_message: string) => {
    // Progress indicator
  });

  reference = vi.fn((_uri: unknown, _options?: unknown) => {
    // Reference to file/symbol
  });

  button = vi.fn((_command: unknown) => {
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
  references?: unknown[];
  location?: unknown;
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
  iconPath?: unknown;
  subCommands: Array<{ name: string; description: string }> = [];
  private handler: (
    request: MockChatRequest,
    context: MockChatContext,
    response: MockChatResponseStream,
    token: typeof mockCancellationToken
  ) => Promise<void>;
  private disposed = false;

  constructor(
    id: string,
    handler: (
      request: MockChatRequest,
      context: MockChatContext,
      response: MockChatResponseStream,
      token: typeof mockCancellationToken
    ) => Promise<void>
  ) {
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
    (
      id: string,
      handler: (
        request: MockChatRequest,
        context: MockChatContext,
        response: MockChatResponseStream,
        token: typeof mockCancellationToken
      ) => Promise<void>
    ) => new MockChatParticipant(id, handler)
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
    activeTerminal: null,
    terminals: [],
    registerTerminalProfileProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTerminalLinkProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showQuickPick: vi.fn(),
    activeColorTheme: { kind: 2 },
    onDidChangeActiveColorTheme: vi.fn(() => ({ dispose: vi.fn() })),
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

// Mock ClaudeService - the actual implementation spawns claude CLI
class MockClaudeService extends EventEmitter {
  cwd: string;
  running = false;

  constructor(options: { cwd: string }) {
    super();
    this.cwd = options.cwd;
  }

  async sendMessage(prompt: string): Promise<void> {
    this.running = true;
    // Simulate async response
    setTimeout(() => {
      this.emit('text', `Response to: ${prompt}`);
      this.emit('complete', 'mock-session-id');
    }, 10);
  }

  stop(): void {
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }
}

// Mock the claude-service module
vi.mock('../src/services/claude-service', () => ({
  ClaudeService: MockClaudeService,
}));

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

    it('should register chat participant with correct id', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();

      participant.register();

      // The actual implementation uses 'pennyfarthing-vscode.pennyfarthing' as the full id
      expect(mockChat.createChatParticipant).toHaveBeenCalledWith(
        'pennyfarthing-vscode.pennyfarthing',
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

    it('should dispose participant when dispose is called', async () => {
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
    it('should handle empty prompt gracefully', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      const request: MockChatRequest = { prompt: '' };
      const context: MockChatContext = { history: [] };
      const response = new MockChatResponseStream();

      await participant.handleRequest(
        request as any,
        context as any,
        response as any,
        mockCancellationToken as any
      );

      // Should show a message about empty prompt
      expect(response.markdown).toHaveBeenCalledWith(
        expect.stringContaining('enter a message')
      );
    });

    it('should show progress indicator when processing', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      const request: MockChatRequest = { prompt: 'Test message' };
      const context: MockChatContext = { history: [] };
      const response = new MockChatResponseStream();

      // Don't await - just check progress was called
      const promise = participant.handleRequest(
        request as any,
        context as any,
        response as any,
        mockCancellationToken as any
      );

      // Progress should be called immediately
      expect(response.progress).toHaveBeenCalled();

      await promise;
    });

    it('should handle cancellation', async () => {
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

      await participant.handleRequest(
        request as any,
        context as any,
        response as any,
        cancelToken as any
      );

      expect(response.markdown).toHaveBeenCalledWith(
        expect.stringContaining('cancelled')
      );
    });
  });

  // ==========================================================================
  // AC3: Assistant responses stream from Claude CLI
  // ==========================================================================
  describe('AC3: Streaming assistant responses via ClaudeService', () => {
    it('should have services/claude-service.ts file', async () => {
      const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const servicePath = join(
        __dirname,
        '..',
        'src',
        'services',
        'claude-service.ts'
      );
      expect(existsSync(servicePath)).toBe(true);
    });

    it('should export ClaudeService class', async () => {
      // Use actual import to check the real module exists
      const { existsSync, readFileSync } =
        await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const servicePath = join(
        __dirname,
        '..',
        'src',
        'services',
        'claude-service.ts'
      );

      const content = readFileSync(servicePath, 'utf-8');
      expect(content).toContain('export class ClaudeService');
    });

    it('should use ClaudeService to spawn claude CLI', async () => {
      const { existsSync, readFileSync } =
        await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const servicePath = join(
        __dirname,
        '..',
        'src',
        'services',
        'claude-service.ts'
      );

      const content = readFileSync(servicePath, 'utf-8');
      // Should spawn claude with stream-json format
      expect(content).toContain("spawn('claude'");
      expect(content).toContain('stream-json');
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

    it('should prepend agent command to prompt when command is specified', async () => {
      const chatModule = await import('../src/providers/chat-participant');
      const participant = new chatModule.PennyfarthingChatParticipant();
      participant.register();

      // The implementation prepends /{command} to the prompt
      // We can verify this by checking the chat-participant.ts source
      const { readFileSync } =
        await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const chatPath = join(
        __dirname,
        '..',
        'src',
        'providers',
        'chat-participant.ts'
      );

      const content = readFileSync(chatPath, 'utf-8');
      // Should prepend the command to the prompt
      expect(content).toContain('/${request.command}');
    });
  });

  // ==========================================================================
  // AC5: Tool use displays with formatted output
  // ==========================================================================
  describe('AC5: Tool use display', () => {
    it('should use formatToolUse from response-formatter', async () => {
      const { readFileSync } =
        await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const chatPath = join(
        __dirname,
        '..',
        'src',
        'providers',
        'chat-participant.ts'
      );

      const content = readFileSync(chatPath, 'utf-8');
      // Should import formatToolUse from response-formatter (MSSCI-12126)
      expect(content).toContain('formatToolUse');
      expect(content).toContain('response-formatter');
    });

    it('should use ProgressTracker for long operations', async () => {
      const { readFileSync } =
        await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const chatPath = join(
        __dirname,
        '..',
        'src',
        'providers',
        'chat-participant.ts'
      );

      const content = readFileSync(chatPath, 'utf-8');
      // Should use ProgressTracker for tool operations (MSSCI-12126 AC5)
      expect(content).toContain('ProgressTracker');
      expect(content).toContain('startToolProgress');
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
      expect(registered.id).toContain('pennyfarthing');
      expect(registered.id).not.toMatch(/copilot|github/i);
    });

    it('should register in contributes.chatParticipants in package.json', async () => {
      const { readFileSync } =
        await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');

      const packageJsonPath = join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

      expect(packageJson.contributes?.chatParticipants).toBeDefined();
      expect(packageJson.contributes.chatParticipants).toContainEqual(
        expect.objectContaining({
          id: 'pennyfarthing-vscode.pennyfarthing',
        })
      );
    });

    it('should specify VS Code engine >=1.85 for Chat API support', async () => {
      const { readFileSync } =
        await vi.importActual<typeof import('fs')>('fs');
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
  });

  // ==========================================================================
  // ClaudeService Tests
  // ==========================================================================
  describe('ClaudeService', () => {
    it('should emit text events for assistant responses', async () => {
      const { readFileSync } =
        await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const servicePath = join(
        __dirname,
        '..',
        'src',
        'services',
        'claude-service.ts'
      );

      const content = readFileSync(servicePath, 'utf-8');
      expect(content).toContain("emit('text'");
    });

    it('should emit toolUse events for tool blocks', async () => {
      const { readFileSync } =
        await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const servicePath = join(
        __dirname,
        '..',
        'src',
        'services',
        'claude-service.ts'
      );

      const content = readFileSync(servicePath, 'utf-8');
      expect(content).toContain("emit('toolUse'");
    });

    it('should emit complete events with session id', async () => {
      const { readFileSync } =
        await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const servicePath = join(
        __dirname,
        '..',
        'src',
        'services',
        'claude-service.ts'
      );

      const content = readFileSync(servicePath, 'utf-8');
      expect(content).toContain("emit('complete'");
    });

    it('should support session resumption', async () => {
      const { readFileSync } =
        await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const servicePath = join(
        __dirname,
        '..',
        'src',
        'services',
        'claude-service.ts'
      );

      const content = readFileSync(servicePath, 'utf-8');
      expect(content).toContain('--resume');
      expect(content).toContain('sessionId');
    });
  });
});
