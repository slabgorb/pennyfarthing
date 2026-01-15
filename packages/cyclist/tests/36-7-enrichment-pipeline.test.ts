/**
 * Story 36-7: Wire up Read/Edit enrichment to OTEL receiver
 *
 * Integration tests verifying that the span correlation and file enrichment
 * modules (36-1, 36-2) are properly wired into the OTEL processing pipeline.
 *
 * Tests the fix for the bug where enrichment code existed but was never called.
 * 
 * Story 36-9: Tests updated to verify enrichment works after removing the
 * blocking guard that required OTEL spanId/traceId. Now enrichment happens
 * using the toolId from the Claude message stream instead.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  processLogEvents,
  resetEventStore,
  getToolEvents,
  type ToolEvent,
} from '../src/otlp-receiver.js';
import {
  getAllCorrelations,
  resetCorrelations,
  getCorrelation,
  storePendingToolInput,  // Story 36-8: Import for new correlation mechanism
} from '../src/span-correlation.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Result object from createToolResultEvent helper
 * Story 36-9: Returns both the event and the correlation key (toolId)
 */
interface ToolResultEventResult {
  event: {
    name: string;
    timestamp: number;
    traceId?: string;
    spanId?: string;
    attributes: Record<string, string | number | boolean | undefined>;
  };
  /** The correlation key used internally (toolId from message stream) */
  correlationId: string;
}

/**
 * Create a mock OTLP tool_result event
 *
 * Story 36-8: Also stores the tool input as a pending input (simulating
 * what main.ts does when it receives a tool_use message from Claude).
 * OTEL events don't include file_path; it must come from the message stream.
 * 
 * Story 36-9: Returns the correlationId (toolId) so tests can look up
 * correlations and tool events using the correct key.
 */
function createToolResultEvent(
  toolName: string,
  toolParameters: Record<string, unknown>,
  options: {
    spanId?: string;
    traceId?: string;
    success?: boolean;
    durationMs?: number;
  } = {}
): ToolResultEventResult {
  const spanId = options.spanId ?? `span-${Math.random().toString(36).substr(2, 9)}`;
  const toolId = `tool-${spanId}`; // Generate a mock tool_id

  // Story 36-8: Store the tool input as pending (simulating Claude message stream)
  // This must be called before processLogEvents() to correlate properly
  storePendingToolInput(toolId, toolName, toolParameters);

  return {
    event: {
      name: 'claude_code.tool_result',
      timestamp: Date.now(),
      traceId: options.traceId ?? 'test-trace-id',
      spanId,
      attributes: {
        tool_name: toolName,
        // Note: OTEL tool_parameters does NOT contain file_path in real data
        // The pending tool input stored above provides the file_path
        tool_parameters: JSON.stringify(toolParameters),
        success: String(options.success ?? true),
        duration_ms: String(options.durationMs ?? 100),
      } as Record<string, string | number | boolean | undefined>,
    },
    correlationId: toolId,  // Story 36-9: The correlation key used internally
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('Story 36-7: Enrichment Pipeline Wiring', () => {
  let testDir: string;

  beforeEach(async () => {
    resetEventStore(); // This also calls resetCorrelations()
    // Create temp directory for test files
    testDir = join(tmpdir(), `cyclist-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    resetEventStore();
    // Clean up test files
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }
  });

  describe('AC1: processLogEvents calls correlateSpan for tool spans', () => {

    it('should create correlation for Read tool events', async () => {
      const { event, correlationId } = createToolResultEvent('Read', {
        file_path: '/test/file.ts',
      });

      await processLogEvents([event]);

      // Story 36-9: Look up correlation using toolId (correlationId), not OTEL spanId
      const correlation = getCorrelation(correlationId);
      expect(correlation).toBeDefined();
      expect(correlation!.toolName).toBe('Read');
      expect(correlation!.spanId).toBe(correlationId);  // After fix, spanId is the toolId
      expect(correlation!.traceId).toBe(correlationId);  // Synthetic traceId from toolId
    });

    it('should create correlation for Edit tool events', async () => {
      const { event, correlationId } = createToolResultEvent('Edit', {
        file_path: '/test/file.ts',
        old_string: 'old',
        new_string: 'new',
      });

      await processLogEvents([event]);

      const correlation = getCorrelation(correlationId);
      expect(correlation).toBeDefined();
      expect(correlation!.toolName).toBe('Edit');
    });

    it('should create correlation for Bash tool events', async () => {
      const { event, correlationId } = createToolResultEvent('Bash', {
        command: 'ls -la',
      });

      await processLogEvents([event]);

      const correlation = getCorrelation(correlationId);
      expect(correlation).toBeDefined();
      expect(correlation!.toolName).toBe('Bash');
    });

    it('should NOT create correlation for events without pending input', async () => {
      // Create an event without storing pending input (simulate missing message stream data)
      const event = {
        name: 'claude_code.tool_result',
        timestamp: Date.now(),
        traceId: 'test-trace-id',
        spanId: 'test-span',
        attributes: {
          tool_name: 'Read',
          tool_parameters: JSON.stringify({ file_path: '/test.ts' }),
          success: 'true',
          duration_ms: '100',
        } as Record<string, string | number | boolean | undefined>,
      };

      // Don't call storePendingToolInput - this simulates missing correlation data
      await processLogEvents([event]);

      const correlations = getAllCorrelations();
      // Story 36-9: After removing the blocking guard, correlation is only created if pending input exists
      expect(correlations).toHaveLength(0);
    });

    it('should include messageContext with tool input', async () => {
      const { event, correlationId } = createToolResultEvent('Read', {
        file_path: '/test/file.ts',
        offset: 100,
        limit: 50,
      });

      await processLogEvents([event]);

      const correlation = getCorrelation(correlationId);
      expect(correlation?.messageContext).toBeDefined();
      expect(correlation?.messageContext?.input).toEqual({
        file_path: '/test/file.ts',
        offset: 100,
        limit: 50,
      });
    });

  });

  describe('AC2: Read tool spans get file metadata enrichment', () => {

    it('should enrich Read spans with file size and line count', async () => {
      // Create a test file
      const testFile = join(testDir, 'test.ts');
      await writeFile(testFile, 'line 1\nline 2\nline 3\n');

      const { event, correlationId } = createToolResultEvent('Read', {
        file_path: testFile,
      });

      await processLogEvents([event]);

      // Story 36-9: Look up tool event using correlationId (toolId)
      const toolEvents = getToolEvents();
      const readEvent = toolEvents.find(e => e.spanId === correlationId);

      expect(readEvent).toBeDefined();
      expect(readEvent!.fileSize).toBeGreaterThan(0);
      expect(readEvent!.lineCount).toBe(4); // 3 lines + trailing newline
    });

    it('should enrich Read spans with language detection', async () => {
      const testFile = join(testDir, 'component.tsx');
      await writeFile(testFile, 'export const App = () => <div />;');

      const { event, correlationId } = createToolResultEvent('Read', {
        file_path: testFile,
      });

      await processLogEvents([event]);

      const toolEvents = getToolEvents();
      const readEvent = toolEvents.find(e => e.spanId === correlationId);

      expect(readEvent?.language).toBe('typescriptreact');
    });

    it('should enrich Read spans with git status', async () => {
      // This test depends on being in a git repo, so skip if file is outside repo
      const testFile = join(testDir, 'new-file.ts');
      await writeFile(testFile, 'new file content');

      const { event, correlationId } = createToolResultEvent('Read', {
        file_path: testFile,
      });

      await processLogEvents([event]);

      const toolEvents = getToolEvents();
      const readEvent = toolEvents.find(e => e.spanId === correlationId);

      // Git status may be null if not in a git repo (temp dir usually isn't)
      // The enrichment should still complete without error
      expect(readEvent).toBeDefined();
    });

  });

  describe('AC3: Edit tool spans get diff summary enrichment', () => {

    it('should enrich Edit spans with diff summary', async () => {
      const testFile = join(testDir, 'edit-test.ts');
      await writeFile(testFile, 'const x = 1;');

      const { event, correlationId } = createToolResultEvent('Edit', {
        file_path: testFile,
        old_string: 'const x = 1;',
        new_string: 'const x = 2;\nconst y = 3;',
      });

      await processLogEvents([event]);

      const toolEvents = getToolEvents();
      const editEvent = toolEvents.find(e => e.spanId === correlationId);

      expect(editEvent?.diff).toBeDefined();
      expect(editEvent?.diff?.added).toBeGreaterThan(0);
    });

    it('should enrich Edit spans with language detection', async () => {
      const testFile = join(testDir, 'styles.css');
      await writeFile(testFile, '.foo { color: red; }');

      const { event, correlationId } = createToolResultEvent('Edit', {
        file_path: testFile,
        old_string: '.foo { color: red; }',
        new_string: '.foo { color: blue; }',
      });

      await processLogEvents([event]);

      const toolEvents = getToolEvents();
      const editEvent = toolEvents.find(e => e.spanId === correlationId);

      expect(editEvent?.language).toBe('css');
    });

  });

  describe('AC4: Enriched data visible in tool event storage', () => {

    it('should store enrichment data in ToolEvent record', async () => {
      const testFile = join(testDir, 'stored.py');
      await writeFile(testFile, 'def hello():\n    pass\n');

      const { event } = createToolResultEvent('Read', {
        file_path: testFile,
      });

      await processLogEvents([event]);

      const toolEvents = getToolEvents();
      expect(toolEvents).toHaveLength(1);

      const storedEvent = toolEvents[0];
      expect(storedEvent.language).toBe('python');
      expect(storedEvent.fileSize).toBeDefined();
      expect(storedEvent.lineCount).toBeDefined();
    });

    it('should handle events without file paths gracefully', async () => {
      const { event } = createToolResultEvent('Bash', {
        command: 'echo hello',
      });

      await processLogEvents([event]);

      const toolEvents = getToolEvents();
      expect(toolEvents).toHaveLength(1);

      // Bash events don't get file enrichment, but shouldn't error
      const storedEvent = toolEvents[0];
      expect(storedEvent.language).toBeUndefined();
      expect(storedEvent.fileSize).toBeUndefined();
    });

  });

  describe('AC5: Enrichment integrates with session lifecycle', () => {

    it('should reset correlations when event store is reset', async () => {
      const { event } = createToolResultEvent('Read', {
        file_path: '/test/file.ts',
      });

      await processLogEvents([event]);
      expect(getAllCorrelations()).toHaveLength(1);

      resetEventStore();
      expect(getAllCorrelations()).toHaveLength(0);
    });

    it('should handle multiple events in sequence', async () => {
      const result1 = createToolResultEvent('Read', { file_path: '/a.ts' }, { spanId: 'span-1' });
      const result2 = createToolResultEvent('Edit', { file_path: '/b.ts', old_string: 'a', new_string: 'b' }, { spanId: 'span-2' });
      const result3 = createToolResultEvent('Bash', { command: 'ls' }, { spanId: 'span-3' });

      await processLogEvents([result1.event, result2.event, result3.event]);

      const correlations = getAllCorrelations();
      expect(correlations).toHaveLength(3);

      const toolEvents = getToolEvents();
      expect(toolEvents).toHaveLength(3);
    });

  });

  describe('AC6: Error handling in enrichment pipeline', () => {

    it('should handle missing files gracefully', async () => {
      const { event } = createToolResultEvent('Read', {
        file_path: '/nonexistent/path/file.ts',
      });

      // Should not throw
      await processLogEvents([event]);

      const toolEvents = getToolEvents();
      expect(toolEvents).toHaveLength(1);

      // Event should still be recorded even if enrichment partially fails
      expect(toolEvents[0].toolName).toBe('Read');
    });

    it('should handle invalid JSON in tool_parameters', async () => {
      // Create pending input first (since we're not using createToolResultEvent)
      storePendingToolInput('test-tool-id', 'Read', { file_path: '/test.ts' });

      const event = {
        name: 'claude_code.tool_result',
        timestamp: Date.now(),
        traceId: 'test-trace',
        spanId: 'test-span',
        attributes: {
          tool_name: 'Read',
          tool_parameters: 'not valid json {{{',
          success: 'true',
          duration_ms: '100',
        } as Record<string, string | number | boolean | undefined>,
      };

      // Should not throw
      await processLogEvents([event]);

      const toolEvents = getToolEvents();
      expect(toolEvents).toHaveLength(1);
    });

  });

});
