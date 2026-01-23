/**
 * MSSCI-12191: Persona Card Webview - Enhanced UI
 *
 * BDD-style tests for enhanced persona card display in VS Code.
 * Tests are written to FAIL until Dev implements the UI enhancements.
 *
 * Acceptance Criteria:
 * - AC1: Sidebar webview displays agent portrait image (180px)
 * - AC2: Character name prominently displayed below portrait
 * - AC3: Theme name/badge visible below character name
 * - AC4: Card populates within 2 seconds of extension activation
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

describe('MSSCI-12191: Persona Card Webview - Enhanced UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.subscriptions = [];
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ========================================================================
  // AC1: Sidebar webview displays agent portrait image (180px)
  // ========================================================================
  describe('AC1: Portrait image displays at 180px', () => {
    it('should have portrait-container with 180px size in CSS', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // CSS should define --portrait-size: 180px
      expect(webviewView.webview.html).toMatch(/--portrait-size:\s*180px/);
    });

    it('should have portrait-container using portrait-size variable for width', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // portrait-container should use var(--portrait-size) for width
      expect(webviewView.webview.html).toMatch(/\.portrait-container\s*\{[^}]*width:\s*var\(--portrait-size\)/s);
    });

    it('should have portrait-container using portrait-size variable for height', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // portrait-container should use var(--portrait-size) for height
      expect(webviewView.webview.html).toMatch(/\.portrait-container\s*\{[^}]*height:\s*var\(--portrait-size\)/s);
    });

    it('should have img element with portrait-image class', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      expect(webviewView.webview.html).toMatch(/<img[^>]*class="[^"]*portrait-image[^"]*"/);
    });
  });

  // ========================================================================
  // AC2: Character name prominently displayed below portrait
  // ========================================================================
  describe('AC2: Character name prominently displayed', () => {
    it('should have character name in h2 element for prominence', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      provider.updatePersona({ character: 'Igor', role: 'tea', theme: 'discworld' });
      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Character name should be in h2 for semantic prominence
      expect(webviewView.webview.html).toMatch(/<h2[^>]*class="[^"]*character-name[^"]*"[^>]*>/);
    });

    it('should have character-name with font-size at least 18px', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Character name should have prominent font size (18px or larger)
      // Current implementation uses 14px - needs to be larger for "prominent"
      const fontSizeMatch = webviewView.webview.html.match(/\.character-name\s*\{[^}]*font-size:\s*(\d+)px/s);
      expect(fontSizeMatch).toBeTruthy();
      const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1], 10) : 0;
      expect(fontSize).toBeGreaterThanOrEqual(18);
    });

    it('should have character-name with font-weight bold or 700', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Character name should be bold
      expect(webviewView.webview.html).toMatch(/\.character-name\s*\{[^}]*font-weight:\s*(bold|700)/s);
    });

    it('should display actual character name in HTML when persona is set', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      provider.updatePersona({ character: 'Ponder Stibbons', role: 'dev', theme: 'discworld' });
      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Character name should appear in HTML
      expect(webviewView.webview.html).toContain('Ponder Stibbons');
    });
  });

  // ========================================================================
  // AC3: Theme name/badge visible below character name
  // ========================================================================
  describe('AC3: Theme name/badge visible', () => {
    it('should have theme-badge element in HTML', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Should have a theme-badge element
      expect(webviewView.webview.html).toMatch(/class="[^"]*theme-badge[^"]*"/);
    });

    it('should display theme name in theme-badge', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      provider.updatePersona({ character: 'Captain Carrot', role: 'sm', theme: 'discworld' });
      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Theme name should appear (either directly or via JS update)
      expect(
        webviewView.webview.html.toLowerCase().includes('discworld') ||
        webviewView.webview.html.includes('id="theme-badge"') ||
        webviewView.webview.html.includes('class="theme-badge"')
      ).toBe(true);
    });

    it('should have theme-badge styled as a pill/badge', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Badge should have pill styling (border-radius, background, padding)
      expect(webviewView.webview.html).toMatch(/\.theme-badge\s*\{[^}]*border-radius:/s);
      expect(webviewView.webview.html).toMatch(/\.theme-badge\s*\{[^}]*background/s);
      expect(webviewView.webview.html).toMatch(/\.theme-badge\s*\{[^}]*padding:/s);
    });

    it('should have theme-badge positioned below character name', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // In HTML structure, theme-badge should come after character-name
      const html = webviewView.webview.html;
      const nameIndex = html.indexOf('character-name');
      const badgeIndex = html.indexOf('theme-badge');

      expect(nameIndex).toBeGreaterThan(-1);
      expect(badgeIndex).toBeGreaterThan(-1);
      expect(badgeIndex).toBeGreaterThan(nameIndex);
    });

    it('should update theme-badge when persona changes', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Update persona with new theme
      provider.updatePersona({ character: 'Hermes', role: 'sm', theme: 'greek-mythology' });

      // Should post message with theme info
      expect(webviewView.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          persona: expect.objectContaining({
            theme: 'greek-mythology',
          }),
        })
      );
    });

    it('should format theme name for display (capitalize, replace hyphens)', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      provider.updatePersona({ character: 'Hermes', role: 'sm', theme: 'greek-mythology' });
      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Theme should be formatted nicely (Greek Mythology instead of greek-mythology)
      // This can be in HTML or handled by JS
      expect(
        webviewView.webview.html.includes('Greek Mythology') ||
        webviewView.webview.html.match(/formatThemeName|themeDisplay/i)
      ).toBeTruthy();
    });
  });

  // ========================================================================
  // AC4: Card populates within 2 seconds of extension activation
  // ========================================================================
  describe('AC4: Card populates within 2 seconds', () => {
    it('should set HTML content synchronously in resolveWebviewView', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      // resolveWebviewView should complete quickly
      const startTime = Date.now();
      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);
      const elapsed = Date.now() - startTime;

      // Should complete in well under 2 seconds (< 100ms typically)
      expect(elapsed).toBeLessThan(2000);
      expect(webviewView.webview.html).toBeTruthy();
      expect(webviewView.webview.html.length).toBeGreaterThan(100);
    });

    it('should have initial content visible without waiting for file watchers', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // HTML should have visible structure even without persona data
      expect(webviewView.webview.html).toContain('portrait-container');
      expect(webviewView.webview.html).toContain('character-name');
      expect(webviewView.webview.html).toContain('theme-badge');
    });

    it('should display placeholder content when no persona is set', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      // Don't set persona before resolving
      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Should show placeholder text
      expect(webviewView.webview.html).toMatch(/No Agent|Loading|Awaiting/i);
    });

    it('should update display quickly when persona becomes available', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      // Simulate persona becoming available
      const updateStart = Date.now();
      provider.updatePersona({ character: 'Granny Weatherwax', role: 'reviewer', theme: 'discworld' });
      const updateElapsed = Date.now() - updateStart;

      // Update should be near-instant
      expect(updateElapsed).toBeLessThan(100);
      expect(webviewView.webview.postMessage).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Integration: All elements work together
  // ========================================================================
  describe('Integration: Complete persona card display', () => {
    it('should display complete persona card with all required elements', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      vi.spyOn(provider, 'checkPortraitExists').mockReturnValue(true);
      provider.updatePersona({ character: 'Death', role: 'orchestrator', theme: 'discworld' });
      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      const html = webviewView.webview.html;

      // All required elements present
      expect(html).toContain('portrait-container');
      expect(html).toContain('portrait-image');
      expect(html).toContain('character-name');
      expect(html).toContain('theme-badge');

      // Content populated
      expect(html).toContain('Death');
    });

    it('should maintain layout order: portrait → name → role → theme badge', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const webviewView = new MockWebviewView();

      await provider.resolveWebviewView(webviewView as any, {} as any, {} as any);

      const html = webviewView.webview.html;
      const portraitIdx = html.indexOf('portrait-container');
      const nameIdx = html.indexOf('character-name');
      const roleIdx = html.indexOf('character-role');
      const badgeIdx = html.indexOf('theme-badge');

      // Verify ordering
      expect(portraitIdx).toBeLessThan(nameIdx);
      expect(nameIdx).toBeLessThan(roleIdx);
      expect(roleIdx).toBeLessThan(badgeIdx);
    });
  });
});
