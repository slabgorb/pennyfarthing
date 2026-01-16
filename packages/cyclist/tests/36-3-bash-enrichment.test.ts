/**
 * Story 36-3: Bash Tool Enrichment Tests
 *
 * Tests for the pure functions used in Bash tool enrichment.
 * Like 36-2, we test only pure functions due to ESM mocking limitations.
 *
 * Acceptance Criteria:
 * 1. Command included in span (secrets redacted)
 * 2. Exit code captured
 * 3. Output summary (first 5 lines, last 5 lines if truncated)
 * 4. Execution duration accurate
 * 5. Working directory included
 *
 * API Documentation (see src/file-enrichment.ts for implementation):
 *
 * Types:
 *   - OutputSummary: { firstLines: string[], lastLines: string[], totalLines: number, truncated: boolean }
 *   - BashEnrichment: { spanId, toolName: 'Bash', command, exitCode, outputSummary, workingDirectory, durationMs }
 *   - BashEventContext: { output?, error?, success: boolean, durationMs? }
 *
 * Functions:
 *   - redactSecrets(command: string): string
 *   - createOutputSummary(output: string | undefined): OutputSummary
 *   - extractExitCode(output, error, success): number | null
 *   - enrichBashSpan(spanId: string, eventContext: BashEventContext): BashEnrichment
 */

import { describe, it, expect } from 'vitest';

import {
  redactSecrets,
  createOutputSummary,
  extractExitCode,
} from '../src/file-enrichment.js';

describe('Story 36-3: Bash Enrichment (pure functions only)', () => {

  describe('AC1: Secret redaction', () => {
    it('should redact password=value patterns', () => {
      const command = 'curl -u user:password=secret123 https://api.example.com';
      const redacted = redactSecrets(command);
      expect(redacted).toContain('password=[REDACTED]');
      expect(redacted).not.toContain('secret123');
    });

    it('should redact token=value patterns', () => {
      const command = 'export TOKEN=abc123xyz456';
      const redacted = redactSecrets(command);
      expect(redacted).toContain('TOKEN=[REDACTED]');
      expect(redacted).not.toContain('abc123xyz456');
    });

    it('should redact API_KEY patterns', () => {
      const command = 'curl -H "api_key: sk-1234567890abcdefghij"';
      const redacted = redactSecrets(command);
      expect(redacted).toContain('api_key=[REDACTED]');
      expect(redacted).not.toContain('sk-1234567890abcdefghij');
    });

    it('should redact AWS credential patterns', () => {
      const command = 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
      const redacted = redactSecrets(command);
      expect(redacted).toContain('AWS_SECRET_ACCESS_KEY=[REDACTED]');
      expect(redacted).not.toContain('wJalrXUtnFEMI');
    });

    it('should redact GitHub tokens', () => {
      const command = 'git clone https://ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@github.com/org/repo';
      const redacted = redactSecrets(command);
      expect(redacted).toContain('[REDACTED]');
      expect(redacted).not.toContain('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    });

    it('should redact long base64-like strings', () => {
      const longToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ';
      const command = `curl -H "Authorization: Bearer ${longToken}"`;
      const redacted = redactSecrets(command);
      expect(redacted).toContain('[REDACTED]');
      expect(redacted).not.toContain(longToken);
    });

    it('should not redact short safe strings', () => {
      const command = 'echo "hello world"';
      const redacted = redactSecrets(command);
      expect(redacted).toBe(command);
    });

    it('should handle empty command', () => {
      expect(redactSecrets('')).toBe('');
    });

    it('should preserve command structure while redacting', () => {
      const command = 'curl -X POST -H "Authorization: token=secret123abc456def" https://api.com';
      const redacted = redactSecrets(command);
      expect(redacted).toContain('curl');
      expect(redacted).toContain('-X POST');
      expect(redacted).toContain('https://api.com');
      expect(redacted).toContain('token=[REDACTED]');
    });
  });

  describe('AC3: Output summary', () => {
    it('should handle undefined output', () => {
      const summary = createOutputSummary(undefined);
      expect(summary.firstLines).toEqual([]);
      expect(summary.lastLines).toEqual([]);
      expect(summary.totalLines).toBe(0);
      expect(summary.truncated).toBe(false);
    });

    it('should handle empty output', () => {
      const summary = createOutputSummary('');
      expect(summary.firstLines).toEqual(['']);
      expect(summary.totalLines).toBe(1);
      expect(summary.truncated).toBe(false);
    });

    it('should return all lines for short output (under threshold)', () => {
      const output = 'line1\nline2\nline3';
      const summary = createOutputSummary(output);
      expect(summary.firstLines).toEqual(['line1', 'line2', 'line3']);
      expect(summary.lastLines).toEqual([]);
      expect(summary.totalLines).toBe(3);
      expect(summary.truncated).toBe(false);
    });

    it('should return all lines for output exactly at threshold (10 lines)', () => {
      const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);
      const output = lines.join('\n');
      const summary = createOutputSummary(output);
      expect(summary.firstLines).toEqual(lines);
      expect(summary.lastLines).toEqual([]);
      expect(summary.totalLines).toBe(10);
      expect(summary.truncated).toBe(false);
    });

    it('should truncate output over threshold (first 5 + last 5)', () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
      const output = lines.join('\n');
      const summary = createOutputSummary(output);
      expect(summary.firstLines).toEqual(['line1', 'line2', 'line3', 'line4', 'line5']);
      expect(summary.lastLines).toEqual(['line16', 'line17', 'line18', 'line19', 'line20']);
      expect(summary.totalLines).toBe(20);
      expect(summary.truncated).toBe(true);
    });

    it('should handle output with 11 lines (just over threshold)', () => {
      const lines = Array.from({ length: 11 }, (_, i) => `line${i + 1}`);
      const output = lines.join('\n');
      const summary = createOutputSummary(output);
      expect(summary.firstLines).toEqual(['line1', 'line2', 'line3', 'line4', 'line5']);
      expect(summary.lastLines).toEqual(['line7', 'line8', 'line9', 'line10', 'line11']);
      expect(summary.totalLines).toBe(11);
      expect(summary.truncated).toBe(true);
    });
  });

  describe('AC2: Exit code extraction', () => {
    it('should return 0 for successful commands', () => {
      const exitCode = extractExitCode('output', undefined, true);
      expect(exitCode).toBe(0);
    });

    it('should return 1 for failed commands without specific code', () => {
      const exitCode = extractExitCode('output', 'Command failed', false);
      expect(exitCode).toBe(1);
    });

    it('should extract exit code from "Exit code N" format', () => {
      const exitCode = extractExitCode('', 'Exit code 127', false);
      expect(exitCode).toBe(127);
    });

    it('should extract exit code from "exit code: N" format', () => {
      const exitCode = extractExitCode('', 'Command failed with exit code: 2', false);
      expect(exitCode).toBe(2);
    });

    it('should extract exit code from "exited with N" format', () => {
      const exitCode = extractExitCode('', 'Process exited with 128', false);
      expect(exitCode).toBe(128);
    });

    it('should handle undefined error with failure', () => {
      const exitCode = extractExitCode('some output', undefined, false);
      expect(exitCode).toBe(1);
    });

    it('should handle undefined output', () => {
      const exitCode = extractExitCode(undefined, undefined, true);
      expect(exitCode).toBe(0);
    });
  });
});

/**
 * The following tests are SKIPPED due to ESM mocking limitations.
 * They document the expected behavior but cannot run.
 *
 * AC4: Execution duration accurate
 *   - enrichBashSpan receives durationMs from OTEL event
 *   - Duration is included in BashEnrichment result
 *   - Duration is 0 if not provided
 *
 * AC5: Working directory included
 *   - enrichBashSpan extracts cwd from tool input if available
 *   - Falls back to process.cwd() if not specified
 *   - Working directory included in BashEnrichment result
 *
 * Integration tests (enrichBashSpan):
 *   - Looks up span from correlation store by spanId
 *   - Returns error enrichment if span not found
 *   - Returns skipped enrichment if already enriched
 *   - Combines correlation data with event context
 *   - Marks span as enriched after processing
 */
