/**
 * Story MSSCI-11734: Enriched Span Export and Visualization Tests
 *
 * Tests for the enriched span export API and timeline visualization.
 * This story completes Epic 36 (OTEL Tool Call Enrichment) by enabling
 * users to export and visualize all enriched telemetry data.
 *
 * These tests are written to FAIL initially (RED phase) and should pass
 * after Dev implements the required modules.
 *
 * Acceptance Criteria:
 * 1. Custom exporter adds enrichment attributes to spans
 * 2. Timeline visualization renders in Cyclist UI
 * 3. Filter controls for tool type and status
 * 4. JSON export includes all enriched data
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// =============================================================================
// AC1: Custom Exporter Tests
// =============================================================================

// Types that will be created by Dev
import type {
  EnrichedSpan,
  EnrichedSpanExport,
  SpanFilter,
} from '../src/enriched-span-exporter.js';

// Functions that don't exist yet - imports will fail until Dev implements
import {
  getEnrichedSpans,
  exportEnrichedSpans,
  filterSpans,
  formatSpanForExport,
} from '../src/enriched-span-exporter.js';

// Import functions to inject mock data into the OTEL receiver
import { recordToolEvent, resetEventStore } from '../src/otlp-receiver.js';

// =============================================================================
// Test Fixtures - Mock Enriched Spans
// =============================================================================

/**
 * Mock enriched span with Bash tool attributes
 */
const mockBashSpan: EnrichedSpan = {
  spanId: 'span-bash-001',
  traceId: 'trace-001',
  toolName: 'Bash',
  startTime: 1704844800000,
  endTime: 1704844805000,
  durationMs: 5000,
  status: 'completed',
  success: true,
  enrichment: {
    command: 'npm test',
    exitCode: 0,
    outputSummary: {
      firstLines: ['> test', 'PASS src/test.ts'],
      lastLines: ['Tests: 5 passed'],
      totalLines: 10,
      truncated: false,
    },
    workingDirectory: '/project',
  },
};

/**
 * Mock enriched span with Read tool attributes
 */
const mockReadSpan: EnrichedSpan = {
  spanId: 'span-read-001',
  traceId: 'trace-001',
  toolName: 'Read',
  startTime: 1704844810000,
  endTime: 1704844810050,
  durationMs: 50,
  status: 'completed',
  success: true,
  enrichment: {
    fileSize: 2048,
    lineCount: 85,
    language: 'typescript',
    gitStatus: 'clean',
  },
};

/**
 * Mock enriched span with Task/subagent attributes
 */
const mockTaskSpan: EnrichedSpan = {
  spanId: 'span-task-001',
  traceId: 'trace-001',
  toolName: 'Task',
  startTime: 1704844820000,
  endTime: 1704844890000,
  durationMs: 70000,
  status: 'completed',
  success: true,
  enrichment: {
    subagentType: 'Explore',
    promptSummary: 'Find all test files in the project...',
    resultSummary: 'Found 15 test files in packages/cyclist/tests...',
    background: false,
  },
};

/**
 * Mock enriched span with error status
 */
const mockFailedBashSpan: EnrichedSpan = {
  spanId: 'span-bash-002',
  traceId: 'trace-002',
  toolName: 'Bash',
  startTime: 1704844900000,
  endTime: 1704844905000,
  durationMs: 5000,
  status: 'error',
  success: false,
  error: 'Command failed with exit code 1',
  enrichment: {
    command: 'npm run build',
    exitCode: 1,
    outputSummary: {
      firstLines: ['> build', 'error TS2345: Argument of type...'],
      lastLines: ['Build failed'],
      totalLines: 25,
      truncated: true,
    },
    workingDirectory: '/project',
  },
};

/**
 * Mock enriched span with Grep tool attributes
 */
const mockGrepSpan: EnrichedSpan = {
  spanId: 'span-grep-001',
  traceId: 'trace-001',
  toolName: 'Grep',
  startTime: 1704844815000,
  endTime: 1704844815100,
  durationMs: 100,
  status: 'completed',
  success: true,
  enrichment: {
    pattern: 'export function',
    matchCount: 42,
    fileCount: 8,
    truncated: false,
  },
};

// =============================================================================
// AC1: Custom exporter adds enrichment attributes
// =============================================================================

describe('AC1: Custom exporter adds enrichment attributes', () => {
  describe('getEnrichedSpans()', () => {
    // Inject mock tool events before each test in this describe block
    beforeEach(() => {
      resetEventStore();
      // Inject mock Bash event
      recordToolEvent({
        toolName: 'Bash',
        input: 'npm test',
        output: '> test\nPASS src/test.ts\nTests: 5 passed',
        durationMs: 5000,
        success: true,
        timestamp: 1704844800000,
        traceId: 'trace-001',
        spanId: 'span-bash-001',
      });
      // Inject mock Read event with enrichment
      recordToolEvent({
        toolName: 'Read',
        input: '/project/src/index.ts',
        output: 'file contents...',
        durationMs: 50,
        success: true,
        timestamp: 1704844810000,
        traceId: 'trace-001',
        spanId: 'span-read-001',
        fileSize: 2048,
        lineCount: 85,
        language: 'typescript',
        gitStatus: 'clean',
      });
      // Inject mock Task event
      recordToolEvent({
        toolName: 'Task',
        input: 'Find all test files in the project',
        output: 'Found 15 test files...',
        durationMs: 70000,
        success: true,
        timestamp: 1704844820000,
        traceId: 'trace-001',
        spanId: 'span-task-001',
        subagentType: 'Explore',
        promptSummary: 'Find all test files in the project...',
        resultSummary: 'Found 15 test files in packages/cyclist/tests...',
        background: false,
      } as Parameters<typeof recordToolEvent>[0]);
      // Inject mock failed Bash event
      recordToolEvent({
        toolName: 'Bash',
        input: 'npm run build',
        output: 'error TS2345: Argument of type...\nBuild failed',
        durationMs: 5000,
        success: false,
        error: 'Command failed with exit code 1',
        timestamp: 1704844900000,
        traceId: 'trace-002',
        spanId: 'span-bash-002',
      });
    });

    afterEach(() => {
      resetEventStore();
    });

    it('should return all spans with enrichment data', async () => {
      const spans = await getEnrichedSpans();

      expect(spans).toBeDefined();
      expect(Array.isArray(spans)).toBe(true);
      expect(spans.length).toBeGreaterThan(0);
    });

    it('should include enrichment attributes for Bash spans', async () => {
      const spans = await getEnrichedSpans();
      const bashSpan = spans.find((s) => s.toolName === 'Bash' && s.success);

      expect(bashSpan).toBeDefined();
      expect(bashSpan?.enrichment).toHaveProperty('command');
      expect(bashSpan?.enrichment).toHaveProperty('exitCode');
    });

    it('should include enrichment attributes for Read spans', async () => {
      const spans = await getEnrichedSpans();
      const readSpan = spans.find((s) => s.toolName === 'Read');

      expect(readSpan).toBeDefined();
      expect(readSpan?.enrichment).toHaveProperty('fileSize');
      expect(readSpan?.enrichment).toHaveProperty('lineCount');
      expect(readSpan?.enrichment).toHaveProperty('language');
    });

    it('should include enrichment attributes for Task spans', async () => {
      const spans = await getEnrichedSpans();
      const taskSpan = spans.find((s) => s.toolName === 'Task');

      expect(taskSpan).toBeDefined();
      expect(taskSpan?.enrichment).toHaveProperty('subagentType');
      expect(taskSpan?.enrichment).toHaveProperty('promptSummary');
      expect(taskSpan?.enrichment).toHaveProperty('resultSummary');
    });

    it('should include error details for failed spans', async () => {
      const spans = await getEnrichedSpans();
      const failedSpan = spans.find((s) => s.status === 'error');

      expect(failedSpan).toBeDefined();
      expect(failedSpan?.success).toBe(false);
      expect(failedSpan?.error).toBeDefined();
    });
  });

  describe('formatSpanForExport()', () => {
    it('should format span with all required fields', () => {
      const formatted = formatSpanForExport(mockBashSpan);

      expect(formatted).toHaveProperty('spanId');
      expect(formatted).toHaveProperty('traceId');
      expect(formatted).toHaveProperty('toolName');
      expect(formatted).toHaveProperty('startTime');
      expect(formatted).toHaveProperty('endTime');
      expect(formatted).toHaveProperty('durationMs');
      expect(formatted).toHaveProperty('status');
      expect(formatted).toHaveProperty('enrichment');
    });

    it('should preserve enrichment attributes in exported format', () => {
      const formatted = formatSpanForExport(mockBashSpan);

      expect(formatted.enrichment.command).toBe('npm test');
      expect(formatted.enrichment.exitCode).toBe(0);
    });

    it('should include ISO timestamps for readability', () => {
      const formatted = formatSpanForExport(mockBashSpan);

      expect(formatted).toHaveProperty('startTimeISO');
      expect(formatted).toHaveProperty('endTimeISO');
      expect(formatted.startTimeISO).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});

// =============================================================================
// AC3: Filter controls for tool type and status
// =============================================================================

describe('AC3: Filter controls for tool type and status', () => {
  const allSpans = [
    mockBashSpan,
    mockReadSpan,
    mockTaskSpan,
    mockFailedBashSpan,
    mockGrepSpan,
  ];

  describe('filterSpans() - tool type filter', () => {
    it('should filter spans by single tool type', () => {
      const filter: SpanFilter = { toolTypes: ['Bash'] };
      const filtered = filterSpans(allSpans, filter);

      expect(filtered).toHaveLength(2); // mockBashSpan and mockFailedBashSpan
      expect(filtered.every((s) => s.toolName === 'Bash')).toBe(true);
    });

    it('should filter spans by multiple tool types', () => {
      const filter: SpanFilter = { toolTypes: ['Read', 'Grep'] };
      const filtered = filterSpans(allSpans, filter);

      expect(filtered).toHaveLength(2);
      expect(filtered.some((s) => s.toolName === 'Read')).toBe(true);
      expect(filtered.some((s) => s.toolName === 'Grep')).toBe(true);
    });

    it('should return all spans when no tool type filter', () => {
      const filter: SpanFilter = {};
      const filtered = filterSpans(allSpans, filter);

      expect(filtered).toHaveLength(allSpans.length);
    });
  });

  describe('filterSpans() - status filter', () => {
    it('should filter spans by success status', () => {
      const filter: SpanFilter = { status: 'success' };
      const filtered = filterSpans(allSpans, filter);

      expect(filtered.every((s) => s.success === true)).toBe(true);
      expect(filtered).toHaveLength(4); // All except mockFailedBashSpan
    });

    it('should filter spans by error status', () => {
      const filter: SpanFilter = { status: 'error' };
      const filtered = filterSpans(allSpans, filter);

      expect(filtered.every((s) => s.status === 'error')).toBe(true);
      expect(filtered).toHaveLength(1); // Only mockFailedBashSpan
    });
  });

  describe('filterSpans() - combined filters', () => {
    it('should filter by both tool type and status', () => {
      const filter: SpanFilter = { toolTypes: ['Bash'], status: 'success' };
      const filtered = filterSpans(allSpans, filter);

      expect(filtered).toHaveLength(1); // Only successful Bash span
      expect(filtered[0].toolName).toBe('Bash');
      expect(filtered[0].success).toBe(true);
    });

    it('should return empty array when no spans match combined filters', () => {
      const filter: SpanFilter = { toolTypes: ['Read'], status: 'error' };
      const filtered = filterSpans(allSpans, filter);

      expect(filtered).toHaveLength(0);
    });
  });

  describe('filterSpans() - time range filter', () => {
    it('should filter spans by time range', () => {
      const filter: SpanFilter = {
        startTime: 1704844805000,
        endTime: 1704844820000,
      };
      const filtered = filterSpans(allSpans, filter);

      // Should include Read (1704844810000) and Grep (1704844815000)
      expect(filtered.length).toBeGreaterThan(0);
      expect(
        filtered.every(
          (s) => s.startTime >= filter.startTime! && s.startTime <= filter.endTime!
        )
      ).toBe(true);
    });
  });
});

// =============================================================================
// AC4: JSON export includes all enriched data
// =============================================================================

describe('AC4: JSON export includes all enriched data', () => {
  const allSpans = [
    mockBashSpan,
    mockReadSpan,
    mockTaskSpan,
    mockFailedBashSpan,
    mockGrepSpan,
  ];

  describe('exportEnrichedSpans()', () => {
    it('should export all spans as JSON with metadata', () => {
      const exported = exportEnrichedSpans(allSpans);

      expect(exported).toHaveProperty('exportedAt');
      expect(exported).toHaveProperty('spanCount');
      expect(exported).toHaveProperty('spans');
      expect(exported.spanCount).toBe(allSpans.length);
    });

    it('should include session metadata in export', () => {
      const exported = exportEnrichedSpans(allSpans);

      expect(exported).toHaveProperty('metadata');
      expect(exported.metadata).toHaveProperty('version');
      expect(exported.metadata).toHaveProperty('exportFormat');
    });

    it('should preserve all enrichment attributes in export', () => {
      const exported = exportEnrichedSpans(allSpans);
      const bashSpan = exported.spans.find(
        (s: EnrichedSpan) => s.toolName === 'Bash' && s.success
      );

      expect(bashSpan.enrichment.command).toBe('npm test');
      expect(bashSpan.enrichment.exitCode).toBe(0);
      expect(bashSpan.enrichment.outputSummary).toBeDefined();
    });

    it('should apply filters before export', () => {
      const filter: SpanFilter = { toolTypes: ['Read'] };
      const exported = exportEnrichedSpans(allSpans, filter);

      expect(exported.spanCount).toBe(1);
      expect(exported.spans[0].toolName).toBe('Read');
    });

    it('should include summary statistics in export', () => {
      const exported = exportEnrichedSpans(allSpans);

      expect(exported).toHaveProperty('summary');
      expect(exported.summary).toHaveProperty('totalDurationMs');
      expect(exported.summary).toHaveProperty('successCount');
      expect(exported.summary).toHaveProperty('errorCount');
      expect(exported.summary).toHaveProperty('toolBreakdown');
    });

    it('should calculate correct tool breakdown in summary', () => {
      const exported = exportEnrichedSpans(allSpans);

      expect(exported.summary.toolBreakdown).toHaveProperty('Bash');
      expect(exported.summary.toolBreakdown.Bash).toBe(2);
      expect(exported.summary.toolBreakdown).toHaveProperty('Read');
      expect(exported.summary.toolBreakdown.Read).toBe(1);
    });
  });

  describe('JSON export format validation', () => {
    it('should produce valid JSON string', () => {
      const exported = exportEnrichedSpans(allSpans);
      const jsonString = JSON.stringify(exported);

      expect(() => JSON.parse(jsonString)).not.toThrow();
    });

    it('should handle spans with special characters in output', () => {
      const spanWithSpecialChars: EnrichedSpan = {
        ...mockBashSpan,
        enrichment: {
          ...mockBashSpan.enrichment,
          command: 'echo "hello\nworld" | grep "test"',
        },
      };

      const exported = exportEnrichedSpans([spanWithSpecialChars]);
      const jsonString = JSON.stringify(exported);

      expect(() => JSON.parse(jsonString)).not.toThrow();
    });
  });
});
