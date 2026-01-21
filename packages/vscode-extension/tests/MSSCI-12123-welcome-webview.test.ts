/**
 * MSSCI-12123: Welcome view with onboarding flow
 *
 * BDD-style tests for the Welcome webview panel in VS Code.
 * Tests are written to FAIL until Dev implements the webview provider.
 *
 * Acceptance Criteria:
 * - AC1: Welcome view appears automatically on first extension activation
 * - AC2: Welcome view displays Pennyfarthing description and agent roster
 * - AC3: Quick-start buttons invoke correct commands when clicked
 * - AC4: "Don't show again" persists preference in globalState
 * - AC5: Welcome view follows existing webview CSP patterns
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
  viewType = 'pennyfarthing.welcomePanel';
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

// Mock globalState for first-run detection
const mockGlobalState = {
  get: vi.fn((key: string, defaultValue?: any) => defaultValue),
  update: vi.fn(),
  keys: vi.fn(() => []),
  setKeysForSync: vi.fn(),
};

const mockContext = {
  subscriptions: [] as { dispose: () => void }[],
  workspaceState: { get: vi.fn(), update: vi.fn() },
  globalState: mockGlobalState,
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
    parse: vi.fn((url: string) => ({ toString: () => url, scheme: 'https' })),
  },
  EventEmitter: MockEventEmitter,
  ColorThemeKind,
  env: {
    openExternal: vi.fn(),
  },
};

vi.mock('vscode', () => mockVscode);

describe('MSSCI-12123: Welcome view with onboarding flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.subscriptions = [];
    mockGlobalState.get.mockImplementation((key: string, defaultValue?: any) => defaultValue);
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ========================================================================
  // AC1: Welcome view appears automatically on first extension activation
  // ========================================================================
  describe('AC1: Welcome view appears on first activation', () => {
    it('should have providers/welcome-webview.ts file', async () => {
      const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const webviewPath = join(__dirname, '..', 'src', 'providers', 'welcome-webview.ts');
      expect(existsSync(webviewPath)).toBe(true);
    });

    it('should export WelcomeWebviewProvider class', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      expect(webviewModule.WelcomeWebviewProvider).toBeDefined();
    });

    it('should implement WebviewViewProvider interface', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      expect(typeof provider.resolveWebviewView).toBe('function');
    });

    it('should register webview provider with id "pennyfarthing.welcomePanel"', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      expect(mockVscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(
        'pennyfarthing.welcomePanel',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should check globalState for hasSeenWelcome on activation', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );

      expect(provider.hasUserSeenWelcome()).toBe(false);
      expect(mockGlobalState.get).toHaveBeenCalledWith('hasSeenWelcome', false);
    });

    it('should return true for hasUserSeenWelcome when previously dismissed', async () => {
      mockGlobalState.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'hasSeenWelcome') return true;
        return defaultValue;
      });

      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );

      expect(provider.hasUserSeenWelcome()).toBe(true);
    });

    it('should have static viewType property set to "pennyfarthing.welcomePanel"', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      expect(webviewModule.WelcomeWebviewProvider.viewType).toBe('pennyfarthing.welcomePanel');
    });

    it('should reveal sidebar on first activation when hasSeenWelcome is false', async () => {
      // Ensure hasSeenWelcome returns false (first run)
      mockGlobalState.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'hasSeenWelcome') return false;
        return defaultValue;
      });

      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      // Verify sidebar reveal command was executed
      expect(mockVscode.commands.executeCommand).toHaveBeenCalledWith(
        'workbench.view.extension.pennyfarthing'
      );
    });

    it('should NOT reveal sidebar when hasSeenWelcome is true', async () => {
      // Simulate user has already seen welcome
      mockGlobalState.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'hasSeenWelcome') return true;
        return defaultValue;
      });

      // Clear any previous calls
      mockVscode.commands.executeCommand.mockClear();

      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      // Verify sidebar reveal command was NOT called
      expect(mockVscode.commands.executeCommand).not.toHaveBeenCalledWith(
        'workbench.view.extension.pennyfarthing'
      );
    });
  });

  // ========================================================================
  // AC2: Welcome view displays Pennyfarthing description and agent roster
  // ========================================================================
  describe('AC2: Welcome view displays description and agent roster', () => {
    it('should include Pennyfarthing description in HTML output', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toContain('Pennyfarthing');
    });

    it('should include "What is Pennyfarthing" section', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Should have explanation content
      expect(webviewView.webview.html.toLowerCase()).toMatch(/what is|about|welcome/);
    });

    it('should display SM agent with description', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toMatch(/SM|Scrum Master/i);
    });

    it('should display TEA agent with description', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toMatch(/TEA|Test Engineer/i);
    });

    it('should display Dev agent with description', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toMatch(/Dev|Developer/i);
    });

    it('should display Reviewer agent with description', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toMatch(/Reviewer|Code Review/i);
    });

    it('should have agent roster section with class "agent-roster"', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toContain('agent-roster');
    });
  });

  // ========================================================================
  // AC3: Quick-start buttons invoke correct commands when clicked
  // ========================================================================
  describe('AC3: Quick-start buttons invoke correct commands', () => {
    it('should include "Start Work" button in HTML', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toMatch(/Start Work|start-work/i);
    });

    it('should include "View Backlog" button in HTML', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toMatch(/View Backlog|view-backlog/i);
    });

    it('should include "Switch Theme" button in HTML', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toMatch(/Switch Theme|switch-theme|theme/i);
    });

    it('should execute pennyfarthing.startWork when Start Work button clicked', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Simulate button click from webview
      webviewView.webview.simulateMessage({
        type: 'executeCommand',
        command: 'pennyfarthing.startWork',
      });

      expect(mockVscode.commands.executeCommand).toHaveBeenCalledWith('pennyfarthing.startWork');
    });

    it('should execute pennyfarthing.viewBacklog when View Backlog button clicked', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Simulate button click from webview
      webviewView.webview.simulateMessage({
        type: 'executeCommand',
        command: 'pennyfarthing.viewBacklog',
      });

      expect(mockVscode.commands.executeCommand).toHaveBeenCalledWith('pennyfarthing.viewBacklog');
    });

    it('should include documentation link', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toMatch(/documentation|docs|github/i);
    });

    it('should have quick-actions section with class "quick-actions"', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toContain('quick-actions');
    });
  });

  // ========================================================================
  // AC4: "Don't show again" persists preference in globalState
  // ========================================================================
  describe('AC4: Don\'t show again persists preference', () => {
    it('should include "Don\'t show again" option in HTML', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toMatch(/don't show|dismiss|hide/i);
    });

    it('should update globalState when dismiss message received', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Simulate dismiss from webview
      webviewView.webview.simulateMessage({
        type: 'dismiss',
      });

      expect(mockGlobalState.update).toHaveBeenCalledWith('hasSeenWelcome', true);
    });

    it('should have dismissWelcome method on provider', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );

      expect(typeof provider.dismissWelcome).toBe('function');
    });

    it('should persist dismiss preference across sessions', async () => {
      // First session: dismiss welcome
      mockGlobalState.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'hasSeenWelcome') return false;
        return defaultValue;
      });

      const webviewModule = await import('../src/providers/welcome-webview');
      const provider1 = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );

      await provider1.dismissWelcome();

      expect(mockGlobalState.update).toHaveBeenCalledWith('hasSeenWelcome', true);

      // Second session: should remember
      mockGlobalState.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'hasSeenWelcome') return true;
        return defaultValue;
      });

      const provider2 = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );

      expect(provider2.hasUserSeenWelcome()).toBe(true);
    });
  });

  // ========================================================================
  // AC5: Welcome view follows existing webview CSP patterns
  // ========================================================================
  describe('AC5: CSP-compliant webview patterns', () => {
    it('should generate unique nonce for each webview instance', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );

      const nonce1 = provider.generateNonce();
      const nonce2 = provider.generateNonce();

      expect(nonce1).not.toBe(nonce2);
      expect(nonce1.length).toBeGreaterThanOrEqual(32);
    });

    it('should include Content-Security-Policy meta tag', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toContain('Content-Security-Policy');
    });

    it('should include nonce in CSP for script-src', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // CSP should contain script-src with nonce
      expect(webviewView.webview.html).toMatch(/script-src[^;]*'nonce-[a-zA-Z0-9]+'/);
    });

    it('should add nonce attribute to all script tags', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // All script tags should have nonce attribute
      const scriptTags = webviewView.webview.html.match(/<script[^>]*>/g) || [];
      scriptTags.forEach((tag) => {
        expect(tag).toMatch(/nonce="[a-zA-Z0-9]+"/);
      });
    });

    it('should use webview.cspSource in CSP', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toContain(webviewView.webview.cspSource);
    });

    it('should enable scripts in webview options', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.options.enableScripts).toBe(true);
    });

    it('should set localResourceRoots for webview', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.options.localResourceRoots).toBeDefined();
      expect(webviewView.webview.options.localResourceRoots.length).toBeGreaterThan(0);
    });

    it('should convert external scripts to webview URIs', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Script src should use webview URI scheme
      expect(webviewView.webview.html).toMatch(/src="vscode-webview:/);
    });
  });

  // ========================================================================
  // Package.json contribution tests
  // ========================================================================
  describe('Package.json contributions', () => {
    it('should have welcomePanel view contribution in package.json', async () => {
      const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const packagePath = join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

      const views = packageJson.contributes?.views?.pennyfarthing || [];
      const welcomeView = views.find((v: any) => v.id === 'pennyfarthing.welcomePanel');

      expect(welcomeView).toBeDefined();
      expect(welcomeView.type).toBe('webview');
    });

    it('should have welcomePanel view with correct name', async () => {
      const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const packagePath = join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

      const views = packageJson.contributes?.views?.pennyfarthing || [];
      const welcomeView = views.find((v: any) => v.id === 'pennyfarthing.welcomePanel');

      expect(welcomeView.name).toBe('Welcome');
    });

    it('should have welcomePanel view listed before other views', async () => {
      const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const packagePath = join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

      const views = packageJson.contributes?.views?.pennyfarthing || [];
      const welcomeIndex = views.findIndex((v: any) => v.id === 'pennyfarthing.welcomePanel');

      // Welcome should be first in the list
      expect(welcomeIndex).toBe(0);
    });
  });

  // ========================================================================
  // Webview Adapter tests
  // ========================================================================
  describe('Welcome Webview Adapter', () => {
    it('should have webview/welcome-adapter.js file', async () => {
      const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const adapterPath = join(__dirname, '..', 'src', 'webview', 'welcome-adapter.js');
      expect(existsSync(adapterPath)).toBe(true);
    });

    it('should have webview/welcome-styles.css file', async () => {
      const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const cssPath = join(__dirname, '..', 'src', 'webview', 'welcome-styles.css');
      expect(existsSync(cssPath)).toBe(true);
    });
  });

  // ========================================================================
  // Message handling tests
  // ========================================================================
  describe('Message handling', () => {
    it('should handle messages from webview', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Verify message handler was registered
      expect(webviewView.webview.onDidReceiveMessage).toHaveBeenCalled();
    });

    it('should open external URL when openExternal message received', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Simulate openExternal message from webview
      webviewView.webview.simulateMessage({
        type: 'openExternal',
        url: 'https://github.com/1898andCo/pennyfarthing',
      });

      expect(mockVscode.env.openExternal).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Disposal tests
  // ========================================================================
  describe('Provider disposal', () => {
    it('should have dispose method', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );

      expect(typeof provider.dispose).toBe('function');
    });

    it('should cleanup resources on dispose', async () => {
      const webviewModule = await import('../src/providers/welcome-webview');
      const provider = new webviewModule.WelcomeWebviewProvider(
        mockContext.extensionUri as any,
        mockContext.globalState as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Should not throw on dispose
      expect(() => provider.dispose()).not.toThrow();
    });
  });
});
