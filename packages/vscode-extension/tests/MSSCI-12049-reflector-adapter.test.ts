/**
 * MSSCI-12049: Reflector Protocol Adapter
 *
 * Tests for parsing CYCLIST markers from Claude output and mapping to VS Code UI.
 * Tests are written to FAIL until Dev implements the adapter.
 *
 * Acceptance Criteria:
 * - AC1: Reflector adapter parses CYCLIST markers from text
 * - AC2: HANDOFF markers show VS Code notification with agent button
 * - AC3: CONTEXT_CLEAR triggers context clear command
 * - AC4: QUESTION/CHOICES show VS Code quick pick
 * - AC5: Markers stripped from visible terminal output
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

// Track VS Code API calls for assertions
const mockShowInformationMessage = vi.fn();
const mockShowQuickPick = vi.fn();
const mockExecuteCommand = vi.fn();

const mockVscode = {
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      dispose: vi.fn(),
      show: vi.fn(),
    })),
    showInformationMessage: mockShowInformationMessage,
    showQuickPick: mockShowQuickPick,
    registerTerminalProfileProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTerminalLinkProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
    createTerminal: vi.fn(),
  },
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    executeCommand: mockExecuteCommand,
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
  },
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path, scheme: 'file' })),
  },
  chat: {
    createChatParticipant: vi.fn(() => ({ dispose: vi.fn() })),
  },
};

vi.mock('vscode', () => mockVscode);

const EXTENSION_ROOT = join(__dirname, '..');

describe('MSSCI-12049: Reflector Protocol Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // AC1: Reflector adapter parses CYCLIST markers from text
  // ==========================================================================
  describe('AC1: Reflector adapter parses CYCLIST markers from text', () => {
    describe('Module exports', () => {
      it('should have adapters/reflector.ts file', async () => {
        const { existsSync } = await import('fs');
        const reflectorPath = join(EXTENSION_ROOT, 'src', 'adapters', 'reflector.ts');
        expect(existsSync(reflectorPath)).toBe(true);
      });

      it('should export detectMarkers function', async () => {
        const reflector = await import('../src/adapters/reflector');
        expect(reflector.detectMarkers).toBeDefined();
        expect(typeof reflector.detectMarkers).toBe('function');
      });

      it('should export stripMarkers function', async () => {
        const reflector = await import('../src/adapters/reflector');
        expect(reflector.stripMarkers).toBeDefined();
        expect(typeof reflector.stripMarkers).toBe('function');
      });

      it('should export ReflectorAdapter class', async () => {
        const reflector = await import('../src/adapters/reflector');
        expect(reflector.ReflectorAdapter).toBeDefined();
      });
    });

    describe('HANDOFF marker detection', () => {
      it('should detect HANDOFF marker with agent name', async () => {
        const { detectMarkers } = await import('../src/adapters/reflector');

        const text = 'Ready for the next phase.\n<!-- CYCLIST:HANDOFF:/tea -->';
        const result = detectMarkers(text);

        expect(result).not.toBeNull();
        expect(result).toHaveLength(1);
        expect(result![0].type).toBe('handoff');
        expect(result![0].value).toBe('/tea');
      });

      it('should detect HANDOFF marker for /dev', async () => {
        const { detectMarkers } = await import('../src/adapters/reflector');

        const text = 'Tests are RED. Ready for implementation.\n<!-- CYCLIST:HANDOFF:/dev -->';
        const result = detectMarkers(text);

        expect(result).not.toBeNull();
        expect(result![0].type).toBe('handoff');
        expect(result![0].value).toBe('/dev');
      });

      it('should detect HANDOFF marker for /reviewer', async () => {
        const { detectMarkers } = await import('../src/adapters/reflector');

        const text = 'Implementation complete.\n<!-- CYCLIST:HANDOFF:/reviewer -->';
        const result = detectMarkers(text);

        expect(result).not.toBeNull();
        expect(result![0].type).toBe('handoff');
        expect(result![0].value).toBe('/reviewer');
      });

      it('should detect HANDOFF marker for /sm', async () => {
        const { detectMarkers } = await import('../src/adapters/reflector');

        const text = 'PR approved.\n<!-- CYCLIST:HANDOFF:/sm -->';
        const result = detectMarkers(text);

        expect(result).not.toBeNull();
        expect(result![0].type).toBe('handoff');
        expect(result![0].value).toBe('/sm');
      });
    });

    describe('CONTEXT_CLEAR marker detection', () => {
      it('should detect CONTEXT_CLEAR marker', async () => {
        const { detectMarkers } = await import('../src/adapters/reflector');

        const text = 'Context is high. Clearing session.\n<!-- CYCLIST:CONTEXT_CLEAR:/dev -->';
        const result = detectMarkers(text);

        expect(result).not.toBeNull();
        expect(result![0].type).toBe('context_clear');
        expect(result![0].value).toBe('/dev');
      });
    });

    describe('QUESTION marker detection', () => {
      it('should detect QUESTION marker with yesno type', async () => {
        const { detectMarkers } = await import('../src/adapters/reflector');

        const text = 'Shall I proceed?\n<!-- CYCLIST:QUESTION:yesno -->';
        const result = detectMarkers(text);

        expect(result).not.toBeNull();
        expect(result![0].type).toBe('question');
        expect(result![0].value).toBe('yesno');
      });
    });

    describe('CHOICES marker detection', () => {
      it('should detect CHOICES marker with numeric options', async () => {
        const { detectMarkers } = await import('../src/adapters/reflector');

        const text = 'Which option?\n1. First\n2. Second\n<!-- CYCLIST:CHOICES:1,2 -->';
        const result = detectMarkers(text);

        expect(result).not.toBeNull();
        expect(result![0].type).toBe('choices');
        expect(result![0].value).toBe('1,2');
      });

      it('should detect CHOICES marker with text labels', async () => {
        const { detectMarkers } = await import('../src/adapters/reflector');

        const text = 'Pick one:\n<!-- CYCLIST:CHOICES:Option A,Option B,Option C -->';
        const result = detectMarkers(text);

        expect(result).not.toBeNull();
        expect(result![0].type).toBe('choices');
        expect(result![0].value).toBe('Option A,Option B,Option C');
      });
    });

    describe('Edge cases', () => {
      it('should return null when no markers present', async () => {
        const { detectMarkers } = await import('../src/adapters/reflector');

        const text = 'This is a regular message without any markers.';
        const result = detectMarkers(text);

        expect(result).toBeNull();
      });

      it('should return null for empty string', async () => {
        const { detectMarkers } = await import('../src/adapters/reflector');

        const result = detectMarkers('');
        expect(result).toBeNull();
      });

      it('should return null for null/undefined input', async () => {
        const { detectMarkers } = await import('../src/adapters/reflector');

        expect(detectMarkers(null as any)).toBeNull();
        expect(detectMarkers(undefined as any)).toBeNull();
      });

      it('should handle whitespace inside marker', async () => {
        const { detectMarkers } = await import('../src/adapters/reflector');

        const text = '<!--  CYCLIST:HANDOFF:/tea  -->';
        const result = detectMarkers(text);

        expect(result).not.toBeNull();
        expect(result![0].value).toBe('/tea');
      });

      it('should be case-insensitive for marker type', async () => {
        const { detectMarkers } = await import('../src/adapters/reflector');

        const text = '<!-- cyclist:handoff:/tea -->';
        const result = detectMarkers(text);

        expect(result).not.toBeNull();
        expect(result![0].type).toBe('handoff');
      });

      it('should NOT detect markers inside code blocks', async () => {
        const { detectMarkers } = await import('../src/adapters/reflector');

        const text = `Here's an example:
\`\`\`html
<!-- CYCLIST:HANDOFF:/tea -->
\`\`\`
That was just an example.`;

        const result = detectMarkers(text);
        expect(result).toBeNull();
      });

      it('should detect multiple markers in order', async () => {
        const { detectMarkers } = await import('../src/adapters/reflector');

        const text = `First marker
<!-- CYCLIST:QUESTION:yesno -->
Second marker
<!-- CYCLIST:CHOICES:1,2 -->`;

        const result = detectMarkers(text);

        expect(result).not.toBeNull();
        expect(result).toHaveLength(2);
        expect(result![0].type).toBe('question');
        expect(result![1].type).toBe('choices');
      });
    });
  });

  // ==========================================================================
  // AC2: HANDOFF markers show VS Code notification with agent button
  // ==========================================================================
  describe('AC2: HANDOFF markers show VS Code notification with agent button', () => {
    it('should show information message for HANDOFF marker', async () => {
      const { ReflectorAdapter } = await import('../src/adapters/reflector');

      const adapter = new ReflectorAdapter();
      const text = 'Ready for review.\n<!-- CYCLIST:HANDOFF:/reviewer -->';

      await adapter.processText(text);

      expect(mockShowInformationMessage).toHaveBeenCalled();
    });

    it('should include agent command in notification message', async () => {
      const { ReflectorAdapter } = await import('../src/adapters/reflector');

      const adapter = new ReflectorAdapter();
      const text = 'Tests are RED.\n<!-- CYCLIST:HANDOFF:/dev -->';

      await adapter.processText(text);

      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('/dev'),
        expect.anything()
      );
    });

    it('should provide action button to invoke agent', async () => {
      const { ReflectorAdapter } = await import('../src/adapters/reflector');
      mockShowInformationMessage.mockResolvedValueOnce('Continue with /tea');

      const adapter = new ReflectorAdapter();
      const text = '<!-- CYCLIST:HANDOFF:/tea -->';

      await adapter.processText(text);

      // Should have action button
      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringMatching(/Continue|/i)
      );
    });

    it('should execute agent command when action button clicked', async () => {
      const { ReflectorAdapter } = await import('../src/adapters/reflector');
      mockShowInformationMessage.mockResolvedValueOnce('Continue with /dev');

      const adapter = new ReflectorAdapter();
      const text = '<!-- CYCLIST:HANDOFF:/dev -->';

      await adapter.processText(text);

      // When user clicks the action, it should execute the switch command
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'pennyfarthing.switchAgent',
        '/dev'
      );
    });
  });

  // ==========================================================================
  // AC3: CONTEXT_CLEAR triggers context clear command
  // ==========================================================================
  describe('AC3: CONTEXT_CLEAR triggers context clear command', () => {
    it('should execute context clear command for CONTEXT_CLEAR marker', async () => {
      const { ReflectorAdapter } = await import('../src/adapters/reflector');

      const adapter = new ReflectorAdapter();
      const text = 'Context is high.\n<!-- CYCLIST:CONTEXT_CLEAR:/dev -->';

      await adapter.processText(text);

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'pennyfarthing.contextClear',
        '/dev'
      );
    });

    it('should pass agent name to context clear command', async () => {
      const { ReflectorAdapter } = await import('../src/adapters/reflector');

      const adapter = new ReflectorAdapter();
      const text = '<!-- CYCLIST:CONTEXT_CLEAR:/tea -->';

      await adapter.processText(text);

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'pennyfarthing.contextClear',
        '/tea'
      );
    });
  });

  // ==========================================================================
  // AC4: QUESTION/CHOICES show VS Code quick pick
  // ==========================================================================
  describe('AC4: QUESTION/CHOICES show VS Code quick pick', () => {
    describe('QUESTION:yesno', () => {
      it('should show quick pick for yesno question', async () => {
        const { ReflectorAdapter } = await import('../src/adapters/reflector');

        const adapter = new ReflectorAdapter();
        const text = 'Shall I proceed?\n<!-- CYCLIST:QUESTION:yesno -->';

        await adapter.processText(text);

        expect(mockShowQuickPick).toHaveBeenCalled();
      });

      it('should provide Yes and No options', async () => {
        const { ReflectorAdapter } = await import('../src/adapters/reflector');

        const adapter = new ReflectorAdapter();
        const text = '<!-- CYCLIST:QUESTION:yesno -->';

        await adapter.processText(text);

        expect(mockShowQuickPick).toHaveBeenCalledWith(
          expect.arrayContaining(['Yes', 'No']),
          expect.any(Object)
        );
      });
    });

    describe('CHOICES', () => {
      it('should show quick pick for CHOICES marker', async () => {
        const { ReflectorAdapter } = await import('../src/adapters/reflector');

        const adapter = new ReflectorAdapter();
        const text = 'Pick one:\n<!-- CYCLIST:CHOICES:1,2,3 -->';

        await adapter.processText(text);

        expect(mockShowQuickPick).toHaveBeenCalled();
      });

      it('should provide choice options from marker value', async () => {
        const { ReflectorAdapter } = await import('../src/adapters/reflector');

        const adapter = new ReflectorAdapter();
        const text = '<!-- CYCLIST:CHOICES:Option A,Option B -->';

        await adapter.processText(text);

        expect(mockShowQuickPick).toHaveBeenCalledWith(
          expect.arrayContaining(['Option A', 'Option B']),
          expect.any(Object)
        );
      });

      it('should handle numeric choices by extracting text from context', async () => {
        const { ReflectorAdapter } = await import('../src/adapters/reflector');

        const adapter = new ReflectorAdapter();
        const text = `Which do you prefer?
1. First option
2. Second option
<!-- CYCLIST:CHOICES:1,2 -->`;

        await adapter.processText(text);

        // Should extract "First option" and "Second option" from numbered list
        expect(mockShowQuickPick).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.stringContaining('First'),
            expect.stringContaining('Second'),
          ]),
          expect.any(Object)
        );
      });
    });
  });

  // ==========================================================================
  // AC5: Markers stripped from visible terminal output
  // ==========================================================================
  describe('AC5: Markers stripped from visible terminal output', () => {
    it('should remove HANDOFF markers from text', async () => {
      const { stripMarkers } = await import('../src/adapters/reflector');

      const text = 'Ready for review.\n<!-- CYCLIST:HANDOFF:/reviewer -->';
      const result = stripMarkers(text);

      expect(result).not.toContain('CYCLIST');
      expect(result).not.toContain('HANDOFF');
      expect(result).toContain('Ready for review');
    });

    it('should remove CONTEXT_CLEAR markers from text', async () => {
      const { stripMarkers } = await import('../src/adapters/reflector');

      const text = 'Context high.\n<!-- CYCLIST:CONTEXT_CLEAR:/dev -->';
      const result = stripMarkers(text);

      expect(result).not.toContain('CYCLIST');
      expect(result).not.toContain('CONTEXT_CLEAR');
    });

    it('should remove QUESTION markers from text', async () => {
      const { stripMarkers } = await import('../src/adapters/reflector');

      const text = 'Proceed?\n<!-- CYCLIST:QUESTION:yesno -->';
      const result = stripMarkers(text);

      expect(result).not.toContain('CYCLIST');
      expect(result).not.toContain('QUESTION');
    });

    it('should remove CHOICES markers from text', async () => {
      const { stripMarkers } = await import('../src/adapters/reflector');

      const text = 'Options:\n<!-- CYCLIST:CHOICES:1,2,3 -->';
      const result = stripMarkers(text);

      expect(result).not.toContain('CYCLIST');
      expect(result).not.toContain('CHOICES');
    });

    it('should preserve all other text content', async () => {
      const { stripMarkers } = await import('../src/adapters/reflector');

      const text = `## Implementation Complete

All tests are passing. The changes include:
- Feature A
- Feature B

Ready for review.
<!-- CYCLIST:HANDOFF:/reviewer -->`;

      const result = stripMarkers(text);

      expect(result).toContain('## Implementation Complete');
      expect(result).toContain('All tests are passing');
      expect(result).toContain('Feature A');
      expect(result).toContain('Feature B');
      expect(result).toContain('Ready for review');
      expect(result).not.toContain('CYCLIST');
    });

    it('should handle multiple markers in same text', async () => {
      const { stripMarkers } = await import('../src/adapters/reflector');

      const text = `Question here
<!-- CYCLIST:QUESTION:choice -->
<!-- CYCLIST:CHOICES:1,2 -->`;

      const result = stripMarkers(text);

      expect(result).not.toContain('CYCLIST');
      expect(result).toContain('Question here');
    });

    it('should return original text when no markers present', async () => {
      const { stripMarkers } = await import('../src/adapters/reflector');

      const text = 'This is regular text without markers.';
      const result = stripMarkers(text);

      expect(result).toBe(text);
    });

    it('should handle empty string', async () => {
      const { stripMarkers } = await import('../src/adapters/reflector');

      const result = stripMarkers('');
      expect(result).toBe('');
    });
  });

  // ==========================================================================
  // Integration: ReflectorAdapter processes text end-to-end
  // ==========================================================================
  describe('Integration: ReflectorAdapter end-to-end', () => {
    it('should not trigger any UI for text without markers', async () => {
      const { ReflectorAdapter } = await import('../src/adapters/reflector');

      const adapter = new ReflectorAdapter();
      const text = 'Just a regular message.';

      await adapter.processText(text);

      expect(mockShowInformationMessage).not.toHaveBeenCalled();
      expect(mockShowQuickPick).not.toHaveBeenCalled();
      expect(mockExecuteCommand).not.toHaveBeenCalled();
    });

    it('should process HANDOFF marker and show notification', async () => {
      const { ReflectorAdapter } = await import('../src/adapters/reflector');

      const adapter = new ReflectorAdapter();
      const text = 'Done.\n<!-- CYCLIST:HANDOFF:/dev -->';

      await adapter.processText(text);

      expect(mockShowInformationMessage).toHaveBeenCalled();
    });

    it('should process CONTEXT_CLEAR marker and execute command', async () => {
      const { ReflectorAdapter } = await import('../src/adapters/reflector');

      const adapter = new ReflectorAdapter();
      const text = '<!-- CYCLIST:CONTEXT_CLEAR:/tea -->';

      await adapter.processText(text);

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'pennyfarthing.contextClear',
        '/tea'
      );
    });

    it('should process QUESTION marker and show quick pick', async () => {
      const { ReflectorAdapter } = await import('../src/adapters/reflector');

      const adapter = new ReflectorAdapter();
      const text = '<!-- CYCLIST:QUESTION:yesno -->';

      await adapter.processText(text);

      expect(mockShowQuickPick).toHaveBeenCalled();
    });
  });
});
