/**
 * Story 19-6: TDD Metrics API Tests
 *
 * Tests for the GET /api/telemetry/tdd endpoint that exposes
 * TDD cycle metrics.
 *
 * These tests are written to FAIL initially (RED phase) and should pass
 * after Dev implements the telemetry API router.
 *
 * Acceptance Criteria:
 * - AC4: TDD cycle metrics exposed via API
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

// Import Express app
import { app } from '../src/server.js';

// Import TDD metrics functions for setup/teardown
import {
  initializeTDDMetrics,
  recordPhaseTransition,
  resetTDDMetrics,
} from '../src/tdd-metrics.js';

// =============================================================================
// AC4: TDD cycle metrics exposed via API
// =============================================================================

describe('Story 19-6: TDD Metrics API', () => {

  describe('GET /api/telemetry/tdd', () => {

    beforeEach(() => {
      resetTDDMetrics();
    });

    afterEach(() => {
      resetTDDMetrics();
    });

    it('should return 404 when no TDD metrics available', async () => {
      const response = await request(app).get('/api/telemetry/tdd');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'No TDD metrics available' });
    });

    it('should return 200 with metrics when initialized', async () => {
      initializeTDDMetrics('19-6');
      recordPhaseTransition('RED', 1000);

      const response = await request(app).get('/api/telemetry/tdd');

      expect(response.status).toBe(200);
      expect(response.body.storyId).toBe('19-6');
    });

    it('should return JSON content type', async () => {
      initializeTDDMetrics('19-6');

      const response = await request(app).get('/api/telemetry/tdd');

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should return complete TDD metrics structure', async () => {
      initializeTDDMetrics('19-6');
      recordPhaseTransition('RED', 1000);
      recordPhaseTransition('GREEN', 11000);
      recordPhaseTransition('REVIEW', 31000);

      const response = await request(app).get('/api/telemetry/tdd');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        storyId: '19-6',
        phases: {
          redStart: 1000,
          greenStart: 11000,
          reviewStart: 31000,
        },
        redPhaseDurationMs: 10000,
        greenPhaseDurationMs: 20000,
      });
    });

    it('should return updated metrics after phase changes', async () => {
      initializeTDDMetrics('19-6');
      recordPhaseTransition('RED', 1000);

      // First request
      const response1 = await request(app).get('/api/telemetry/tdd');
      expect(response1.body.phases.redStart).toBe(1000);
      expect(response1.body.phases.greenStart).toBeUndefined();

      // Record more transitions
      recordPhaseTransition('GREEN', 11000);

      // Second request should show updated state
      const response2 = await request(app).get('/api/telemetry/tdd');
      expect(response2.body.phases.greenStart).toBe(11000);
      expect(response2.body.redPhaseDurationMs).toBe(10000);
    });

  });

  describe('API Router Integration', () => {

    beforeEach(() => {
      resetTDDMetrics();
    });

    it('should mount telemetry routes at /api/telemetry', async () => {
      initializeTDDMetrics('test-story');

      // The router should be mounted, even if returning 404
      const response = await request(app).get('/api/telemetry/tdd');

      // Should not be "Cannot GET" - route should exist
      expect(response.status).not.toBe(404);
      // OR if 404, should be our custom 404, not Express default
      if (response.status === 404) {
        expect(response.body.error).toBeDefined();
      }
    });

    it('should handle concurrent requests', async () => {
      initializeTDDMetrics('19-6');
      recordPhaseTransition('RED', 1000);

      // Fire multiple requests concurrently
      const [r1, r2, r3] = await Promise.all([
        request(app).get('/api/telemetry/tdd'),
        request(app).get('/api/telemetry/tdd'),
        request(app).get('/api/telemetry/tdd'),
      ]);

      // All should succeed with same data
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r3.status).toBe(200);
      expect(r1.body.storyId).toBe(r2.body.storyId);
      expect(r2.body.storyId).toBe(r3.body.storyId);
    });

  });

});
