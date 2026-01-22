/**
 * MSSCI-12148: Agent portrait webview panel, remove Cyclist pane
 *
 * BDD-style tests for the Agent Portrait webview panel in VS Code.
 * Tests are written to FAIL until Dev implements the webview provider.
 *
 * Acceptance Criteria:
 * - AC1: New "Agent Portrait" webview panel appears in Pennyfarthing sidebar
 * - AC2: Portraits packaged into extension resources during build
 * - AC3: Portrait image loads via asWebviewUri() for current agent/theme
 * - AC4: Character name and role displayed below portrait
 * - AC5: Panel updates when agent changes via WheelHub onStats() listener
 * - AC6: Fallback display when no portrait exists (show agent name/icon)
 * - AC7: Works with VS Code light and dark themes
 * - AC8: Cyclist pane completely removed from sidebar
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

  // Helper to simulate message from webview
  simulateMessage(message: any) {
    if (this._messageHandler) {
      this._messageHandler(message);
    }
  }
}

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

// StatusBarAlignment enum
const StatusBarAlignment = {
  Left: 1,
  Right: 2,
};

// ThemeColor mock
class MockThemeColor {
  constructor(public id: string) {}
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
    createOutputChannel: vi.fn(() => mockOutputChannel),
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
    activeColorTheme: mockColorTheme,
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

describe('MSSCI-12148: Agent portrait webview panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.subscriptions = [];
    mockGlobalState.get.mockImplementation((key: string, defaultValue?: any) => defaultValue);
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ========================================================================
  // AC1: New "Agent Portrait" webview panel appears in Pennyfarthing sidebar
  // ========================================================================
  describe('AC1: Agent Portrait panel appears in sidebar', () => {
    it('should have providers/agent-portrait-webview.ts file', async () => {
      const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const webviewPath = join(__dirname, '..', 'src', 'providers', 'agent-portrait-webview.ts');
      expect(existsSync(webviewPath)).toBe(true);
    });

    it('should export AgentPortraitWebviewProvider class', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      expect(webviewModule.AgentPortraitWebviewProvider).toBeDefined();
    });

    it('should implement WebviewViewProvider interface', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      expect(typeof provider.resolveWebviewView).toBe('function');
    });

    it('should have static viewType property set to "pennyfarthing.agentPortrait"', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      expect(webviewModule.AgentPortraitWebviewProvider.viewType).toBe('pennyfarthing.agentPortrait');
    });

    it('should register webview provider with id "pennyfarthing.agentPortrait"', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      expect(mockVscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(
        'pennyfarthing.agentPortrait',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should have agentPortrait view contribution in package.json', async () => {
      const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const packagePath = join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

      const views = packageJson.contributes?.views?.pennyfarthing || [];
      const portraitView = views.find((v: any) => v.id === 'pennyfarthing.agentPortrait');

      expect(portraitView).toBeDefined();
      expect(portraitView.type).toBe('webview');
    });

    it('should have agentPortrait view with correct name', async () => {
      const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const packagePath = join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

      const views = packageJson.contributes?.views?.pennyfarthing || [];
      const portraitView = views.find((v: any) => v.id === 'pennyfarthing.agentPortrait');

      expect(portraitView.name).toBe('Agent Portrait');
    });

    it('should enable scripts in webview options', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.options.enableScripts).toBe(true);
    });

    it('should set localResourceRoots including portraits directory', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.options.localResourceRoots).toBeDefined();
      expect(webviewView.webview.options.localResourceRoots.length).toBeGreaterThan(0);
      // Should include portraits directory
      const portraitsIncluded = webviewView.webview.options.localResourceRoots.some(
        (root: any) => root.fsPath.includes('portraits')
      );
      expect(portraitsIncluded).toBe(true);
    });
  });

  // ========================================================================
  // AC2: Portraits packaged into extension resources during build
  // ========================================================================
  describe('AC2: Portraits packaged into extension resources', () => {
    it('should have copy-portraits script in package.json', async () => {
      const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const packagePath = join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

      // Check for copy-portraits script or build script that copies portraits
      const hasPortraitScript = packageJson.scripts?.['copy-portraits'] !== undefined ||
        packageJson.scripts?.build?.includes('portraits') ||
        packageJson.scripts?.['prebuild']?.includes('portraits');

      expect(hasPortraitScript).toBe(true);
    });

    it('should have portraits included in .vscodeignore', async () => {
      const { readFileSync, existsSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const vscodeignorePath = join(__dirname, '..', '.vscodeignore');

      // Check if .vscodeignore exists and does NOT exclude portraits
      if (existsSync(vscodeignorePath)) {
        const content = readFileSync(vscodeignorePath, 'utf-8');
        // Should NOT have !resources/portraits/** negation OR should have resources/portraits included
        const excludesPortraits = content.includes('resources/portraits/**') &&
          !content.includes('!resources/portraits/**');
        expect(excludesPortraits).toBe(false);
      }
    });

    it('should have getPortraitPath method that returns correct path structure', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );

      const path = provider.getPortraitPath('greek-mythology', 'sm');
      expect(path).toContain('portraits');
      expect(path).toContain('greek-mythology');
    });
  });

  // ========================================================================
  // AC3: Portrait image loads via asWebviewUri() for current agent/theme
  // ========================================================================
  describe('AC3: Portrait image loads via asWebviewUri()', () => {
    it('should have getPortraitUri method', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );

      expect(typeof provider.getPortraitUri).toBe('function');
    });

    it('should map agent role to character name correctly', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );

      // Test agent role to portrait mapping
      const mapping = provider.getAgentPortraitMapping();
      expect(mapping.sm).toBeDefined();
      expect(mapping.tea).toBeDefined();
      expect(mapping.dev).toBeDefined();
      expect(mapping.reviewer).toBeDefined();
    });

    it('should include img tag in HTML output', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toContain('<img');
    });

    it('should use asWebviewUri for portrait src', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      // Mock checkPortraitExists to return true so asWebviewUri gets called
      vi.spyOn(provider, 'checkPortraitExists').mockReturnValue(true);

      // Set initial persona
      provider.updatePersona({ character: 'Hermes Psychopompos', role: 'sm', theme: 'greek-mythology' });

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // asWebviewUri should have been called
      expect(webviewView.webview.asWebviewUri).toHaveBeenCalled();
    });

    it('should include vscode-webview scheme in portrait src', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      // Mock checkPortraitExists to return true so portrait URI appears in HTML
      vi.spyOn(provider, 'checkPortraitExists').mockReturnValue(true);

      // Set initial persona
      provider.updatePersona({ character: 'Hermes Psychopompos', role: 'sm', theme: 'greek-mythology' });

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // HTML should include webview URI for image
      expect(webviewView.webview.html).toMatch(/src="vscode-webview:/);
    });
  });

  // ========================================================================
  // AC4: Character name and role displayed below portrait
  // ========================================================================
  describe('AC4: Character name and role displayed', () => {
    it('should include character-name element in HTML', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toContain('character-name');
    });

    it('should include character-role element in HTML', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toContain('character-role');
    });

    it('should display character name from persona data', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      provider.updatePersona({ character: 'Themis the Just', role: 'tea', theme: 'greek-mythology' });
      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Should display character name in HTML or post message to update
      expect(
        webviewView.webview.html.includes('Themis') ||
        webviewView.webview.postMessage.mock.calls.some(
          (call) => call[0]?.persona?.character === 'Themis the Just'
        )
      ).toBe(true);
    });

    it('should display role from persona data', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      provider.updatePersona({ character: 'Hephaestus the Smith', role: 'dev', theme: 'greek-mythology' });
      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Should display role
      expect(
        webviewView.webview.html.toLowerCase().includes('dev') ||
        webviewView.webview.postMessage.mock.calls.some(
          (call) => call[0]?.persona?.role === 'dev'
        )
      ).toBe(true);
    });
  });

  // ========================================================================
  // AC5: Panel updates when agent changes via file watchers
  // ========================================================================
  describe('AC5: Panel updates via file watchers', () => {
    it('should have startFileWatchers method', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );

      expect(typeof provider.startFileWatchers).toBe('function');
    });

    it('should have stopFileWatchers method', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );

      expect(typeof provider.stopFileWatchers).toBe('function');
    });

    it('should have updatePersona method', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );

      expect(typeof provider.updatePersona).toBe('function');
    });

    it('should forward persona updates to webview', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');

      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Simulate persona update (as would happen from file watcher)
      provider.updatePersona({
        character: 'Argus Panoptes',
        role: 'reviewer',
        theme: 'greek-mythology',
      });

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: expect.stringMatching(/persona|update/),
        })
      );
    });

    it('should update portrait when persona changes', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Initial persona
      provider.updatePersona({ character: 'Hermes', role: 'sm', theme: 'greek-mythology' });

      // Change persona
      provider.updatePersona({ character: 'Themis', role: 'tea', theme: 'greek-mythology' });

      // Should have posted message with updated persona
      const updateCalls = webviewView.webview.postMessage.mock.calls.filter(
        (call) => call[0]?.type?.match(/persona|update/)
      );
      expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should cleanup file watchers on dispose', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');

      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Dispose provider
      provider.dispose();

      // Should not throw after dispose
      expect(() => {
        provider.updatePersona({ character: 'Test', role: 'dev', theme: 'test' });
      }).not.toThrow();
    });
  });

  // ========================================================================
  // AC6: Fallback display when no portrait exists (show agent name/icon)
  // ========================================================================
  describe('AC6: Fallback display when no portrait exists', () => {
    it('should have checkPortraitExists method', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );

      expect(typeof provider.checkPortraitExists).toBe('function');
    });

    it('should include fallback element in HTML', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toMatch(/fallback|placeholder|no-portrait/i);
    });

    it('should show fallback when portrait file does not exist', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      // Update with a theme that doesn't have portraits
      provider.updatePersona({ character: 'Unknown', role: 'sm', theme: 'nonexistent-theme' });

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Should show fallback
      expect(
        webviewView.webview.html.match(/fallback|placeholder|display:\s*block/i) ||
        webviewView.webview.postMessage.mock.calls.some(
          (call) => call[0]?.showFallback === true
        )
      ).toBeTruthy();
    });

    it('should display agent name in fallback', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Fallback should contain agent name placeholder or element
      expect(webviewView.webview.html).toMatch(/agent-name|fallback-name/i);
    });

    it('should display codicon icon in fallback', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Should use VS Code codicon for fallback icon
      expect(webviewView.webview.html).toMatch(/codicon|icon/i);
    });
  });

  // ========================================================================
  // AC7: Works with VS Code light and dark themes
  // ========================================================================
  describe('AC7: Works with VS Code light and dark themes', () => {
    it('should detect dark theme from VS Code', async () => {
      mockVscode.window.activeColorTheme.kind = ColorThemeKind.Dark;

      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );

      const theme = provider.detectVSCodeTheme();
      expect(theme).toBe('dark');
    });

    it('should detect light theme from VS Code', async () => {
      mockVscode.window.activeColorTheme.kind = ColorThemeKind.Light;

      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );

      const theme = provider.detectVSCodeTheme();
      expect(theme).toBe('light');
    });

    it('should set initial theme class on body', async () => {
      mockVscode.window.activeColorTheme.kind = ColorThemeKind.Dark;

      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toMatch(/class="[^"]*vscode-dark[^"]*"/);
    });

    it('should subscribe to onDidChangeActiveColorTheme', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
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

      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
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

    it('should use VS Code CSS variables for theming', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Should reference VS Code CSS variables
      expect(webviewView.webview.html).toMatch(/var\(--vscode-/);
    });

    it('should include Content-Security-Policy meta tag', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toContain('Content-Security-Policy');
    });

    it('should generate unique nonce for CSP', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );

      const nonce1 = provider.generateNonce();
      const nonce2 = provider.generateNonce();

      expect(nonce1).not.toBe(nonce2);
      expect(nonce1.length).toBeGreaterThanOrEqual(32);
    });
  });

  // ========================================================================
  // AC8: Cyclist pane completely removed from sidebar
  // ========================================================================
  describe('AC8: Cyclist pane removed from sidebar', () => {
    it('should NOT have cyclistPanel view in package.json', async () => {
      const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const packagePath = join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

      const views = packageJson.contributes?.views?.pennyfarthing || [];
      const cyclistView = views.find((v: any) => v.id === 'pennyfarthing.cyclistPanel');

      expect(cyclistView).toBeUndefined();
    });

    it('should NOT have cyclist-webview.ts file', async () => {
      const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const cyclistPath = join(__dirname, '..', 'src', 'providers', 'cyclist-webview.ts');

      expect(existsSync(cyclistPath)).toBe(false);
    });

    it('should NOT have cyclist-adapter.js file', async () => {
      const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const adapterPath = join(__dirname, '..', 'src', 'webview', 'cyclist-adapter.js');

      expect(existsSync(adapterPath)).toBe(false);
    });

    it('should NOT have cyclist-panel.html file', async () => {
      const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const htmlPath = join(__dirname, '..', 'src', 'webview', 'cyclist-panel.html');

      expect(existsSync(htmlPath)).toBe(false);
    });

    it('should NOT register CyclistWebviewProvider in extension.ts', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      // Should NOT register cyclist panel
      const cyclistCalls = mockVscode.window.registerWebviewViewProvider.mock.calls.filter(
        (call) => call[0] === 'pennyfarthing.cyclistPanel'
      );
      expect(cyclistCalls.length).toBe(0);
    });

    it('should NOT import CyclistWebviewProvider in extension.ts', async () => {
      const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const extensionPath = join(__dirname, '..', 'src', 'extension.ts');
      const content = readFileSync(extensionPath, 'utf-8');

      expect(content).not.toContain('CyclistWebviewProvider');
    });
  });

  // ========================================================================
  // Provider disposal tests
  // ========================================================================
  describe('Provider disposal', () => {
    it('should have dispose method', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );

      expect(typeof provider.dispose).toBe('function');
    });

    it('should cleanup resources on dispose', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Should not throw on dispose
      expect(() => provider.dispose()).not.toThrow();
    });
  });

  // ========================================================================
  // Message handling tests
  // ========================================================================
  describe('Message handling', () => {
    it('should handle messages from webview', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Verify message handler was registered
      expect(webviewView.webview.onDidReceiveMessage).toHaveBeenCalled();
    });

    it('should request initial state when webview sends requestInitialState', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      provider.updatePersona({ character: 'Test', role: 'sm', theme: 'test' });
      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Simulate webview requesting initial state
      webviewView.webview.simulateMessage({ type: 'requestInitialState' });

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'initialState',
        })
      );
    });
  });
});
