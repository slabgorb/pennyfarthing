/**
 * E2-2: PTY Output Parser Tests
 *
 * These tests verify the acceptance criteria for the parser module.
 * Written in RED phase - tests should fail until Dev implements the functionality.
 */

import { describe, it, expect } from 'vitest';

// Import parser module (will be created by Dev)
import { parseClaudeOutput, stripAnsi, type ParsedStats } from '../src/parser.js';

describe('E2-2: PTY Output Parser', () => {
  describe('AC1: Parser extracts context usage percentage', () => {
    it('should extract context percentage from plain text', () => {
      const data = 'Context: 45.2%';
      const result = parseClaudeOutput(data);
      expect(result).not.toBeNull();
      expect(result?.context).toBe('45.2%');
    });

    it('should extract context percentage with ANSI color codes', () => {
      const data = '\x1b[36mContext: 45.2%\x1b[0m';
      const result = parseClaudeOutput(data);
      expect(result).not.toBeNull();
      expect(result?.context).toBe('45.2%');
    });

    it('should handle 0% context', () => {
      const data = 'Context: 0%';
      const result = parseClaudeOutput(data);
      expect(result?.context).toBe('0%');
    });

    it('should handle 100% context', () => {
      const data = 'Context: 100%';
      const result = parseClaudeOutput(data);
      expect(result?.context).toBe('100%');
    });

    it('should extract context from mixed output', () => {
      const data = 'Some text before Context: 78.5% and after';
      const result = parseClaudeOutput(data);
      expect(result?.context).toBe('78.5%');
    });
  });

  describe('AC2: Parser extracts model name', () => {
    it('should extract sonnet-4 model name (claude- prefix stripped)', () => {
      const data = 'Model: claude-sonnet-4';
      const result = parseClaudeOutput(data);
      expect(result).not.toBeNull();
      expect(result?.model).toBe('sonnet-4');
    });

    it('should extract opus-4-5 model name (claude- prefix stripped)', () => {
      const data = 'Model: claude-opus-4-5';
      const result = parseClaudeOutput(data);
      expect(result?.model).toBe('opus-4-5');
    });

    it('should extract haiku-3-5 model name (claude- prefix stripped)', () => {
      const data = 'Model: claude-haiku-3-5';
      const result = parseClaudeOutput(data);
      expect(result?.model).toBe('haiku-3-5');
    });

    it('should extract model name with ANSI codes', () => {
      const data = '\x1b[32mModel: claude-sonnet-4\x1b[0m';
      const result = parseClaudeOutput(data);
      expect(result?.model).toBe('sonnet-4');
    });

    it('should handle model names in status bar format', () => {
      // Claude may display model differently in status bar
      const data = 'claude-sonnet-4 | Ready';
      const result = parseClaudeOutput(data);
      expect(result?.model).toBe('sonnet-4');
    });
  });

  describe('AC3: Parser detects status changes', () => {
    it('should detect Ready status', () => {
      const data = 'Status: Ready';
      const result = parseClaudeOutput(data);
      expect(result).not.toBeNull();
      expect(result?.status).toBe('ready');
    });

    it('should detect Working status', () => {
      const data = 'Status: Working';
      const result = parseClaudeOutput(data);
      expect(result?.status).toBe('working');
    });

    it('should detect Streaming status', () => {
      const data = 'Status: Streaming';
      const result = parseClaudeOutput(data);
      expect(result?.status).toBe('streaming');
    });

    it('should detect status in status bar format', () => {
      const data = 'claude-sonnet-4 | Ready';
      const result = parseClaudeOutput(data);
      expect(result?.status).toBe('ready');
    });

    it('should detect status with ANSI codes', () => {
      const data = '\x1b[33mWorking...\x1b[0m';
      const result = parseClaudeOutput(data);
      expect(result?.status).toBe('working');
    });

    it('should normalize status to lowercase', () => {
      const data = 'Status: READY';
      const result = parseClaudeOutput(data);
      expect(result?.status).toBe('ready');
    });
  });

  describe('AC4: Output passes through unchanged', () => {
    it('should return null for regular terminal output', () => {
      const data = 'Hello, I am Claude.';
      const result = parseClaudeOutput(data);
      // Parser returns null for non-stat content
      expect(result).toBeNull();
    });

    it('should not modify input data', () => {
      const originalData = 'Context: 45.2%';
      const dataCopy = originalData;
      parseClaudeOutput(originalData);
      expect(originalData).toBe(dataCopy);
    });

    it('should handle empty input', () => {
      const result = parseClaudeOutput('');
      expect(result).toBeNull();
    });

    it('should handle whitespace-only input', () => {
      const result = parseClaudeOutput('   \n\t  ');
      expect(result).toBeNull();
    });
  });

  describe('AC5: Parser handles ANSI escape sequences', () => {
    it('should strip color codes', () => {
      const input = '\x1b[31mRed\x1b[0m \x1b[32mGreen\x1b[0m';
      const result = stripAnsi(input);
      expect(result).toBe('Red Green');
    });

    it('should strip cursor positioning codes', () => {
      const input = '\x1b[2K\x1b[1GContext: 50%';
      const result = stripAnsi(input);
      expect(result).toBe('Context: 50%');
    });

    it('should strip bold/underline codes', () => {
      const input = '\x1b[1mBold\x1b[0m \x1b[4mUnderline\x1b[0m';
      const result = stripAnsi(input);
      expect(result).toBe('Bold Underline');
    });

    it('should handle complex ANSI sequences', () => {
      const input = '\x1b[38;5;196mCustom Color\x1b[0m';
      const result = stripAnsi(input);
      expect(result).toBe('Custom Color');
    });

    it('should handle input with no ANSI codes', () => {
      const input = 'Plain text';
      const result = stripAnsi(input);
      expect(result).toBe('Plain text');
    });

    it('should parse stats from heavily formatted output', () => {
      const data = '\x1b[2K\x1b[1G\x1b[36mContext: 67.3%\x1b[0m \x1b[33m|\x1b[0m \x1b[32mclaude-sonnet-4\x1b[0m';
      const result = parseClaudeOutput(data);
      expect(result?.context).toBe('67.3%');
      expect(result?.model).toBe('sonnet-4');
    });
  });

  describe('Combined parsing scenarios', () => {
    it('should extract multiple stats from single output', () => {
      const data = 'Context: 45.2% | Model: claude-sonnet-4 | Ready';
      const result = parseClaudeOutput(data);
      expect(result?.context).toBe('45.2%');
      expect(result?.model).toBe('sonnet-4');
      expect(result?.status).toBe('ready');
    });

    it('should handle partial stat extraction', () => {
      // Only context present, no model or status
      const data = 'Context: 30%';
      const result = parseClaudeOutput(data);
      expect(result?.context).toBe('30%');
      expect(result?.model).toBeUndefined();
      expect(result?.status).toBeUndefined();
    });

    it('should handle real Claude status bar format', () => {
      // Simulated Claude status bar output
      const data = '\x1b[2K\x1b[1G\x1b[90m────────────────────────────────\x1b[0m\n' +
                   '\x1b[36mclaude-sonnet-4\x1b[0m | \x1b[32mReady\x1b[0m | \x1b[33mContext: 52.1%\x1b[0m';
      const result = parseClaudeOutput(data);
      expect(result?.model).toBe('sonnet-4');
      expect(result?.status).toBe('ready');
      expect(result?.context).toBe('52.1%');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should never throw an exception', () => {
      const invalidInputs = [
        null as unknown as string,
        undefined as unknown as string,
        123 as unknown as string,
        {} as unknown as string,
        [] as unknown as string,
      ];

      for (const input of invalidInputs) {
        expect(() => parseClaudeOutput(input)).not.toThrow();
      }
    });

    it('should return null for invalid input types', () => {
      expect(parseClaudeOutput(null as unknown as string)).toBeNull();
      expect(parseClaudeOutput(undefined as unknown as string)).toBeNull();
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(100000) + 'Context: 50%' + 'b'.repeat(100000);
      const result = parseClaudeOutput(longString);
      expect(result?.context).toBe('50%');
    });

    it('should handle binary-like data', () => {
      const binaryData = '\x00\x01\x02Context: 25%\x03\x04';
      const result = parseClaudeOutput(binaryData);
      // Should either extract or return null, but not crash
      expect(() => parseClaudeOutput(binaryData)).not.toThrow();
    });
  });

  describe('ParsedStats type', () => {
    it('should match expected interface', () => {
      const stats: ParsedStats = {
        context: '50%',
        model: 'claude-sonnet-4',
        status: 'ready',
      };
      expect(stats.context).toBeDefined();
      expect(stats.model).toBeDefined();
      expect(stats.status).toBeDefined();
    });

    it('should allow partial stats', () => {
      const partialStats: ParsedStats = {
        context: '75%',
      };
      expect(partialStats.context).toBe('75%');
      expect(partialStats.model).toBeUndefined();
    });
  });

  describe('Permission mode detection', () => {
    it('should detect Normal mode', () => {
      const data = 'Normal | Ready';
      const result = parseClaudeOutput(data);
      expect(result?.mode).toBe('Normal');
    });

    it('should detect Plan mode', () => {
      const data = 'Plan | Ready';
      const result = parseClaudeOutput(data);
      expect(result?.mode).toBe('Plan');
    });

    it('should detect "plan mode" variation', () => {
      const data = 'plan mode on | Ready';
      const result = parseClaudeOutput(data);
      expect(result?.mode).toBe('Plan');
    });

    it('should detect Auto-accept edits mode', () => {
      const data = 'Auto-accept edits | Ready';
      const result = parseClaudeOutput(data);
      expect(result?.mode).toBe('Auto-accept');
    });

    it('should detect "accept edits on" variation', () => {
      const data = 'accept edits on | Ready';
      const result = parseClaudeOutput(data);
      expect(result?.mode).toBe('Auto-accept');
    });

    it('should detect "accept edits" without "on"', () => {
      const data = 'accept edits | Ready';
      const result = parseClaudeOutput(data);
      expect(result?.mode).toBe('Auto-accept');
    });

    it('should detect mode with ANSI codes', () => {
      const data = '\x1b[36mNormal\x1b[0m | \x1b[32mReady\x1b[0m';
      const result = parseClaudeOutput(data);
      expect(result?.mode).toBe('Normal');
    });

    it('should normalize mode case', () => {
      const data = 'NORMAL | Ready';
      const result = parseClaudeOutput(data);
      expect(result?.mode).toBe('Normal');
    });

    it('should detect mode in full status bar', () => {
      const data = '\x1b[36mclaude-sonnet-4\x1b[0m | \x1b[32mReady\x1b[0m | Normal | Context: 52.1%';
      const result = parseClaudeOutput(data);
      expect(result?.mode).toBe('Normal');
      expect(result?.model).toBe('sonnet-4');
      expect(result?.context).toBe('52.1%');
    });
  });
});
