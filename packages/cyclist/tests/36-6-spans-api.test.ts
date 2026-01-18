/**
 * Story MSSCI-11734: Spans API Endpoint Tests
 *
 * Tests for the /api/spans endpoint that serves enriched span data.
 * Supports AC1 (exporter), AC3 (filters), and AC4 (JSON export).
 *
 * These tests are written to FAIL initially (RED phase) and should pass
 * after Dev implements the API endpoint.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';

// Router that doesn't exist yet - will fail until Dev implements
import { createSpansRouter } from '../src/api/spans.js';

// Import functions to inject mock data into the OTEL receiver
import { recordToolEvent, resetEventStore } from '../src/otlp-receiver.js';

// =============================================================================
// Test Setup
// =============================================================================

/**
 * Inject mock tool events for API tests
 */
function injectMockToolEvents(): void {
  // Inject mock Bash event (success)
  recordToolEvent({
    toolName: 'Bash',
    input: 'npm test',
    output: '> test\nPASS src/test.ts\nTests: 5 passed',
    durationMs: 5000,
    success: true,
    timestamp: Date.now() - 60000, // 1 minute ago
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
    timestamp: Date.now() - 50000,
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
    input: 'Find all test files',
    output: 'Found 15 test files...',
    durationMs: 70000,
    success: true,
    timestamp: Date.now() - 40000,
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
    timestamp: Date.now() - 30000,
    traceId: 'trace-002',
    spanId: 'span-bash-002',
  });
  // Inject mock Grep event
  recordToolEvent({
    toolName: 'Grep',
    input: 'export function',
    output: 'file1.ts:10\nfile2.ts:20\nfile3.ts:30',
    durationMs: 100,
    success: true,
    timestamp: Date.now() - 20000,
    traceId: 'trace-001',
    spanId: 'span-grep-001',
    matchCount: 42,
    fileCount: 8,
    truncated: false,
  } as Parameters<typeof recordToolEvent>[0]);
}

describe('MSSCI-11734: /api/spans endpoint', () => {
  let app: Express;

  beforeEach(() => {
    resetEventStore();
    injectMockToolEvents();
    app = express();
    app.use(express.json());
    app.use('/api/spans', createSpansRouter());
  });

  afterEach(() => {
    resetEventStore();
  });

  // =============================================================================
  // GET /api/spans - List all enriched spans
  // =============================================================================

  describe('GET /api/spans', () => {
    it('should return 200 with array of enriched spans', async () => {
      const response = await request(app).get('/api/spans');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.spans)).toBe(true);
    });

    it('should include enrichment data in each span', async () => {
      const response = await request(app).get('/api/spans');

      if (response.body.spans.length > 0) {
        const span = response.body.spans[0];
        expect(span).toHaveProperty('spanId');
        expect(span).toHaveProperty('toolName');
        expect(span).toHaveProperty('enrichment');
      }
    });

    it('should return 404 when no spans available', async () => {
      // Clear the event store to simulate no spans
      resetEventStore();

      const response = await request(app).get('/api/spans');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('should include pagination metadata', async () => {
      const response = await request(app).get('/api/spans');

      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('offset');
      expect(response.body).toHaveProperty('limit');
    });
  });

  // =============================================================================
  // GET /api/spans with filters (AC3)
  // =============================================================================

  describe('GET /api/spans with filters', () => {
    describe('Tool type filter', () => {
      it('should filter by single tool type', async () => {
        const response = await request(app)
          .get('/api/spans')
          .query({ toolType: 'Bash' });

        expect(response.status).toBe(200);
        expect(
          response.body.spans.every((s: { toolName: string }) => s.toolName === 'Bash')
        ).toBe(true);
      });

      it('should filter by multiple tool types', async () => {
        const response = await request(app)
          .get('/api/spans')
          .query({ toolType: 'Read,Bash' });

        expect(response.status).toBe(200);
        expect(
          response.body.spans.every(
            (s: { toolName: string }) => s.toolName === 'Read' || s.toolName === 'Bash'
          )
        ).toBe(true);
      });
    });

    describe('Status filter', () => {
      it('should filter by success status', async () => {
        const response = await request(app)
          .get('/api/spans')
          .query({ status: 'success' });

        expect(response.status).toBe(200);
        expect(
          response.body.spans.every((s: { success: boolean }) => s.success === true)
        ).toBe(true);
      });

      it('should filter by error status', async () => {
        const response = await request(app)
          .get('/api/spans')
          .query({ status: 'error' });

        expect(response.status).toBe(200);
        expect(
          response.body.spans.every((s: { status: string }) => s.status === 'error')
        ).toBe(true);
      });
    });

    describe('Time range filter', () => {
      it('should filter by start time', async () => {
        const startTime = Date.now() - 3600000; // 1 hour ago
        const response = await request(app)
          .get('/api/spans')
          .query({ startTime });

        expect(response.status).toBe(200);
        expect(
          response.body.spans.every(
            (s: { startTime: number }) => s.startTime >= startTime
          )
        ).toBe(true);
      });

      it('should filter by end time', async () => {
        const endTime = Date.now();
        const response = await request(app)
          .get('/api/spans')
          .query({ endTime });

        expect(response.status).toBe(200);
        expect(
          response.body.spans.every(
            (s: { startTime: number }) => s.startTime <= endTime
          )
        ).toBe(true);
      });

      it('should filter by time range', async () => {
        const startTime = Date.now() - 7200000; // 2 hours ago
        const endTime = Date.now() - 3600000; // 1 hour ago

        const response = await request(app)
          .get('/api/spans')
          .query({ startTime, endTime });

        expect(response.status).toBe(200);
        expect(
          response.body.spans.every(
            (s: { startTime: number }) =>
              s.startTime >= startTime && s.startTime <= endTime
          )
        ).toBe(true);
      });
    });

    describe('Combined filters', () => {
      it('should apply multiple filters together', async () => {
        const response = await request(app)
          .get('/api/spans')
          .query({ toolType: 'Bash', status: 'success' });

        expect(response.status).toBe(200);
        expect(
          response.body.spans.every(
            (s: { toolName: string; success: boolean }) =>
              s.toolName === 'Bash' && s.success === true
          )
        ).toBe(true);
      });
    });

    describe('Pagination', () => {
      it('should respect limit parameter', async () => {
        const response = await request(app)
          .get('/api/spans')
          .query({ limit: 5 });

        expect(response.status).toBe(200);
        expect(response.body.spans.length).toBeLessThanOrEqual(5);
        expect(response.body.limit).toBe(5);
      });

      it('should respect offset parameter', async () => {
        const response = await request(app)
          .get('/api/spans')
          .query({ offset: 10 });

        expect(response.status).toBe(200);
        expect(response.body.offset).toBe(10);
      });

      it('should have sensible defaults', async () => {
        const response = await request(app).get('/api/spans');

        expect(response.body.offset).toBe(0);
        expect(response.body.limit).toBeLessThanOrEqual(100);
      });
    });
  });

  // =============================================================================
  // GET /api/spans/:spanId - Get single span details
  // =============================================================================

  describe('GET /api/spans/:spanId', () => {
    it('should return single span with full enrichment', async () => {
      // First get a span ID
      const listResponse = await request(app).get('/api/spans');
      if (listResponse.body.spans.length === 0) {
        return; // Skip if no spans
      }

      const spanId = listResponse.body.spans[0].spanId;
      const response = await request(app).get(`/api/spans/${spanId}`);

      expect(response.status).toBe(200);
      expect(response.body.spanId).toBe(spanId);
      expect(response.body).toHaveProperty('enrichment');
    });

    it('should return 404 for non-existent span', async () => {
      const response = await request(app).get('/api/spans/nonexistent-span-id');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  // =============================================================================
  // GET /api/spans/export - Export enriched spans (AC4)
  // =============================================================================

  describe('GET /api/spans/export', () => {
    it('should return complete export with metadata', async () => {
      const response = await request(app).get('/api/spans/export');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('exportedAt');
      expect(response.body).toHaveProperty('spanCount');
      expect(response.body).toHaveProperty('spans');
      expect(response.body).toHaveProperty('metadata');
    });

    it('should include version in metadata', async () => {
      const response = await request(app).get('/api/spans/export');

      expect(response.body.metadata).toHaveProperty('version');
      expect(response.body.metadata).toHaveProperty('exportFormat');
    });

    it('should include summary statistics', async () => {
      const response = await request(app).get('/api/spans/export');

      expect(response.body).toHaveProperty('summary');
      expect(response.body.summary).toHaveProperty('totalDurationMs');
      expect(response.body.summary).toHaveProperty('successCount');
      expect(response.body.summary).toHaveProperty('errorCount');
      expect(response.body.summary).toHaveProperty('toolBreakdown');
    });

    it('should apply filters to export', async () => {
      const response = await request(app)
        .get('/api/spans/export')
        .query({ toolType: 'Bash' });

      expect(response.status).toBe(200);
      expect(
        response.body.spans.every((s: { toolName: string }) => s.toolName === 'Bash')
      ).toBe(true);
    });

    it('should set Content-Disposition for download', async () => {
      const response = await request(app)
        .get('/api/spans/export')
        .query({ download: 'true' });

      expect(response.headers['content-disposition']).toMatch(/attachment/);
      expect(response.headers['content-disposition']).toMatch(/\.json/);
    });

    it('should include ISO timestamps in exported spans', async () => {
      const response = await request(app).get('/api/spans/export');

      if (response.body.spans.length > 0) {
        const span = response.body.spans[0];
        expect(span).toHaveProperty('startTimeISO');
        expect(span.startTimeISO).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });
  });

  // =============================================================================
  // GET /api/spans/summary - Span statistics
  // =============================================================================

  describe('GET /api/spans/summary', () => {
    it('should return summary statistics', async () => {
      const response = await request(app).get('/api/spans/summary');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalSpans');
      expect(response.body).toHaveProperty('successCount');
      expect(response.body).toHaveProperty('errorCount');
      expect(response.body).toHaveProperty('totalDurationMs');
    });

    it('should include tool type breakdown', async () => {
      const response = await request(app).get('/api/spans/summary');

      expect(response.body).toHaveProperty('byToolType');
      expect(typeof response.body.byToolType).toBe('object');
    });

    it('should include time range', async () => {
      const response = await request(app).get('/api/spans/summary');

      expect(response.body).toHaveProperty('timeRange');
      expect(response.body.timeRange).toHaveProperty('earliest');
      expect(response.body.timeRange).toHaveProperty('latest');
    });
  });

  // =============================================================================
  // Error handling
  // =============================================================================

  describe('Error handling', () => {
    it('should return 400 for invalid filter values', async () => {
      const response = await request(app)
        .get('/api/spans')
        .query({ status: 'invalid-status' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for invalid time range', async () => {
      const response = await request(app)
        .get('/api/spans')
        .query({ startTime: 'not-a-number' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for negative pagination values', async () => {
      const response = await request(app)
        .get('/api/spans')
        .query({ offset: -1 });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });
});
