/**
 * MSSCI-12051: Webview panel for Cyclist UI
 *
 * BDD-style tests for the Cyclist webview panel in VS Code.
 * Tests are written to FAIL until Dev implements the webview provider.
 *
 * Acceptance Criteria:
 * - AC1: Webview renders Cyclist components (stats-strip, persona, story panels)
 * - AC2: CSP allows script/style loading (nonce-based, no inline violations)
 * - AC3: Theme syncs with VS Code appearance (light/dark detection minimum)
 * - AC4: Stats/story panels update in real-time via WheelHub
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

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
  viewType = 'pennyfarthing.cyclistPanel';
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
  }));
  private _messageHandler?: (message: any) => void;

  // Helper to simulate message from webview
  simulateMessage(message: any) {
    if (this._messageHandler) {
      this._messageHandler(message);
    }
  }
}

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

// Mock ColorTheme
const mockColorTheme = {
  kind: 2, // ColorThemeKind.Dark
};

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

// ColorThemeKind enum
const ColorThemeKind = {
  Light: 1,
  Dark: 2,
  HighContrast: 3,
  HighContrastLight: 4,
};

const mockVscode = {
  chat: {
    createChatParticipant: vi.fn(
      (id: string, handler: any) => new MockChatParticipant(id, handler)
    ),
  },
  window: {
    createOutputChannel: vi.fn(() => mockOutputChannel),
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
    activeColorTheme: mockColorTheme,
    onDidChangeActiveColorTheme: vi.fn((handler) => {
      return { dispose: vi.fn() };
    }),
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
    joinPath: vi.fn((base: any, ...segments: string[]) => ({
      fsPath: [base.fsPath, ...segments].join('/'),
      scheme: 'file',
    })),
  },
  EventEmitter: MockEventEmitter,
  ColorThemeKind,
  env: {
    openExternal: vi.fn(),
  },
};

vi.mock('vscode', () => mockVscode);

describe('MSSCI-12051: Webview panel for Cyclist UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.subscriptions = [];
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ========================================================================
  // AC1: Webview renders Cyclist components (stats-strip, persona, story panels)
  // ========================================================================
  describe('AC1: Webview renders Cyclist components', () => {
    it('should have providers/cyclist-webview.ts file', async () => {
      const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const webviewPath = join(__dirname, '..', 'src', 'providers', 'cyclist-webview.ts');
      expect(existsSync(webviewPath)).toBe(true);
    });

    it('should export CyclistWebviewProvider class', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      expect(webviewModule.CyclistWebviewProvider).toBeDefined();
    });

    it('should implement WebviewViewProvider interface', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      expect(typeof provider.resolveWebviewView).toBe('function');
    });

    it('should register webview provider with id "pennyfarthing.cyclistPanel"', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      expect(mockVscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(
        'pennyfarthing.cyclistPanel',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should include stats-strip component in HTML output', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toContain('stats-strip');
    });

    it('should include persona component in HTML output', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toContain('persona');
    });

    it('should include story panel component in HTML output', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toContain('story');
    });

    it('should set localResourceRoots for webview', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.options.localResourceRoots).toBeDefined();
      expect(webviewView.webview.options.localResourceRoots.length).toBeGreaterThan(0);
    });

    it('should enable scripts in webview options', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.options.enableScripts).toBe(true);
    });
  });

  // ========================================================================
  // AC2: CSP allows script/style loading (nonce-based, no inline violations)
  // ========================================================================
  describe('AC2: CSP-compliant script/style loading', () => {
    it('should generate unique nonce for each webview instance', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);

      const nonce1 = provider.generateNonce();
      const nonce2 = provider.generateNonce();

      expect(nonce1).not.toBe(nonce2);
      expect(nonce1.length).toBeGreaterThanOrEqual(32);
    });

    it('should include Content-Security-Policy meta tag', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toContain('Content-Security-Policy');
    });

    it('should include nonce in CSP for script-src', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // CSP should contain script-src with nonce
      expect(webviewView.webview.html).toMatch(/script-src[^;]*'nonce-[a-zA-Z0-9]+'/);
    });

    it('should include nonce in CSP for style-src', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // CSP should contain style-src with nonce
      expect(webviewView.webview.html).toMatch(/style-src[^;]*'nonce-[a-zA-Z0-9]+'/);
    });

    it('should add nonce attribute to all script tags', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // All script tags should have nonce attribute
      const scriptTags = webviewView.webview.html.match(/<script[^>]*>/g) || [];
      scriptTags.forEach((tag) => {
        expect(tag).toMatch(/nonce="[a-zA-Z0-9]+"/);
      });
    });

    it('should add nonce attribute to all style tags', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // All style tags should have nonce attribute
      const styleTags = webviewView.webview.html.match(/<style[^>]*>/g) || [];
      styleTags.forEach((tag) => {
        expect(tag).toMatch(/nonce="[a-zA-Z0-9]+"/);
      });
    });

    it('should use webview.cspSource in CSP', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toContain(webviewView.webview.cspSource);
    });

    it('should not have unsafe-inline without nonce', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Should not have bare unsafe-inline (only with nonce fallback if present)
      const cspMatch = webviewView.webview.html.match(/content="[^"]*script-src[^"]*"/i);
      if (cspMatch) {
        // If unsafe-inline is present, nonce must also be present
        if (cspMatch[0].includes("'unsafe-inline'")) {
          expect(cspMatch[0]).toMatch(/'nonce-/);
        }
      }
    });

    it('should convert external scripts to webview URIs', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Script src should use webview URI scheme
      expect(webviewView.webview.html).toMatch(/src="vscode-webview:/);
    });
  });

  // ========================================================================
  // AC3: Theme syncs with VS Code appearance (light/dark detection minimum)
  // ========================================================================
  describe('AC3: Theme synchronization with VS Code', () => {
    it('should detect dark theme from VS Code', async () => {
      mockVscode.window.activeColorTheme.kind = ColorThemeKind.Dark;

      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);

      const theme = provider.detectVSCodeTheme();
      expect(theme).toBe('dark');
    });

    it('should detect light theme from VS Code', async () => {
      mockVscode.window.activeColorTheme.kind = ColorThemeKind.Light;

      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);

      const theme = provider.detectVSCodeTheme();
      expect(theme).toBe('light');
    });

    it('should detect high contrast theme from VS Code', async () => {
      mockVscode.window.activeColorTheme.kind = ColorThemeKind.HighContrast;

      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);

      const theme = provider.detectVSCodeTheme();
      expect(theme).toBe('high-contrast');
    });

    it('should set initial theme class on body', async () => {
      mockVscode.window.activeColorTheme.kind = ColorThemeKind.Dark;

      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toMatch(/class="[^"]*vscode-dark[^"]*"/);
    });

    it('should subscribe to onDidChangeActiveColorTheme', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(mockVscode.window.onDidChangeActiveColorTheme).toHaveBeenCalled();
    });

    it('should post theme update message when VS Code theme changes', async () => {
      let themeChangeHandler: ((theme: any) => void) | undefined;
      mockVscode.window.onDidChangeActiveColorTheme = vi.fn((handler) => {
        themeChangeHandler = handler;
        return { dispose: vi.fn() };
      });

      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Simulate theme change
      if (themeChangeHandler) {
        themeChangeHandler({ kind: ColorThemeKind.Light });
      }

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'themeChange',
        theme: 'light',
      });
    });

    it('should include VS Code CSS variables for theming', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Should reference VS Code CSS variables
      expect(webviewView.webview.html).toMatch(/var\(--vscode-/);
    });

    it('should map VS Code colors to Cyclist theme variables', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);

      const mapping = provider.getThemeVariableMapping();

      expect(mapping).toHaveProperty('--cyclist-bg');
      expect(mapping['--cyclist-bg']).toMatch(/--vscode-/);
    });
  });

  // ========================================================================
  // AC4: Stats/story panels update in real-time via WheelHub
  // ========================================================================
  describe('AC4: Real-time updates via WheelHub', () => {
    it('should have method to connect to WheelHub', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);

      expect(typeof provider.connectToWheelHub).toBe('function');
    });

    it('should forward stats updates to webview', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const { WebSocketManager } = await import('../src/server/websocket-manager');

      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();
      const wsManager = new WebSocketManager();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);
      provider.connectToWheelHub(wsManager);

      // Simulate stats broadcast
      wsManager.broadcastStats({
        persona: { character: 'Tyrion Lannister', role: 'dev', theme: 'game-of-thrones' },
        context: { usablePercent: 45 },
      });

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'stats',
        data: expect.objectContaining({
          persona: expect.any(Object),
          context: expect.any(Object),
        }),
      });
    });

    it('should forward story updates to webview', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const { WebSocketManager } = await import('../src/server/websocket-manager');

      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();
      const wsManager = new WebSocketManager();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);
      provider.connectToWheelHub(wsManager);

      // Simulate story broadcast
      wsManager.broadcastStory({
        id: 'MSSCI-12051',
        title: 'Webview panel for Cyclist UI',
        phase: 'red',
        branch: 'feat/MSSCI-12051-webview-cyclist-ui',
      });

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'story',
        data: expect.objectContaining({
          id: 'MSSCI-12051',
        }),
      });
    });

    it('should handle messages from webview', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Verify message handler was registered
      expect(webviewView.webview.onDidReceiveMessage).toHaveBeenCalled();
    });

    it('should execute command when webview sends executeCommand message', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Simulate command request from webview
      webviewView.webview.simulateMessage({
        type: 'executeCommand',
        command: 'pennyfarthing.switchAgent',
      });

      expect(mockVscode.commands.executeCommand).toHaveBeenCalledWith('pennyfarthing.switchAgent');
    });

    it('should cleanup WheelHub subscription on dispose', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const { WebSocketManager } = await import('../src/server/websocket-manager');

      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();
      const wsManager = new WebSocketManager();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);
      provider.connectToWheelHub(wsManager);

      // Dispose provider
      provider.dispose();

      // Broadcast should not cause errors after dispose
      expect(() => {
        wsManager.broadcastStats({
          persona: { character: 'Test', role: 'dev', theme: 'test' },
        });
      }).not.toThrow();
    });

    it('should show reconnecting state when WheelHub disconnects', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      provider.handleWheelHubDisconnect();

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'connectionStatus',
        status: 'reconnecting',
      });
    });

    it('should show connected state when WheelHub reconnects', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      provider.handleWheelHubConnect();

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'connectionStatus',
        status: 'connected',
      });
    });

    it('should request initial state when webview becomes visible', async () => {
      const webviewModule = await import('../src/providers/cyclist-webview');
      const { WebSocketManager } = await import('../src/server/websocket-manager');

      const provider = new webviewModule.CyclistWebviewProvider(mockContext.extensionUri as any);
      const webviewView = new MockWebviewView();
      const wsManager = new WebSocketManager();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);
      provider.connectToWheelHub(wsManager);

      // Simulate webview requesting initial state
      webviewView.webview.simulateMessage({ type: 'requestInitialState' });

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'initialState',
        })
      );
    });
  });

  // ========================================================================
  // Message Handler Tests
  // ========================================================================
  describe('WebviewMessageHandler', () => {
    it('should have webview-message-handler.ts file', async () => {
      const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const handlerPath = join(__dirname, '..', 'src', 'providers', 'webview-message-handler.ts');
      expect(existsSync(handlerPath)).toBe(true);
    });

    it('should export WebviewMessageHandler class', async () => {
      const handlerModule = await import('../src/providers/webview-message-handler');
      expect(handlerModule.WebviewMessageHandler).toBeDefined();
    });

    it('should route stats messages to webview', async () => {
      const handlerModule = await import('../src/providers/webview-message-handler');
      const webviewView = new MockWebviewView();
      const handler = new handlerModule.WebviewMessageHandler(webviewView.webview as any);

      handler.handleStats({
        persona: { character: 'Test', role: 'dev', theme: 'test' },
        context: { usablePercent: 50 },
      });

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'stats',
        data: expect.any(Object),
      });
    });

    it('should route story messages to webview', async () => {
      const handlerModule = await import('../src/providers/webview-message-handler');
      const webviewView = new MockWebviewView();
      const handler = new handlerModule.WebviewMessageHandler(webviewView.webview as any);

      handler.handleStory({
        id: 'MSSCI-12051',
        title: 'Test Story',
        phase: 'red',
        branch: 'feat/test',
      });

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'story',
        data: expect.any(Object),
      });
    });

    it('should handle command execution requests from webview', async () => {
      const handlerModule = await import('../src/providers/webview-message-handler');
      const webviewView = new MockWebviewView();
      const handler = new handlerModule.WebviewMessageHandler(webviewView.webview as any);

      await handler.handleWebviewMessage({
        type: 'executeCommand',
        command: 'pennyfarthing.refresh',
        args: [],
      });

      expect(mockVscode.commands.executeCommand).toHaveBeenCalledWith('pennyfarthing.refresh');
    });
  });

  // ========================================================================
  // Cyclist Adapter Tests
  // ========================================================================
  describe('Cyclist Adapter Layer', () => {
    it('should have webview/cyclist-adapter.js file', async () => {
      const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const adapterPath = join(__dirname, '..', 'src', 'webview', 'cyclist-adapter.js');
      expect(existsSync(adapterPath)).toBe(true);
    });

    it('should have webview/cyclist-panel.html file', async () => {
      const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const htmlPath = join(__dirname, '..', 'src', 'webview', 'cyclist-panel.html');
      expect(existsSync(htmlPath)).toBe(true);
    });

    it('should have webview/styles.css file', async () => {
      const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const cssPath = join(__dirname, '..', 'src', 'webview', 'styles.css');
      expect(existsSync(cssPath)).toBe(true);
    });
  });

  // ========================================================================
  // Package.json contribution tests
  // ========================================================================
  describe('Package.json contributions', () => {
    it('should have cyclistPanel view contribution in package.json', async () => {
      const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const packagePath = join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

      const views = packageJson.contributes?.views?.pennyfarthing || [];
      const cyclistView = views.find((v: any) => v.id === 'pennyfarthing.cyclistPanel');

      expect(cyclistView).toBeDefined();
      expect(cyclistView.type).toBe('webview');
    });

    it('should have cyclistPanel view with correct name', async () => {
      const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const packagePath = join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

      const views = packageJson.contributes?.views?.pennyfarthing || [];
      const cyclistView = views.find((v: any) => v.id === 'pennyfarthing.cyclistPanel');

      expect(cyclistView.name).toBe('Cyclist');
    });
  });
});
