/**
 * MSSCI-12049: Reflector Protocol Adapter (Pivoted)
 *
 * Tests for parsing CYCLIST HTML comments from Claude output in the
 * VS Code chat participant, integrating with ClaudeService text events.
 *
 * Pivot Note: Original implementation used WheelHub WebSocket approach.
 * This version integrates with ClaudeService in chat-participant.ts.
 *
 * Acceptance Criteria:
 * - AC1: detectMarkers() parses CYCLIST markers from text
 * - AC2: stripMarkers() removes markers before display
 * - AC3: HANDOFF shows VS Code notification with action button
 * - AC4: CONTEXT_CLEAR executes pennyfarthing.contextClear command
 * - AC5: QUESTION/yesno shows Yes/No quick pick
 * - AC6: CHOICES shows quick pick with parsed options
 * - AC7: Integrates with chat-participant onText handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// VS Code Mocks
// ============================================================================

const mockShowInformationMessage = vi.fn();
const mockShowQuickPick = vi.fn();
const mockExecuteCommand = vi.fn();

const mockVscode = {
  window: {
    showInformationMessage: mockShowInformationMessage,
    showQuickPick: mockShowQuickPick,
    showErrorMessage: vi.fn(),
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  commands: {
    executeCommand: mockExecuteCommand,
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
  },
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path, scheme: 'file' })),
  },
};

vi.mock('vscode', () => mockVscode);

// ============================================================================
// Types (expected from reflector.ts)
// ============================================================================

interface CyclistMarker {
  type: 'HANDOFF' | 'CONTEXT_CLEAR' | 'QUESTION' | 'CHOICES';
  value: string;
}

// ============================================================================
// Tests
// ============================================================================

describe('MSSCI-12049: Reflector Protocol Adapter (Pivoted)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ==========================================================================
  // AC1: detectMarkers() parses CYCLIST markers from text
  // ==========================================================================
  describe('AC1: detectMarkers() parses CYCLIST markers from text', () => {
    it('should have adapters/reflector.ts file', async () => {
      const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const reflectorPath = join(
        __dirname,
        '..',
        'src',
        'adapters',
        'reflector.ts'
      );
      expect(existsSync(reflectorPath)).toBe(true);
    });

    it('should export detectMarkers function', async () => {
      const reflector = await import('../src/adapters/reflector');
      expect(reflector.detectMarkers).toBeDefined();
      expect(typeof reflector.detectMarkers).toBe('function');
    });

    it('should detect HANDOFF marker', async () => {
      const { detectMarkers } = await import('../src/adapters/reflector');
      const text = 'Some text <!-- CYCLIST:HANDOFF:/dev --> more text';

      const markers = detectMarkers(text);

      expect(markers).toHaveLength(1);
      expect(markers[0]).toEqual({ type: 'HANDOFF', value: '/dev' });
    });

    it('should detect CONTEXT_CLEAR marker', async () => {
      const { detectMarkers } = await import('../src/adapters/reflector');
      const text = '<!-- CYCLIST:CONTEXT_CLEAR:/tea -->';

      const markers = detectMarkers(text);

      expect(markers).toHaveLength(1);
      expect(markers[0]).toEqual({ type: 'CONTEXT_CLEAR', value: '/tea' });
    });

    it('should detect QUESTION marker', async () => {
      const { detectMarkers } = await import('../src/adapters/reflector');
      const text = '<!-- CYCLIST:QUESTION:yesno -->';

      const markers = detectMarkers(text);

      expect(markers).toHaveLength(1);
      expect(markers[0]).toEqual({ type: 'QUESTION', value: 'yesno' });
    });

    it('should detect CHOICES marker', async () => {
      const { detectMarkers } = await import('../src/adapters/reflector');
      const text = '<!-- CYCLIST:CHOICES:option1,option2,option3 -->';

      const markers = detectMarkers(text);

      expect(markers).toHaveLength(1);
      expect(markers[0]).toEqual({
        type: 'CHOICES',
        value: 'option1,option2,option3',
      });
    });

    it('should detect multiple markers in text', async () => {
      const { detectMarkers } = await import('../src/adapters/reflector');
      const text = `
        Ready for handoff.
        <!-- CYCLIST:HANDOFF:/dev -->
        <!-- CYCLIST:QUESTION:yesno -->
      `;

      const markers = detectMarkers(text);

      expect(markers).toHaveLength(2);
      expect(markers[0].type).toBe('HANDOFF');
      expect(markers[1].type).toBe('QUESTION');
    });

    it('should return empty array when no markers found', async () => {
      const { detectMarkers } = await import('../src/adapters/reflector');
      const text = 'Just some normal text without any markers';

      const markers = detectMarkers(text);

      expect(markers).toEqual([]);
    });

    it('should handle empty input', async () => {
      const { detectMarkers } = await import('../src/adapters/reflector');

      expect(detectMarkers('')).toEqual([]);
      expect(detectMarkers(null as any)).toEqual([]);
      expect(detectMarkers(undefined as any)).toEqual([]);
    });

    it('should not match malformed markers', async () => {
      const { detectMarkers } = await import('../src/adapters/reflector');
      const text = `
        <!-- CYCLIST:INVALID -->
        <!-- CYCLIST:HANDOFF -->
        <!-- CYCLIST: HANDOFF:/dev -->
        <!- CYCLIST:HANDOFF:/dev -->
      `;

      const markers = detectMarkers(text);

      expect(markers).toEqual([]);
    });
  });

  // ==========================================================================
  // AC2: stripMarkers() removes markers before display
  // ==========================================================================
  describe('AC2: stripMarkers() removes markers before display', () => {
    it('should export stripMarkers function', async () => {
      const reflector = await import('../src/adapters/reflector');
      expect(reflector.stripMarkers).toBeDefined();
      expect(typeof reflector.stripMarkers).toBe('function');
    });

    it('should remove CYCLIST markers from text', async () => {
      const { stripMarkers } = await import('../src/adapters/reflector');
      const text = 'Hello <!-- CYCLIST:HANDOFF:/dev --> World';

      const result = stripMarkers(text);

      expect(result).toBe('Hello  World');
    });

    it('should remove multiple markers', async () => {
      const { stripMarkers } = await import('../src/adapters/reflector');
      const text = `Start <!-- CYCLIST:HANDOFF:/dev --> Middle <!-- CYCLIST:QUESTION:yesno --> End`;

      const result = stripMarkers(text);

      expect(result).toBe('Start  Middle  End');
    });

    it('should preserve non-marker HTML comments', async () => {
      const { stripMarkers } = await import('../src/adapters/reflector');
      const text = '<!-- This is a normal comment --> Keep this';

      const result = stripMarkers(text);

      expect(result).toBe('<!-- This is a normal comment --> Keep this');
    });

    it('should handle text with no markers', async () => {
      const { stripMarkers } = await import('../src/adapters/reflector');
      const text = 'No markers here';

      const result = stripMarkers(text);

      expect(result).toBe('No markers here');
    });

    it('should handle empty input', async () => {
      const { stripMarkers } = await import('../src/adapters/reflector');

      expect(stripMarkers('')).toBe('');
      expect(stripMarkers(null as any)).toBe('');
      expect(stripMarkers(undefined as any)).toBe('');
    });

    it('should trim trailing whitespace after stripping', async () => {
      const { stripMarkers } = await import('../src/adapters/reflector');
      const text = 'Content\n<!-- CYCLIST:HANDOFF:/dev -->\n';

      const result = stripMarkers(text);

      expect(result).toBe('Content\n\n');
    });
  });

  // ==========================================================================
  // AC3: HANDOFF shows VS Code notification with action button
  // ==========================================================================
  describe('AC3: HANDOFF shows VS Code notification with action button', () => {
    it('should export processMarker function', async () => {
      const reflector = await import('../src/adapters/reflector');
      expect(reflector.processMarker).toBeDefined();
      expect(typeof reflector.processMarker).toBe('function');
    });

    it('should show notification for HANDOFF marker', async () => {
      const { processMarker } = await import('../src/adapters/reflector');
      mockShowInformationMessage.mockResolvedValue(undefined);

      await processMarker({ type: 'HANDOFF', value: '/dev' });

      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('dev'),
        expect.any(String) // Action button text
      );
    });

    it('should include action button to switch agent', async () => {
      const { processMarker } = await import('../src/adapters/reflector');
      mockShowInformationMessage.mockResolvedValue('Switch');

      await processMarker({ type: 'HANDOFF', value: '/tea' });

      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        expect.anything(),
        'Switch to /tea'
      );
    });

    it('should execute switchAgent command when action clicked', async () => {
      const { processMarker } = await import('../src/adapters/reflector');
      mockShowInformationMessage.mockResolvedValue('Switch to /dev');

      await processMarker({ type: 'HANDOFF', value: '/dev' });

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'pennyfarthing.switchAgent',
        '/dev'
      );
    });

    it('should not execute command when notification dismissed', async () => {
      const { processMarker } = await import('../src/adapters/reflector');
      mockShowInformationMessage.mockResolvedValue(undefined);

      await processMarker({ type: 'HANDOFF', value: '/dev' });

      expect(mockExecuteCommand).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // AC4: CONTEXT_CLEAR executes pennyfarthing.contextClear command
  // ==========================================================================
  describe('AC4: CONTEXT_CLEAR executes pennyfarthing.contextClear command', () => {
    it('should execute contextClear command for CONTEXT_CLEAR marker', async () => {
      const { processMarker } = await import('../src/adapters/reflector');

      await processMarker({ type: 'CONTEXT_CLEAR', value: '/tea' });

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'pennyfarthing.contextClear',
        '/tea'
      );
    });

    it('should handle command execution errors gracefully', async () => {
      const { processMarker } = await import('../src/adapters/reflector');
      mockExecuteCommand.mockRejectedValue(new Error('Command failed'));

      // Should not throw
      await expect(
        processMarker({ type: 'CONTEXT_CLEAR', value: '/dev' })
      ).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // AC5: QUESTION/yesno shows Yes/No quick pick
  // ==========================================================================
  describe('AC5: QUESTION/yesno shows Yes/No quick pick', () => {
    it('should show Yes/No quick pick for QUESTION:yesno', async () => {
      const { processMarker } = await import('../src/adapters/reflector');
      mockShowQuickPick.mockResolvedValue('Yes');

      await processMarker({ type: 'QUESTION', value: 'yesno' });

      expect(mockShowQuickPick).toHaveBeenCalledWith(['Yes', 'No'], {
        placeHolder: expect.any(String),
      });
    });

    it('should return selected value', async () => {
      const { processMarker } = await import('../src/adapters/reflector');
      mockShowQuickPick.mockResolvedValue('Yes');

      const result = await processMarker({ type: 'QUESTION', value: 'yesno' });

      expect(result).toBe('Yes');
    });

    it('should handle user cancellation', async () => {
      const { processMarker } = await import('../src/adapters/reflector');
      mockShowQuickPick.mockResolvedValue(undefined);

      const result = await processMarker({ type: 'QUESTION', value: 'yesno' });

      expect(result).toBeUndefined();
    });
  });

  // ==========================================================================
  // AC6: CHOICES shows quick pick with parsed options
  // ==========================================================================
  describe('AC6: CHOICES shows quick pick with parsed options', () => {
    it('should parse comma-separated choices', async () => {
      const { processMarker } = await import('../src/adapters/reflector');
      mockShowQuickPick.mockResolvedValue('option2');

      await processMarker({ type: 'CHOICES', value: 'option1,option2,option3' });

      expect(mockShowQuickPick).toHaveBeenCalledWith(
        ['option1', 'option2', 'option3'],
        expect.any(Object)
      );
    });

    it('should handle single choice', async () => {
      const { processMarker } = await import('../src/adapters/reflector');
      mockShowQuickPick.mockResolvedValue('only-option');

      await processMarker({ type: 'CHOICES', value: 'only-option' });

      expect(mockShowQuickPick).toHaveBeenCalledWith(
        ['only-option'],
        expect.any(Object)
      );
    });

    it('should trim whitespace from choices', async () => {
      const { processMarker } = await import('../src/adapters/reflector');
      mockShowQuickPick.mockResolvedValue('b');

      await processMarker({ type: 'CHOICES', value: ' a , b , c ' });

      expect(mockShowQuickPick).toHaveBeenCalledWith(
        ['a', 'b', 'c'],
        expect.any(Object)
      );
    });

    it('should return selected choice', async () => {
      const { processMarker } = await import('../src/adapters/reflector');
      mockShowQuickPick.mockResolvedValue('selected');

      const result = await processMarker({
        type: 'CHOICES',
        value: 'a,selected,c',
      });

      expect(result).toBe('selected');
    });
  });

  // ==========================================================================
  // AC7: Integrates with chat-participant onText handler
  // ==========================================================================
  describe('AC7: Integrates with chat-participant onText handler', () => {
    it('should export ReflectorAdapter class', async () => {
      const reflector = await import('../src/adapters/reflector');
      expect(reflector.ReflectorAdapter).toBeDefined();
    });

    it('should have processText method for chat integration', async () => {
      const { ReflectorAdapter } = await import('../src/adapters/reflector');
      const adapter = new ReflectorAdapter();

      expect(adapter.processText).toBeDefined();
      expect(typeof adapter.processText).toBe('function');
    });

    it('should return stripped text from processText', async () => {
      const { ReflectorAdapter } = await import('../src/adapters/reflector');
      const adapter = new ReflectorAdapter();

      const result = await adapter.processText(
        'Hello <!-- CYCLIST:HANDOFF:/dev --> World'
      );

      expect(result.displayText).toBe('Hello  World');
    });

    it('should trigger marker processing from processText', async () => {
      const { ReflectorAdapter } = await import('../src/adapters/reflector');
      const adapter = new ReflectorAdapter();
      mockShowInformationMessage.mockResolvedValue(undefined);

      await adapter.processText('Text <!-- CYCLIST:HANDOFF:/dev -->');

      expect(mockShowInformationMessage).toHaveBeenCalled();
    });

    it('should process all markers in text', async () => {
      const { ReflectorAdapter } = await import('../src/adapters/reflector');
      const adapter = new ReflectorAdapter();
      mockShowInformationMessage.mockResolvedValue(undefined);
      mockShowQuickPick.mockResolvedValue('Yes');

      await adapter.processText(`
        <!-- CYCLIST:HANDOFF:/dev -->
        <!-- CYCLIST:QUESTION:yesno -->
      `);

      expect(mockShowInformationMessage).toHaveBeenCalled();
      expect(mockShowQuickPick).toHaveBeenCalled();
    });

    it('should return markers found in result', async () => {
      const { ReflectorAdapter } = await import('../src/adapters/reflector');
      const adapter = new ReflectorAdapter();

      const result = await adapter.processText(
        '<!-- CYCLIST:HANDOFF:/dev -->'
      );

      expect(result.markers).toHaveLength(1);
      expect(result.markers[0].type).toBe('HANDOFF');
    });

    it('chat-participant.ts should import ReflectorAdapter', async () => {
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

      expect(content).toContain('ReflectorAdapter');
      expect(content).toContain("from '../adapters/reflector'");
    });

    it('chat-participant.ts should use processText in onText handler', async () => {
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

      // Should call processText and use displayText
      expect(content).toContain('processText');
      expect(content).toContain('displayText');
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================
  describe('Edge cases', () => {
    it('should handle markers split across text chunks', async () => {
      const { ReflectorAdapter } = await import('../src/adapters/reflector');
      const adapter = new ReflectorAdapter();

      // First chunk ends mid-marker
      const chunk1 = 'Text <!-- CYCLIST:HA';
      const chunk2 = 'NDOFF:/dev --> more';

      // Adapter should buffer incomplete markers
      const result1 = await adapter.processText(chunk1);
      const result2 = await adapter.processText(chunk2);

      // The complete marker should be detected
      expect(result1.markers.length + result2.markers.length).toBe(1);
    });

    it('should handle unknown marker types gracefully', async () => {
      const { detectMarkers } = await import('../src/adapters/reflector');
      const text = '<!-- CYCLIST:UNKNOWN:value -->';

      // Should not throw, should return empty or ignore
      const markers = detectMarkers(text);
      expect(markers.every((m) => ['HANDOFF', 'CONTEXT_CLEAR', 'QUESTION', 'CHOICES'].includes(m.type))).toBe(true);
    });

    it('should handle rapid successive marker processing', async () => {
      const { ReflectorAdapter } = await import('../src/adapters/reflector');
      const adapter = new ReflectorAdapter();
      mockShowInformationMessage.mockResolvedValue(undefined);

      // Process many markers quickly
      const promises = Array(10)
        .fill(null)
        .map((_, i) =>
          adapter.processText(`<!-- CYCLIST:HANDOFF:/agent${i} -->`)
        );

      await Promise.all(promises);

      // Should have processed all without errors
      expect(mockShowInformationMessage).toHaveBeenCalledTimes(10);
    });
  });
});
