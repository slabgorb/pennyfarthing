/**
 * MSSCI-12193: Real-time Agent Updates
 *
 * BDD-style tests for real-time persona card updates via WheelHub WebSocket.
 * Tests are written to FAIL until Dev implements the WebSocket integration.
 *
 * Acceptance Criteria:
 * - AC1: Persona card updates when WheelHub broadcasts on /ws/persona channel
 * - AC2: Portrait image updates to new agent's portrait
 * - AC3: Character name and theme badge update to new agent's data
 * - AC4: Updates complete within 1 second of broadcast
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock VS Code EventEmitter class
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

// Mock WebviewView for testing
class MockWebviewView {
  webview: MockWebview;
  visible = true;
  viewType = 'pennyfarthing.agentPortrait';
  onDidDispose = vi.fn();
  onDidChangeVisibility = vi.fn();
  show = vi.fn();

  constructor() {
    this.webview = new MockWebview();
  }
}

class MockWebview {
  options: any = {};
  html = '';
  cspSource = 'vscode-webview:';
  onDidReceiveMessage = vi.fn((handler) => {
    this._messageHandler = handler;
    return { dispose: vi.fn() };
  });
  postMessage = vi.fn();
  asWebviewUri = vi.fn((uri: any) => ({
    toString: () => `vscode-webview://mock/${uri.fsPath}`,
    fsPath: uri.fsPath,
  }));
  private _messageHandler?: (message: any) => void;

  simulateMessage(message: any) {
    if (this._messageHandler) {
      this._messageHandler(message);
    }
  }
}

const mockContext = {
  subscriptions: [] as { dispose: () => void }[],
  workspaceState: { get: vi.fn(), update: vi.fn() },
  globalState: {
    get: vi.fn((key: string, defaultValue?: any) => defaultValue),
    update: vi.fn(),
    keys: vi.fn(() => []),
    setKeysForSync: vi.fn(),
  },
  extensionPath: '/mock/extension/path',
  extensionUri: { fsPath: '/mock/extension/path' },
};

const mockWorkspaceFolder = {
  uri: { fsPath: '/mock/workspace' },
  name: 'mock-workspace',
  index: 0,
};

// ColorThemeKind enum
const ColorThemeKind = {
  Light: 1,
  Dark: 2,
  HighContrast: 3,
  HighContrastLight: 4,
};

// StatusBarAlignment enum
const StatusBarAlignment = {
  Left: 1,
  Right: 2,
};

// ThemeColor mock
class MockThemeColor {
  constructor(public id: string) {}
}

// Mock ChatParticipant
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

const mockVscode = {
  StatusBarAlignment,
  ThemeColor: MockThemeColor,
  chat: {
    createChatParticipant: vi.fn(
      (id: string, handler: any) => new MockChatParticipant(id, handler)
    ),
  },
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      dispose: vi.fn(),
      show: vi.fn(),
    })),
    createStatusBarItem: vi.fn(() => ({
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
      text: '',
      tooltip: '',
      color: undefined,
      backgroundColor: undefined,
    })),
    registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTerminalProfileProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTerminalLinkProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
    createTreeView: vi.fn(() => ({ dispose: vi.fn() })),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showQuickPick: vi.fn(),
    activeTerminal: { sendText: vi.fn(), show: vi.fn() },
    terminals: [{ sendText: vi.fn(), show: vi.fn() }],
    activeColorTheme: { kind: ColorThemeKind.Dark },
    onDidChangeActiveColorTheme: vi.fn((handler) => {
      return { dispose: vi.fn() };
    }),
  },
  workspace: {
    workspaceFolders: [mockWorkspaceFolder],
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
    executeCommand: vi.fn(),
  },
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path, scheme: 'file' })),
    joinPath: vi.fn((base: any, ...segments: string[]) => ({
      fsPath: [base.fsPath, ...segments].join('/'),
      scheme: 'file',
    })),
    parse: vi.fn((url: string) => ({ toString: () => url, scheme: 'https' })),
  },
  EventEmitter: MockEventEmitter,
  ColorThemeKind,
  env: {
    openExternal: vi.fn(),
  },
};

vi.mock('vscode', () => mockVscode);

// Mock WebSocketManager for testing
class MockWebSocketManager {
  private agentListeners: Set<(data: any) => void> = new Set();

  onAgent(listener: (data: any) => void): () => void {
    this.agentListeners.add(listener);
    return () => {
      this.agentListeners.delete(listener);
    };
  }

  // Test helper to simulate broadcasts
  simulateAgentBroadcast(data: any): void {
    for (const listener of this.agentListeners) {
      listener(data);
    }
  }

  hasAgentListeners(): boolean {
    return this.agentListeners.size > 0;
  }

  getAgentListenerCount(): number {
    return this.agentListeners.size;
  }
}

describe('MSSCI-12193: Real-time Agent Updates', () => {
  let mockWsManager: MockWebSocketManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.subscriptions = [];
    mockWsManager = new MockWebSocketManager();
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ========================================================================
  // AC1: Persona card updates when WheelHub broadcasts on /ws/persona channel
  // ========================================================================
  describe('AC1: Persona card updates on WheelHub broadcast', () => {
    it('should have a method to set WebSocketManager reference', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );

      // Provider should have a method to inject WebSocketManager
      expect(typeof (provider as any).setWebSocketManager).toBe('function');
    });

    it('should subscribe to agent channel when WebSocketManager is set', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );

      // Set up the WebSocket manager
      (provider as any).setWebSocketManager(mockWsManager);

      // Should have registered a listener
      expect(mockWsManager.hasAgentListeners()).toBe(true);
    });

    it('should call updatePersona when agent broadcast is received', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      // Set up the view first
      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Set up the WebSocket manager
      (provider as any).setWebSocketManager(mockWsManager);

      // Spy on updatePersona
      const updateSpy = vi.spyOn(provider, 'updatePersona');

      // Simulate broadcast
      mockWsManager.simulateAgentBroadcast({
        agent: 'tea',
        persona: {
          character: 'Igor',
          theme: 'discworld',
          role: 'tea',
        },
      });

      // Should have called updatePersona
      expect(updateSpy).toHaveBeenCalledWith({
        character: 'Igor',
        theme: 'discworld',
        role: 'tea',
      });
    });

    it('should unsubscribe from agent channel on dispose', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );

      // Set up the WebSocket manager
      (provider as any).setWebSocketManager(mockWsManager);
      expect(mockWsManager.getAgentListenerCount()).toBe(1);

      // Dispose the provider
      provider.dispose();

      // Should have unsubscribed
      expect(mockWsManager.getAgentListenerCount()).toBe(0);
    });

    it('should handle broadcasts even without WebSocket (file watcher fallback)', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // File watchers should still work even without WebSocket
      provider.startFileWatchers();

      // updatePersona should work regardless
      provider.updatePersona({ character: 'Test', theme: 'test-theme', role: 'dev' });
      expect(webviewView.webview.postMessage).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // AC2: Portrait image updates to new agent's portrait
  // ========================================================================
  describe('AC2: Portrait image updates to new agent', () => {
    it('should update portrait when agent changes via broadcast', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);
      (provider as any).setWebSocketManager(mockWsManager);

      // Initial state with one agent
      provider.updatePersona({ character: 'Igor', theme: 'discworld', role: 'tea' });
      webviewView.webview.postMessage.mockClear();

      // Broadcast new agent
      mockWsManager.simulateAgentBroadcast({
        agent: 'dev',
        persona: {
          character: 'Ponder Stibbons',
          theme: 'discworld',
          role: 'dev',
        },
      });

      // Should have sent message with new portrait info
      expect(webviewView.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'personaUpdate',
          persona: expect.objectContaining({
            role: 'dev',
          }),
        })
      );
    });

    it('should include portraitExists flag in update message', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);
      (provider as any).setWebSocketManager(mockWsManager);

      // Mock portrait exists check
      vi.spyOn(provider, 'checkPortraitExists').mockReturnValue(true);

      // Broadcast agent change
      mockWsManager.simulateAgentBroadcast({
        agent: 'sm',
        persona: {
          character: 'Captain Carrot',
          theme: 'discworld',
          role: 'sm',
        },
      });

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          portraitExists: true,
        })
      );
    });

    it('should handle theme change affecting portrait path', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);
      (provider as any).setWebSocketManager(mockWsManager);

      // Initial with discworld theme
      provider.updatePersona({ character: 'Igor', theme: 'discworld', role: 'tea' });

      const getPortraitSpy = vi.spyOn(provider, 'getPortraitPath');

      // Broadcast with different theme
      mockWsManager.simulateAgentBroadcast({
        agent: 'tea',
        persona: {
          character: 'Themis',
          theme: 'greek-mythology',
          role: 'tea',
        },
      });

      // Should look for portrait in new theme directory
      expect(getPortraitSpy).toHaveBeenCalledWith('greek-mythology', 'tea');
    });
  });

  // ========================================================================
  // AC3: Character name and theme badge update to new agent's data
  // ========================================================================
  describe('AC3: Character name and theme badge update', () => {
    it('should update character name when broadcast is received', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);
      (provider as any).setWebSocketManager(mockWsManager);

      // Broadcast with specific character name
      mockWsManager.simulateAgentBroadcast({
        agent: 'reviewer',
        persona: {
          character: 'Granny Weatherwax',
          theme: 'discworld',
          role: 'reviewer',
        },
      });

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          persona: expect.objectContaining({
            character: 'Granny Weatherwax',
          }),
        })
      );
    });

    it('should update theme badge when broadcast includes new theme', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);
      (provider as any).setWebSocketManager(mockWsManager);

      // Broadcast with new theme
      mockWsManager.simulateAgentBroadcast({
        agent: 'pm',
        persona: {
          character: 'Athena',
          theme: 'greek-mythology',
          role: 'pm',
        },
      });

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          persona: expect.objectContaining({
            theme: 'greek-mythology',
          }),
        })
      );
    });

    it('should update role display when agent role changes', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);
      (provider as any).setWebSocketManager(mockWsManager);

      // Broadcast with architect role
      mockWsManager.simulateAgentBroadcast({
        agent: 'architect',
        persona: {
          character: 'Leonard of Quirm',
          theme: 'discworld',
          role: 'architect',
        },
      });

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          persona: expect.objectContaining({
            role: 'architect',
          }),
        })
      );
    });

    it('should handle multiple rapid broadcasts correctly', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);
      (provider as any).setWebSocketManager(mockWsManager);

      // Simulate rapid broadcasts
      mockWsManager.simulateAgentBroadcast({
        agent: 'sm',
        persona: { character: 'Carrot', theme: 'discworld', role: 'sm' },
      });
      mockWsManager.simulateAgentBroadcast({
        agent: 'tea',
        persona: { character: 'Igor', theme: 'discworld', role: 'tea' },
      });
      mockWsManager.simulateAgentBroadcast({
        agent: 'dev',
        persona: { character: 'Ponder', theme: 'discworld', role: 'dev' },
      });

      // Should have processed all three
      expect(webviewView.webview.postMessage).toHaveBeenCalledTimes(3);

      // Last call should have the final agent
      const lastCall = webviewView.webview.postMessage.mock.calls[2][0];
      expect(lastCall.persona.character).toBe('Ponder');
    });
  });

  // ========================================================================
  // AC4: Updates complete within 1 second of broadcast
  // ========================================================================
  describe('AC4: Updates complete within 1 second', () => {
    it('should process broadcast and post message in under 1 second', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);
      (provider as any).setWebSocketManager(mockWsManager);

      const startTime = performance.now();

      // Simulate broadcast
      mockWsManager.simulateAgentBroadcast({
        agent: 'orchestrator',
        persona: {
          character: 'DEATH',
          theme: 'discworld',
          role: 'orchestrator',
        },
      });

      const endTime = performance.now();
      const elapsed = endTime - startTime;

      // Should complete in under 1000ms (actually should be < 10ms)
      expect(elapsed).toBeLessThan(1000);
      expect(webviewView.webview.postMessage).toHaveBeenCalled();
    });

    it('should not block on portrait existence check', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);
      (provider as any).setWebSocketManager(mockWsManager);

      // Mock a slow portrait check (but it should be sync, not async)
      const originalCheck = provider.checkPortraitExists.bind(provider);
      let checkCalled = false;
      vi.spyOn(provider, 'checkPortraitExists').mockImplementation((theme, role) => {
        checkCalled = true;
        return originalCheck(theme, role);
      });

      const startTime = performance.now();

      mockWsManager.simulateAgentBroadcast({
        agent: 'dev',
        persona: {
          character: 'Ponder',
          theme: 'discworld',
          role: 'dev',
        },
      });

      const elapsed = performance.now() - startTime;

      expect(checkCalled).toBe(true);
      expect(elapsed).toBeLessThan(1000);
    });

    it('should handle 10 consecutive broadcasts in under 1 second total', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);
      (provider as any).setWebSocketManager(mockWsManager);

      const agents = [
        { agent: 'sm', character: 'Carrot', role: 'sm' },
        { agent: 'tea', character: 'Igor', role: 'tea' },
        { agent: 'dev', character: 'Ponder', role: 'dev' },
        { agent: 'reviewer', character: 'Granny', role: 'reviewer' },
        { agent: 'architect', character: 'Leonard', role: 'architect' },
        { agent: 'pm', character: 'Vetinari', role: 'pm' },
        { agent: 'tech-writer', character: 'Sacharissa', role: 'tech-writer' },
        { agent: 'ux-designer', character: 'Adora', role: 'ux-designer' },
        { agent: 'devops', character: 'Lu-Tze', role: 'devops' },
        { agent: 'orchestrator', character: 'DEATH', role: 'orchestrator' },
      ];

      const startTime = performance.now();

      for (const agent of agents) {
        mockWsManager.simulateAgentBroadcast({
          agent: agent.agent,
          persona: {
            character: agent.character,
            theme: 'discworld',
            role: agent.role,
          },
        });
      }

      const elapsed = performance.now() - startTime;

      // 10 broadcasts should still complete in under 1 second
      expect(elapsed).toBeLessThan(1000);
      expect(webviewView.webview.postMessage).toHaveBeenCalledTimes(10);
    });
  });

  // ========================================================================
  // Integration: WebSocket and file watcher coexistence
  // ========================================================================
  describe('Integration: WebSocket and file watcher coexistence', () => {
    it('should work with both WebSocket and file watchers active', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Start both
      provider.startFileWatchers();
      (provider as any).setWebSocketManager(mockWsManager);

      // WebSocket should work
      mockWsManager.simulateAgentBroadcast({
        agent: 'tea',
        persona: { character: 'Igor', theme: 'discworld', role: 'tea' },
      });

      expect(webviewView.webview.postMessage).toHaveBeenCalled();
    });

    it('should not fail if WebSocketManager is not set', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Don't set WebSocketManager - should not throw
      expect(() => {
        provider.updatePersona({ character: 'Test', theme: 'test', role: 'dev' });
      }).not.toThrow();
    });

    it('should clean up both WebSocket and file watchers on dispose', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );

      provider.startFileWatchers();
      (provider as any).setWebSocketManager(mockWsManager);

      expect(mockWsManager.hasAgentListeners()).toBe(true);

      // Dispose
      provider.dispose();

      // WebSocket listener should be removed
      expect(mockWsManager.hasAgentListeners()).toBe(false);
    });
  });
});
