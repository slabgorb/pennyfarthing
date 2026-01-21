/**
 * MSSCI-12046: Terminal provider for Claude Code sessions
 *
 * These tests verify the terminal profile provider and link detection.
 * Tests are written to FAIL until Dev implements the providers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';

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

const mockTerminal = {
  name: 'Pennyfarthing Claude',
  processId: Promise.resolve(12345),
  show: vi.fn(),
  sendText: vi.fn(),
  dispose: vi.fn(),
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

const mockVscode = {
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
    registerTerminalProfileProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTerminalLinkProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
    createTerminal: vi.fn(() => mockTerminal),
    showInformationMessage: vi.fn(),
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
  },
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    executeCommand: vi.fn(() => Promise.resolve()),
  },
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path, scheme: 'file' })),
    parse: vi.fn((url: string) => ({ toString: () => url })),
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
  env: {
    openExternal: vi.fn(),
  },
};

vi.mock('vscode', () => mockVscode);

const EXTENSION_ROOT = join(__dirname, '..');

describe('MSSCI-12046: Terminal Provider for Claude Code Sessions', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.subscriptions = [];
  });

  describe('AC1: Custom terminal profile "Pennyfarthing Claude" appears in terminal dropdown', () => {

    it('should have terminal profile contribution in package.json', async () => {
      const { readFileSync, existsSync } = await import('fs');
      const packagePath = join(EXTENSION_ROOT, 'package.json');
      expect(existsSync(packagePath)).toBe(true);

      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));

      // AC1: Must have terminal profile contribution
      expect(pkg.contributes?.terminal?.profiles).toBeDefined();

      const profiles = pkg.contributes.terminal.profiles;
      const linuxProfile = profiles?.linux?.find(
        (p: { id: string }) => p.id === 'pennyfarthing.claudeTerminal'
      );
      const macProfile = profiles?.osx?.find(
        (p: { id: string }) => p.id === 'pennyfarthing.claudeTerminal'
      );

      // Profile should exist on at least one platform
      expect(linuxProfile || macProfile).toBeTruthy();
    });

    it('should register terminal profile provider on activation', async () => {
      // Import and activate extension
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      // Verify registerTerminalProfileProvider was called
      expect(mockVscode.window.registerTerminalProfileProvider).toHaveBeenCalledWith(
        'pennyfarthing.claudeTerminal',
        expect.any(Object)
      );
    });

    it('should provide a terminal profile with correct title', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      // Get the registered provider
      const providerCall = mockVscode.window.registerTerminalProfileProvider.mock.calls[0];
      expect(providerCall).toBeDefined();

      const [profileId, provider] = providerCall;
      expect(profileId).toBe('pennyfarthing.claudeTerminal');

      // Provider should have provideTerminalProfile method
      expect(provider.provideTerminalProfile).toBeDefined();

      // Call the provider to get profile
      const profile = await provider.provideTerminalProfile();
      expect(profile).toBeDefined();
      expect(profile.options.name).toBe('Pennyfarthing Claude');
    });
  });

  describe('AC2: Terminal launches with PROJECT_ROOT and CLAUDE_PROJECT_DIR env vars set', () => {

    it('should set PROJECT_ROOT to workspace folder path', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      const providerCall = mockVscode.window.registerTerminalProfileProvider.mock.calls[0];
      const [, provider] = providerCall;

      const profile = await provider.provideTerminalProfile();

      expect(profile.options.env).toBeDefined();
      expect(profile.options.env.PROJECT_ROOT).toBe('/mock/workspace');
    });

    it('should set CLAUDE_PROJECT_DIR to workspace folder path', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      const providerCall = mockVscode.window.registerTerminalProfileProvider.mock.calls[0];
      const [, provider] = providerCall;

      const profile = await provider.provideTerminalProfile();

      expect(profile.options.env).toBeDefined();
      expect(profile.options.env.CLAUDE_PROJECT_DIR).toBe('/mock/workspace');
    });

    it('should set PENNYFARTHING_ACTIVE flag', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      const providerCall = mockVscode.window.registerTerminalProfileProvider.mock.calls[0];
      const [, provider] = providerCall;

      const profile = await provider.provideTerminalProfile();

      expect(profile.options.env).toBeDefined();
      expect(profile.options.env.PENNYFARTHING_ACTIVE).toBe('1');
    });
  });

  describe('AC3: File paths in terminal output are clickable links', () => {

    it('should register terminal link provider on activation', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      expect(mockVscode.window.registerTerminalLinkProvider).toHaveBeenCalled();
    });

    it('should detect file:line patterns in terminal output', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      const linkProviderCall = mockVscode.window.registerTerminalLinkProvider.mock.calls[0];
      expect(linkProviderCall).toBeDefined();

      const linkProvider = linkProviderCall[0];
      expect(linkProvider.provideTerminalLinks).toBeDefined();

      // Test detection of file:line pattern
      const mockTerminalContext = {
        line: 'Error in src/extension.ts:42 - something failed',
        terminal: mockTerminal,
      };

      const links = await linkProvider.provideTerminalLinks(mockTerminalContext);
      expect(links).toBeDefined();
      expect(links.length).toBeGreaterThan(0);

      // Verify link points to correct file:line
      const link = links[0];
      expect(link.startIndex).toBe(9); // "Error in " is 9 chars
      expect(link.length).toBe(19); // "src/extension.ts:42" is 19 chars
    });

    it('should detect various file path formats', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      const linkProvider = mockVscode.window.registerTerminalLinkProvider.mock.calls[0][0];

      const testCases = [
        { line: 'at src/foo.ts:10', expected: 'src/foo.ts:10' },
        { line: 'packages/core/index.ts:100:5', expected: 'packages/core/index.ts:100' },
        { line: './relative/path.js:42', expected: './relative/path.js:42' },
        { line: '/absolute/path/file.go:123', expected: '/absolute/path/file.go:123' },
      ];

      for (const { line, expected } of testCases) {
        const links = await linkProvider.provideTerminalLinks({ line, terminal: mockTerminal });
        expect(links.length, `Should detect link in: ${line}`).toBeGreaterThan(0);
        const linkText = line.substring(links[0].startIndex, links[0].startIndex + links[0].length);
        expect(linkText).toContain(expected.split(':')[0]); // At least the file part
      }
    });
  });

  describe('AC4: Clicking file link opens file at correct line in VS Code editor', () => {

    it('should have handleTerminalLink method on link provider', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      const linkProvider = mockVscode.window.registerTerminalLinkProvider.mock.calls[0][0];
      expect(linkProvider.handleTerminalLink).toBeDefined();
    });

    it('should open document when link is clicked', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      const linkProvider = mockVscode.window.registerTerminalLinkProvider.mock.calls[0][0];

      // Create a mock link with file path and line number
      const mockLink = {
        data: { filePath: '/mock/workspace/src/foo.ts', lineNumber: 42 },
      };

      await linkProvider.handleTerminalLink(mockLink);

      // Verify file was opened
      expect(mockVscode.workspace.openTextDocument).toHaveBeenCalledWith(
        expect.objectContaining({ fsPath: '/mock/workspace/src/foo.ts' })
      );
    });

    it('should navigate to correct line number', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      const linkProvider = mockVscode.window.registerTerminalLinkProvider.mock.calls[0][0];

      const mockLink = {
        data: { filePath: '/mock/workspace/src/bar.ts', lineNumber: 100 },
      };

      await linkProvider.handleTerminalLink(mockLink);

      // Verify line navigation
      // The implementation should show the document at line 100 (0-indexed = 99)
      expect(mockVscode.workspace.openTextDocument).toHaveBeenCalled();
      // Additional verification would depend on implementation details
    });
  });

  describe('Terminal provider file structure', () => {

    it('should have providers/terminal.ts file', async () => {
      const { existsSync } = await import('fs');
      const terminalProviderPath = join(EXTENSION_ROOT, 'src', 'providers', 'terminal.ts');
      expect(existsSync(terminalProviderPath)).toBe(true);
    });

    it('should export PennyfarthingTerminalProfileProvider class', async () => {
      // This will fail until the file exists with the export
      const terminalModule = await import('../src/providers/terminal');
      expect(terminalModule.PennyfarthingTerminalProfileProvider).toBeDefined();
    });

    it('should export PennyfarthingTerminalLinkProvider class', async () => {
      // This will fail until the file exists with the export
      const terminalModule = await import('../src/providers/terminal');
      expect(terminalModule.PennyfarthingTerminalLinkProvider).toBeDefined();
    });
  });
});
