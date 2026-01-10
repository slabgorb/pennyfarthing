/**
 * Story 19-7: Telemetry Dashboard API Tests
 *
 * Tests for the dashboard API endpoints:
 * - GET /api/telemetry/session - Session tokens, costs, duration
 * - GET /api/telemetry/tools - Tool usage breakdown
 * - GET /api/telemetry/agents - Per-agent token stats
 * - GET /api/telemetry/stories - Per-story cost attribution
 *
 * These tests are written to FAIL initially (RED phase) and should pass
 * after Dev implements the endpoints.
 *
 * Acceptance Criteria:
 * 1. REST endpoints return structured JSON
 * 2. Session stats include tokens, costs, duration
 * 3. Tool breakdown shows frequency and timing
 * 4. Agent stats enable performance comparison
 * 5. Story costs enable budget tracking
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

// Import Express app
import { app } from '../src/server.js';

// Import functions for test setup
import {
  getSpanHierarchy,
  resetSpanHierarchy,
  addEventsToHierarchy,
} from '../src/span-hierarchy.js';
import {
  setAgentContext,
  resetAgentContext,
  aggregateTokensForAgent,
  getTokenStatsByAgent,
} from '../src/agent-context.js';
import {
  setStoryContext,
  resetStoryContext,
  aggregateTokensForStory,
  getTokenStatsByStory,
} from '../src/story-context.js';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a mock ToolEvent for testing
 */
function createMockToolEvent(toolName: string, durationMs: number, traceId = 'test-trace-1') {
  return {
    traceId,
    spanId: `span-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    toolName,
    timestamp: Date.now(),
    durationMs,
    input: `test input for ${toolName}`,
    output: `test output for ${toolName}`,
    success: true,
  };
}

// =============================================================================
// AC1: REST endpoints return structured JSON
// =============================================================================

describe('Story 19-7: Telemetry Dashboard API', () => {

  describe('GET /api/telemetry/session', () => {

    beforeEach(() => {
      resetSpanHierarchy();
      resetAgentContext();
      resetStoryContext();
    });

    afterEach(() => {
      resetSpanHierarchy();
      resetAgentContext();
      resetStoryContext();
    });

    it('should return 404 when no session data available', async () => {
      const response = await request(app).get('/api/telemetry/session');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'No session data available' });
    });

    it('should return 200 with session stats when data exists', async () => {
      // Add some tool events to create session data
      const toolEvents = [
        createMockToolEvent('Read', 100),
        createMockToolEvent('Write', 200),
      ];
      addEventsToHierarchy(toolEvents, []);

      const response = await request(app).get('/api/telemetry/session');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    // AC2: Session stats include tokens, costs, duration
    it('should include totalTokens in session response', async () => {
      const toolEvents = [createMockToolEvent('Read', 100)];
      addEventsToHierarchy(toolEvents, []);

      const response = await request(app).get('/api/telemetry/session');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalTokens');
      expect(response.body.totalTokens).toHaveProperty('input');
      expect(response.body.totalTokens).toHaveProperty('output');
      expect(response.body.totalTokens).toHaveProperty('cache_read');
    });

    it('should include totalCost in session response', async () => {
      const toolEvents = [createMockToolEvent('Read', 100)];
      addEventsToHierarchy(toolEvents, []);

      const response = await request(app).get('/api/telemetry/session');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalCost');
      expect(typeof response.body.totalCost).toBe('number');
    });

    it('should include duration in session response', async () => {
      const toolEvents = [createMockToolEvent('Read', 100)];
      addEventsToHierarchy(toolEvents, []);

      const response = await request(app).get('/api/telemetry/session');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('duration');
      expect(typeof response.body.duration).toBe('number');
    });

    it('should include spanCount in session response', async () => {
      const toolEvents = [
        createMockToolEvent('Read', 100),
        createMockToolEvent('Write', 200),
        createMockToolEvent('Bash', 500),
      ];
      addEventsToHierarchy(toolEvents, []);

      const response = await request(app).get('/api/telemetry/session');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('spanCount');
      expect(response.body.spanCount).toBeGreaterThanOrEqual(3);
    });

  });

  // ===========================================================================
  // AC3: Tool breakdown shows frequency and timing
  // ===========================================================================

  describe('GET /api/telemetry/tools', () => {

    beforeEach(() => {
      resetSpanHierarchy();
    });

    afterEach(() => {
      resetSpanHierarchy();
    });

    it('should return 404 when no tool data available', async () => {
      const response = await request(app).get('/api/telemetry/tools');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'No tool data available' });
    });

    it('should return 200 with tools breakdown when data exists', async () => {
      const toolEvents = [
        createMockToolEvent('Read', 100),
        createMockToolEvent('Write', 200),
      ];
      addEventsToHierarchy(toolEvents, []);

      const response = await request(app).get('/api/telemetry/tools');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('tools');
    });

    it('should show count per tool type', async () => {
      const toolEvents = [
        createMockToolEvent('Read', 100),
        createMockToolEvent('Read', 150),
        createMockToolEvent('Read', 120),
        createMockToolEvent('Write', 200),
      ];
      addEventsToHierarchy(toolEvents, []);

      const response = await request(app).get('/api/telemetry/tools');

      expect(response.status).toBe(200);
      expect(response.body.tools.Read).toBeDefined();
      expect(response.body.tools.Read.count).toBe(3);
      expect(response.body.tools.Write.count).toBe(1);
    });

    it('should show totalDuration per tool type', async () => {
      const toolEvents = [
        createMockToolEvent('Read', 100),
        createMockToolEvent('Read', 150),
        createMockToolEvent('Bash', 500),
      ];
      addEventsToHierarchy(toolEvents, []);

      const response = await request(app).get('/api/telemetry/tools');

      expect(response.status).toBe(200);
      expect(response.body.tools.Read.totalDuration).toBe(250);
      expect(response.body.tools.Bash.totalDuration).toBe(500);
    });

    it('should show avgDuration per tool type', async () => {
      const toolEvents = [
        createMockToolEvent('Read', 100),
        createMockToolEvent('Read', 200),
      ];
      addEventsToHierarchy(toolEvents, []);

      const response = await request(app).get('/api/telemetry/tools');

      expect(response.status).toBe(200);
      expect(response.body.tools.Read.avgDuration).toBe(150);
    });

  });

  // ===========================================================================
  // AC4: Agent stats enable performance comparison
  // ===========================================================================

  describe('GET /api/telemetry/agents', () => {

    beforeEach(() => {
      resetAgentContext();
    });

    afterEach(() => {
      resetAgentContext();
    });

    it('should return 404 when no agent data available', async () => {
      const response = await request(app).get('/api/telemetry/agents');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'No agent data available' });
    });

    it('should return 200 with agent stats when data exists', async () => {
      setAgentContext('sm');
      aggregateTokensForAgent({ inputTokens: 1000, outputTokens: 500 });

      const response = await request(app).get('/api/telemetry/agents');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should return per-agent token breakdown', async () => {
      setAgentContext('sm');
      aggregateTokensForAgent({ inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200 });

      setAgentContext('tea');
      aggregateTokensForAgent({ inputTokens: 2000, outputTokens: 800, cacheReadTokens: 400 });

      setAgentContext('dev');
      aggregateTokensForAgent({ inputTokens: 5000, outputTokens: 1500, cacheReadTokens: 1000 });

      const response = await request(app).get('/api/telemetry/agents');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sm');
      expect(response.body).toHaveProperty('tea');
      expect(response.body).toHaveProperty('dev');

      expect(response.body.sm.inputTokens).toBe(1000);
      expect(response.body.tea.inputTokens).toBe(2000);
      expect(response.body.dev.inputTokens).toBe(5000);
    });

    it('should include all token types for each agent', async () => {
      setAgentContext('reviewer');
      aggregateTokensForAgent({
        inputTokens: 3000,
        outputTokens: 1000,
        cacheReadTokens: 500,
        cacheCreationTokens: 100,
      });

      const response = await request(app).get('/api/telemetry/agents');

      expect(response.status).toBe(200);
      expect(response.body.reviewer).toMatchObject({
        inputTokens: 3000,
        outputTokens: 1000,
        cacheReadTokens: 500,
        cacheCreationTokens: 100,
      });
    });

  });

  // ===========================================================================
  // AC5: Story costs enable budget tracking
  // ===========================================================================

  describe('GET /api/telemetry/stories', () => {

    beforeEach(() => {
      resetStoryContext();
    });

    afterEach(() => {
      resetStoryContext();
    });

    it('should return 404 when no story data available', async () => {
      const response = await request(app).get('/api/telemetry/stories');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'No story data available' });
    });

    it('should return 200 with story stats when data exists', async () => {
      setStoryContext('19-7');
      aggregateTokensForStory({ inputTokens: 10000, outputTokens: 3000 });

      const response = await request(app).get('/api/telemetry/stories');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should return per-story token breakdown', async () => {
      setStoryContext('19-5');
      aggregateTokensForStory({ inputTokens: 5000, outputTokens: 1500 });

      setStoryContext('19-6');
      aggregateTokensForStory({ inputTokens: 8000, outputTokens: 2500 });

      setStoryContext('19-7');
      aggregateTokensForStory({ inputTokens: 12000, outputTokens: 4000 });

      const response = await request(app).get('/api/telemetry/stories');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('19-5');
      expect(response.body).toHaveProperty('19-6');
      expect(response.body).toHaveProperty('19-7');

      expect(response.body['19-5'].inputTokens).toBe(5000);
      expect(response.body['19-6'].inputTokens).toBe(8000);
      expect(response.body['19-7'].inputTokens).toBe(12000);
    });

    it('should include all token types for each story', async () => {
      setStoryContext('19-7');
      aggregateTokensForStory({
        inputTokens: 50000,
        outputTokens: 12000,
        cacheReadTokens: 8000,
        cacheCreationTokens: 2000,
      });

      const response = await request(app).get('/api/telemetry/stories');

      expect(response.status).toBe(200);
      expect(response.body['19-7']).toMatchObject({
        inputTokens: 50000,
        outputTokens: 12000,
        cacheReadTokens: 8000,
        cacheCreationTokens: 2000,
      });
    });

  });

  // ===========================================================================
  // Integration Tests
  // ===========================================================================

  describe('API Router Integration', () => {

    beforeEach(() => {
      resetSpanHierarchy();
      resetAgentContext();
      resetStoryContext();
    });

    afterEach(() => {
      resetSpanHierarchy();
      resetAgentContext();
      resetStoryContext();
    });

    it('should mount all telemetry routes at /api/telemetry', async () => {
      // All endpoints should exist (not return Express default 404)
      const endpoints = ['/session', '/tools', '/agents', '/stories'];

      for (const endpoint of endpoints) {
        const response = await request(app).get(`/api/telemetry${endpoint}`);
        // Should be our custom 404, not Express "Cannot GET"
        if (response.status === 404) {
          expect(response.body.error).toBeDefined();
        }
      }
    });

    it('should handle concurrent requests to different endpoints', async () => {
      // Set up data for all endpoints
      setAgentContext('sm');
      aggregateTokensForAgent({ inputTokens: 1000 });
      setStoryContext('19-7');
      aggregateTokensForStory({ inputTokens: 2000 });
      addEventsToHierarchy([createMockToolEvent('Read', 100)], []);

      const [session, tools, agents, stories] = await Promise.all([
        request(app).get('/api/telemetry/session'),
        request(app).get('/api/telemetry/tools'),
        request(app).get('/api/telemetry/agents'),
        request(app).get('/api/telemetry/stories'),
      ]);

      // All should succeed
      expect(session.status).toBe(200);
      expect(tools.status).toBe(200);
      expect(agents.status).toBe(200);
      expect(stories.status).toBe(200);
    });

    it('should reflect data changes between requests', async () => {
      // Initial request - no data
      const response1 = await request(app).get('/api/telemetry/agents');
      expect(response1.status).toBe(404);

      // Add data
      setAgentContext('tea');
      aggregateTokensForAgent({ inputTokens: 5000 });

      // Second request should show data
      const response2 = await request(app).get('/api/telemetry/agents');
      expect(response2.status).toBe(200);
      expect(response2.body.tea.inputTokens).toBe(5000);
    });

  });

});
