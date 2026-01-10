/**
 * Story 19-9: Agent Evaluation API Tests
 *
 * Tests for the REST API endpoints that expose agent evaluation data.
 * Follows the pattern established in 19-6-tdd-api.test.ts.
 *
 * These tests are written to FAIL initially (RED phase) and should pass
 * after Dev implements the evaluation API router.
 *
 * Acceptance Criteria:
 * - AC7: API endpoint for evaluation data retrieval
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

// Import Express app
import { app } from '../src/server.js';

// Import evaluation functions for setup/teardown
import {
  createEvaluation,
  resetEvaluation,
  storeEvaluation,
} from '../src/agent-evaluation.js';

import type { AgentSpan } from '../src/telemetry-types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/** Create a mock AgentSpan for testing */
function createMockAgentSpan(overrides: Partial<AgentSpan> = {}): AgentSpan {
  return {
    traceId: 'trace-123',
    spanId: 'span-456',
    name: 'claude.agent.run',
    startTime: 1000,
    endTime: 11000,
    attributes: {
      'gen_ai.system': 'claude',
      'gen_ai.request.model': 'claude-sonnet-4-20250514',
      'gen_ai.usage.input_tokens': 1000,
      'gen_ai.usage.output_tokens': 500,
      'pennyfarthing.agent': 'dev',
      'pennyfarthing.story_id': '19-9',
      'pennyfarthing.theme': 'shakespeare',
    },
    events: [],
    childSpans: [],
    status: 'completed',
    ...overrides,
  };
}

/** Create spans for multiple agents */
function createMultiAgentSpans(): AgentSpan[] {
  return [
    createMockAgentSpan({
      spanId: 'sm-1',
      attributes: {
        'gen_ai.system': 'claude',
        'gen_ai.request.model': 'claude-sonnet-4',
        'gen_ai.usage.input_tokens': 500,
        'gen_ai.usage.output_tokens': 200,
        'pennyfarthing.agent': 'sm',
        'pennyfarthing.theme': 'shakespeare',
      },
    }),
    createMockAgentSpan({
      spanId: 'tea-1',
      attributes: {
        'gen_ai.system': 'claude',
        'gen_ai.request.model': 'claude-sonnet-4',
        'gen_ai.usage.input_tokens': 2000,
        'gen_ai.usage.output_tokens': 1500,
        'pennyfarthing.agent': 'tea',
        'pennyfarthing.theme': 'shakespeare',
      },
    }),
    createMockAgentSpan({
      spanId: 'dev-1',
      attributes: {
        'gen_ai.system': 'claude',
        'gen_ai.request.model': 'claude-sonnet-4',
        'gen_ai.usage.input_tokens': 5000,
        'gen_ai.usage.output_tokens': 3000,
        'pennyfarthing.agent': 'dev',
        'pennyfarthing.theme': 'shakespeare',
      },
    }),
    createMockAgentSpan({
      spanId: 'reviewer-1',
      attributes: {
        'gen_ai.system': 'claude',
        'gen_ai.request.model': 'claude-sonnet-4',
        'gen_ai.usage.input_tokens': 1000,
        'gen_ai.usage.output_tokens': 400,
        'pennyfarthing.agent': 'reviewer',
        'pennyfarthing.theme': 'shakespeare',
      },
    }),
  ];
}

// =============================================================================
// AC7: API endpoint for evaluation data retrieval
// =============================================================================

describe('Story 19-9: Evaluation API', () => {

  describe('GET /api/evaluation/agents', () => {

    beforeEach(() => {
      resetEvaluation();
    });

    afterEach(() => {
      resetEvaluation();
    });

    it('should return 404 when no evaluation available', async () => {
      const response = await request(app).get('/api/evaluation/agents');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'No evaluation data available' });
    });

    it('should return 200 with agent metrics when evaluation exists', async () => {
      const spans = createMultiAgentSpans();
      createEvaluation(spans);

      const response = await request(app).get('/api/evaluation/agents');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sm');
      expect(response.body).toHaveProperty('tea');
      expect(response.body).toHaveProperty('dev');
      expect(response.body).toHaveProperty('reviewer');
    });

    it('should return JSON content type', async () => {
      const spans = createMultiAgentSpans();
      createEvaluation(spans);

      const response = await request(app).get('/api/evaluation/agents');

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should include all metric fields in response', async () => {
      const spans = createMultiAgentSpans();
      createEvaluation(spans);

      const response = await request(app).get('/api/evaluation/agents');

      expect(response.status).toBe(200);
      const devMetrics = response.body.dev;
      expect(devMetrics).toHaveProperty('agentRole');
      expect(devMetrics).toHaveProperty('taskCompletionRate');
      expect(devMetrics).toHaveProperty('averageTokens');
      expect(devMetrics).toHaveProperty('averageTimeMs');
      expect(devMetrics).toHaveProperty('toolEfficiency');
      expect(devMetrics).toHaveProperty('errorRate');
      expect(devMetrics).toHaveProperty('qualitySignals');
    });

  });

  describe('GET /api/evaluation/agents/:role', () => {

    beforeEach(() => {
      resetEvaluation();
    });

    afterEach(() => {
      resetEvaluation();
    });

    it('should return 404 when no evaluation available', async () => {
      const response = await request(app).get('/api/evaluation/agents/dev');

      expect(response.status).toBe(404);
    });

    it('should return 404 for unknown agent role', async () => {
      const spans = createMultiAgentSpans();
      createEvaluation(spans);

      const response = await request(app).get('/api/evaluation/agents/unknown');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Agent not found: unknown' });
    });

    it('should return 200 with specific agent metrics', async () => {
      const spans = createMultiAgentSpans();
      createEvaluation(spans);

      const response = await request(app).get('/api/evaluation/agents/dev');

      expect(response.status).toBe(200);
      expect(response.body.agentRole).toBe('dev');
      expect(response.body.averageTokens).toBe(8000); // 5000 + 3000
    });

    it('should handle case-insensitive agent role', async () => {
      const spans = createMultiAgentSpans();
      createEvaluation(spans);

      const response = await request(app).get('/api/evaluation/agents/DEV');

      expect(response.status).toBe(200);
      expect(response.body.agentRole).toBe('dev');
    });

  });

  describe('GET /api/evaluation/personas', () => {

    beforeEach(() => {
      resetEvaluation();
    });

    afterEach(() => {
      resetEvaluation();
    });

    it('should return 404 when no evaluation available', async () => {
      const response = await request(app).get('/api/evaluation/personas');

      expect(response.status).toBe(404);
    });

    it('should return 200 with persona metrics', async () => {
      const spans = createMultiAgentSpans();
      createEvaluation(spans);

      const response = await request(app).get('/api/evaluation/personas');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('shakespeare');
    });

    it('should include theme and persona fields', async () => {
      const spans = createMultiAgentSpans();
      createEvaluation(spans);

      const response = await request(app).get('/api/evaluation/personas');

      expect(response.status).toBe(200);
      const shakespeareMetrics = response.body.shakespeare;
      expect(shakespeareMetrics).toHaveProperty('theme', 'shakespeare');
    });

  });

  describe('GET /api/evaluation/tasks', () => {

    beforeEach(() => {
      resetEvaluation();
    });

    afterEach(() => {
      resetEvaluation();
    });

    it('should return 404 when no evaluation available', async () => {
      const response = await request(app).get('/api/evaluation/tasks');

      expect(response.status).toBe(404);
    });

    it('should return 200 with task type metrics', async () => {
      const spans = createMultiAgentSpans();
      createEvaluation(spans);

      const response = await request(app).get('/api/evaluation/tasks');

      expect(response.status).toBe(200);
      expect(typeof response.body).toBe('object');
    });

  });

  describe('GET /api/evaluation/regression', () => {

    beforeEach(() => {
      resetEvaluation();
    });

    afterEach(() => {
      resetEvaluation();
    });

    it('should return 404 when no evaluation available', async () => {
      const response = await request(app).get('/api/evaluation/regression');

      expect(response.status).toBe(404);
    });

    it('should return 200 with regression alerts', async () => {
      const spans = createMultiAgentSpans();
      const evaluation = createEvaluation(spans);
      storeEvaluation(evaluation);

      const response = await request(app).get('/api/evaluation/regression');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.alerts)).toBe(true);
    });

    it('should include trend information', async () => {
      const spans = createMultiAgentSpans();
      const evaluation = createEvaluation(spans);
      storeEvaluation(evaluation);

      const response = await request(app).get('/api/evaluation/regression');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('trends');
    });

  });

  describe('GET /api/evaluation/recommendations', () => {

    beforeEach(() => {
      resetEvaluation();
    });

    afterEach(() => {
      resetEvaluation();
    });

    it('should return 404 when no evaluation available', async () => {
      const response = await request(app).get('/api/evaluation/recommendations');

      expect(response.status).toBe(404);
    });

    it('should return 200 with recommendations array', async () => {
      const spans = createMultiAgentSpans();
      createEvaluation(spans);

      const response = await request(app).get('/api/evaluation/recommendations');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

  });

  describe('API Router Integration', () => {

    beforeEach(() => {
      resetEvaluation();
    });

    afterEach(() => {
      resetEvaluation();
    });

    it('should mount evaluation routes at /api/evaluation', async () => {
      const spans = createMultiAgentSpans();
      createEvaluation(spans);

      const response = await request(app).get('/api/evaluation/agents');

      // Should not be Express default 404
      expect(response.status).not.toBe(404);
      // OR if 404, should be our custom 404
      if (response.status === 404) {
        expect(response.body.error).toBeDefined();
      }
    });

    it('should handle concurrent requests', async () => {
      const spans = createMultiAgentSpans();
      createEvaluation(spans);

      const [r1, r2, r3] = await Promise.all([
        request(app).get('/api/evaluation/agents'),
        request(app).get('/api/evaluation/personas'),
        request(app).get('/api/evaluation/tasks'),
      ]);

      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r3.status).toBe(200);
    });

    it('should return consistent data across endpoints', async () => {
      const spans = createMultiAgentSpans();
      createEvaluation(spans);

      const agentsResponse = await request(app).get('/api/evaluation/agents');
      const devResponse = await request(app).get('/api/evaluation/agents/dev');

      expect(agentsResponse.body.dev.averageTokens).toBe(devResponse.body.averageTokens);
    });

  });

  describe('Error Handling', () => {

    beforeEach(() => {
      resetEvaluation();
    });

    it('should return 404 for non-existent routes', async () => {
      const response = await request(app).get('/api/evaluation/nonexistent');

      expect(response.status).toBe(404);
    });

    it('should handle POST to GET-only endpoints', async () => {
      const response = await request(app).post('/api/evaluation/agents');

      // Should return 405 Method Not Allowed or 404
      expect([404, 405]).toContain(response.status);
    });

  });

});
