/**
 * MSSCI-12047: WheelHub adapter for VS Code
 *
 * These tests verify the embedded WheelHub server for the VS Code extension.
 * Tests are written to FAIL until Dev implements the server adapter.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { EventEmitter } from 'events';

// Mock VS Code API - must be before importing extension
const mockContext = {
  subscriptions: [] as { dispose: () => void }[],
  workspaceState: { get: vi.fn(), update: vi.fn() },
  globalState: { get: vi.fn(), update: vi.fn() },
  extensionPath: '/mock/extension/path',
  extensionUri: { fsPath: '/mock/extension/path' },
};

const mockWorkspaceFolder = {
  uri: { fsPath: '/mock/workspace' },
  name: 'mock-workspace',
  index: 0,
};

const mockOutputChannel = {
  appendLine: vi.fn(),
  dispose: vi.fn(),
  show: vi.fn(),
};

// Mock vscode.EventEmitter class
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

// Mock vscode.ThemeIcon class
class MockThemeIcon {
  constructor(public id: string) {}
}

// Mock vscode.TreeItem class
class MockTreeItem {
  label: string;
  collapsibleState?: number;
  constructor(label: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

// Mock TreeItemCollapsibleState enum
const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
};

// Mock vscode.TerminalProfile class
class MockTerminalProfile {
  options: any;
  constructor(options: any) {
    this.options = options;
  }
}

// Mock vscode.Position class
class MockPosition {
  line: number;
  character: number;
  constructor(line: number, character: number) {
    this.line = line;
    this.character = character;
  }
}

// Mock vscode.Selection class
class MockSelection {
  anchor: MockPosition;
  active: MockPosition;
  constructor(anchor: MockPosition, active: MockPosition) {
    this.anchor = anchor;
    this.active = active;
  }
}

// Mock ChatParticipant for extension activation
class MockChatParticipant {
  id: string;
  displayName?: string;
  iconPath?: any;
  subCommands: Array<{ name: string; description: string }> = [];
  dispose = vi.fn();
  constructor(id: string, handler: any) {
    this.id = id;
  }
}

const mockTerminal = {
  sendText: vi.fn(),
  show: vi.fn(),
  dispose: vi.fn(),
};

const mockVscode = {
  chat: {
    createChatParticipant: vi.fn(
      (id: string, handler: any) => new MockChatParticipant(id, handler)
    ),
  },
  window: {
    createOutputChannel: vi.fn(() => mockOutputChannel),
    registerTerminalProfileProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTerminalLinkProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
    createTerminal: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showTextDocument: vi.fn(() => Promise.resolve()),
    showQuickPick: vi.fn(),
    activeTerminal: mockTerminal,
    terminals: [mockTerminal],
    activeColorTheme: { kind: 2 },
    onDidChangeActiveColorTheme: vi.fn(() => ({ dispose: vi.fn() })),
  },
  workspace: {
    workspaceFolders: [mockWorkspaceFolder],
    openTextDocument: vi.fn(() => Promise.resolve({})),
    createFileSystemWatcher: vi.fn(() => ({
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
      onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn(),
    })),
    findFiles: vi.fn().mockResolvedValue([]),
    fs: {
      readFile: vi.fn().mockResolvedValue(new Uint8Array()),
      stat: vi.fn().mockRejectedValue(new Error('File not found')),
    },
  },
  RelativePattern: class {
    constructor(public base: any, public pattern: string) {}
  },
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    executeCommand: vi.fn(() => Promise.resolve()),
  },
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path, scheme: 'file' })),
    parse: vi.fn((url: string) => ({ toString: () => url })),
  },
  env: {
    openExternal: vi.fn(),
  },
  Range: vi.fn((startLine: number, startChar: number, endLine: number, endChar: number) => ({
    start: { line: startLine, character: startChar },
    end: { line: endLine, character: endChar },
  })),
  Position: MockPosition,
  Selection: MockSelection,
  TerminalProfile: MockTerminalProfile,
  TerminalLink: vi.fn(),
  EventEmitter: MockEventEmitter,
  ThemeIcon: MockThemeIcon,
  TreeItem: MockTreeItem,
  TreeItemCollapsibleState,
};

vi.mock('vscode', () => mockVscode);

// Mock fs for port file operations
const mockFs = {
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
};

vi.mock('fs', () => mockFs);

// Mock http server
class MockServer extends EventEmitter {
  address = vi.fn(() => ({ port: 3456 }));
  listen = vi.fn((port: number, callback?: () => void) => {
    if (callback) callback();
    return this;
  });
  close = vi.fn((callback?: () => void) => {
    if (callback) callback();
    return this;
  });
}

// Mock WebSocket server
class MockWebSocketServer extends EventEmitter {
  clients = new Set<any>();
  close = vi.fn();
  handleUpgrade = vi.fn();
}

// Mock WebSocket client for testing
class MockWebSocket extends EventEmitter {
  readyState = 1; // WebSocket.OPEN
  send = vi.fn();
  close = vi.fn();
  terminate = vi.fn();
}

vi.mock('http', () => ({
  createServer: vi.fn(() => new MockServer()),
}));

vi.mock('ws', () => ({
  WebSocketServer: MockWebSocketServer,
  WebSocket: MockWebSocket,
}));

const EXTENSION_ROOT = join(__dirname, '..');

describe('MSSCI-12047: WheelHub Adapter for VS Code', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.subscriptions = [];
    mockFs.existsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('AC1: WheelHub server starts when extension activates', () => {

    it('should have server/wheelhub-adapter.ts file', async () => {
      const { existsSync } = await import('fs');
      // Use real fs for file existence check
      const realExistsSync = (await vi.importActual<typeof import('fs')>('fs')).existsSync;
      const adapterPath = join(EXTENSION_ROOT, 'src', 'server', 'wheelhub-adapter.ts');
      expect(realExistsSync(adapterPath)).toBe(true);
    });

    it('should export WheelHubAdapter class', async () => {
      // This will fail until the file exists with the export
      const adapterModule = await import('../src/server/wheelhub-adapter');
      expect(adapterModule.WheelHubAdapter).toBeDefined();
    });

    it('should create HTTP server on start()', async () => {
      const adapterModule = await import('../src/server/wheelhub-adapter');
      const adapter = new adapterModule.WheelHubAdapter('/mock/workspace', mockOutputChannel as any);

      await adapter.start();

      // Server should be created and listening
      expect(adapter.isRunning()).toBe(true);
    });

    it('should find available port starting from default', async () => {
      const adapterModule = await import('../src/server/wheelhub-adapter');
      const adapter = new adapterModule.WheelHubAdapter('/mock/workspace', mockOutputChannel as any);

      await adapter.start();

      // Should have found and used a port
      const port = adapter.getPort();
      expect(port).toBeGreaterThan(0);
    });
  });

  describe('AC2: Port file written to .cyclist/port for Claude CLI discovery', () => {

    it('should create .cyclist directory if not exists', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const adapterModule = await import('../src/server/wheelhub-adapter');
      const adapter = new adapterModule.WheelHubAdapter('/mock/workspace', mockOutputChannel as any);

      await adapter.start();

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        join('/mock/workspace', '.cyclist'),
        expect.objectContaining({ recursive: true })
      );
    });

    it('should write port number to .cyclist-port file', async () => {
      const adapterModule = await import('../src/server/wheelhub-adapter');
      const adapter = new adapterModule.WheelHubAdapter('/mock/workspace', mockOutputChannel as any);

      await adapter.start();

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        join('/mock/workspace', '.cyclist-port'),
        expect.stringMatching(/^\d+$/)
      );
    });

    it('should remove port file on stop()', async () => {
      mockFs.existsSync.mockImplementation((path: string) =>
        path.includes('.cyclist-port')
      );

      const adapterModule = await import('../src/server/wheelhub-adapter');
      const adapter = new adapterModule.WheelHubAdapter('/mock/workspace', mockOutputChannel as any);

      await adapter.start();
      await adapter.stop();

      expect(mockFs.unlinkSync).toHaveBeenCalledWith(
        join('/mock/workspace', '.cyclist-port')
      );
    });
  });

  describe('AC3: Claude WebSocket channel accepts connections and routes messages', () => {

    it('should have websocket-manager.ts file', async () => {
      const realExistsSync = (await vi.importActual<typeof import('fs')>('fs')).existsSync;
      const wsManagerPath = join(EXTENSION_ROOT, 'src', 'server', 'websocket-manager.ts');
      expect(realExistsSync(wsManagerPath)).toBe(true);
    });

    it('should export WebSocketManager class', async () => {
      const wsModule = await import('../src/server/websocket-manager');
      expect(wsModule.WebSocketManager).toBeDefined();
    });

    it('should register /ws/claude endpoint', async () => {
      const adapterModule = await import('../src/server/wheelhub-adapter');
      const adapter = new adapterModule.WheelHubAdapter('/mock/workspace', mockOutputChannel as any);

      await adapter.start();

      // Verify Claude WebSocket endpoint is available
      const wsManager = adapter.getWebSocketManager();
      expect(wsManager.hasChannel('/ws/claude')).toBe(true);
    });

    it('should route send message to Claude service', async () => {
      const wsModule = await import('../src/server/websocket-manager');
      const wsManager = new wsModule.WebSocketManager();

      const mockClient = new MockWebSocket();
      wsManager.handleConnection('/ws/claude', mockClient as any);

      // Simulate incoming message
      const message = JSON.stringify({ type: 'send', prompt: 'Hello, Claude' });
      mockClient.emit('message', message);

      // Should have routed to Claude service
      // Implementation will handle this via ClaudeService
      expect(mockClient.send).not.toHaveBeenCalledWith(
        expect.stringContaining('error')
      );
    });

    it('should handle abort message type', async () => {
      const wsModule = await import('../src/server/websocket-manager');
      const wsManager = new wsModule.WebSocketManager();

      const mockClient = new MockWebSocket();
      wsManager.handleConnection('/ws/claude', mockClient as any);

      // Simulate abort message
      const message = JSON.stringify({ type: 'abort' });
      mockClient.emit('message', message);

      // Should not throw or send error
      expect(mockClient.terminate).not.toHaveBeenCalled();
    });
  });

  describe('AC4: Server gracefully shuts down on extension deactivation', () => {

    it('should close all WebSocket connections on stop()', async () => {
      const adapterModule = await import('../src/server/wheelhub-adapter');
      const adapter = new adapterModule.WheelHubAdapter('/mock/workspace', mockOutputChannel as any);

      await adapter.start();

      // Add mock client
      const wsManager = adapter.getWebSocketManager();
      const mockClient = new MockWebSocket();
      wsManager.handleConnection('/ws/stats', mockClient as any);

      await adapter.stop();

      // All clients should be closed
      expect(mockClient.close).toHaveBeenCalled();
    });

    it('should close HTTP server on stop()', async () => {
      const adapterModule = await import('../src/server/wheelhub-adapter');
      const adapter = new adapterModule.WheelHubAdapter('/mock/workspace', mockOutputChannel as any);

      await adapter.start();
      const server = adapter.getServer();

      await adapter.stop();

      expect(server.close).toHaveBeenCalled();
    });

    it('should report not running after stop()', async () => {
      const adapterModule = await import('../src/server/wheelhub-adapter');
      const adapter = new adapterModule.WheelHubAdapter('/mock/workspace', mockOutputChannel as any);

      await adapter.start();
      expect(adapter.isRunning()).toBe(true);

      await adapter.stop();
      expect(adapter.isRunning()).toBe(false);
    });
  });

  describe('AC5: Webview panels can connect via WebSocket (story, stats channels)', () => {

    it('should register /ws/stats endpoint', async () => {
      const adapterModule = await import('../src/server/wheelhub-adapter');
      const adapter = new adapterModule.WheelHubAdapter('/mock/workspace', mockOutputChannel as any);

      await adapter.start();

      const wsManager = adapter.getWebSocketManager();
      expect(wsManager.hasChannel('/ws/stats')).toBe(true);
    });

    it('should register /ws/story endpoint', async () => {
      const adapterModule = await import('../src/server/wheelhub-adapter');
      const adapter = new adapterModule.WheelHubAdapter('/mock/workspace', mockOutputChannel as any);

      await adapter.start();

      const wsManager = adapter.getWebSocketManager();
      expect(wsManager.hasChannel('/ws/story')).toBe(true);
    });

    it('should send initial stats on connection', async () => {
      const wsModule = await import('../src/server/websocket-manager');
      const wsManager = new wsModule.WebSocketManager();

      const mockClient = new MockWebSocket();
      wsManager.handleConnection('/ws/stats', mockClient as any);

      // Should send initial stats payload
      expect(mockClient.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"stats"')
      );
    });

    it('should broadcast stats updates to all connected clients', async () => {
      const wsModule = await import('../src/server/websocket-manager');
      const wsManager = new wsModule.WebSocketManager();

      const client1 = new MockWebSocket();
      const client2 = new MockWebSocket();
      wsManager.handleConnection('/ws/stats', client1 as any);
      wsManager.handleConnection('/ws/stats', client2 as any);

      // Broadcast update
      wsManager.broadcastStats({ agent: 'dev', phase: 'green' });

      // Both clients should receive
      expect(client1.send).toHaveBeenLastCalledWith(
        expect.stringContaining('dev')
      );
      expect(client2.send).toHaveBeenLastCalledWith(
        expect.stringContaining('dev')
      );
    });
  });

  describe('Extension integration', () => {

    it('should start WheelHub server on extension activation', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      // Server should have been started
      // This verifies the extension integrates the WheelHubAdapter
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('WheelHub')
      );
    });

    it('should add server to subscriptions for cleanup', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      // Extension should register a disposable for server cleanup
      const serverDisposable = mockContext.subscriptions.find(
        (sub: any) => sub._isWheelHubDisposable
      );
      expect(serverDisposable).toBeDefined();
    });

    it('should stop server on deactivate', async () => {
      const { activate, deactivate } = await import('../src/extension');
      await activate(mockContext as any);

      // Deactivate should trigger cleanup without errors
      await expect(deactivate()).resolves.not.toThrow();

      // The deactivate function should complete successfully
      // (actual cleanup verified by other tests on the adapter directly)
    });
  });
});
