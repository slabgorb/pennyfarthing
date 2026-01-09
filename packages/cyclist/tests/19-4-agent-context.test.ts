/**
 * Story 19-4: Agent Context Telemetry Tests
 *
 * Tests for tracking which Pennyfarthing agent (SM, TEA, Dev, Reviewer)
 * is active and including that context in telemetry spans.
 *
 * These tests are written to FAIL initially (RED phase) and should pass
 * after Dev implements the agent context functionality.
 *
 * Acceptance Criteria:
 * 1. Agent activation sets PENNYFARTHING_AGENT env var
 * 2. Cyclist reads agent from environment or session
 * 3. All telemetry spans include agent attribute
 * 4. Per-agent token aggregation in getTokenStats()
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Types from telemetry-types.ts
import type { AgentSpan, AgentSpanAttributes } from '../src/telemetry-types.js';

// Types from otlp-receiver.ts
import type { ToolEvent, ParsedPromptEvent, TokenStats } from '../src/otlp-receiver.js';

// Existing functions from span-hierarchy.ts
import {
  buildSpanHierarchy,
  addEventsToHierarchy,
  getSpanHierarchy,
  resetSpanHierarchy,
} from '../src/span-hierarchy.js';

// Existing functions from otlp-receiver.ts
import {
  getTokenStats,
  resetTokenStats,
  aggregateTokenStats,
} from '../src/otlp-receiver.js';

// NEW functions that need to be implemented for this story
import {
  setAgentContext,
  getAgentContext,
  resetAgentContext,
  getTokenStatsByAgent,
} from '../src/agent-context.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const toolEventSM: ToolEvent = {
  toolName: 'Read',
  input: '/path/to/session.md',
  output: 'session contents',
  durationMs: 25,
  success: true,
  timestamp: 1704844800000,
  traceId: 'trace-sm',
  spanId: 'span-sm-1',
};

const toolEventTEA: ToolEvent = {
  toolName: 'Write',
  input: '/path/to/test.ts',
  output: 'test file created',
  durationMs: 50,
  success: true,
  timestamp: 1704844900000,
  traceId: 'trace-tea',
  spanId: 'span-tea-1',
};

const toolEventDev: ToolEvent = {
  toolName: 'Bash',
  input: 'npm test',
  output: 'Tests passed',
  durationMs: 3000,
  success: true,
  timestamp: 1704845000000,
  traceId: 'trace-dev',
  spanId: 'span-dev-1',
};

const toolEventReviewer: ToolEvent = {
  toolName: 'Grep',
  input: 'TODO',
  output: 'No TODOs found',
  durationMs: 15,
  success: true,
  timestamp: 1704845100000,
  traceId: 'trace-reviewer',
  spanId: 'span-reviewer-1',
};

const promptEventSM: ParsedPromptEvent = {
  promptText: 'Set up story 19-4',
  tokens: 20,
  timestamp: 1704844799000,
  traceId: 'trace-sm',
  spanId: 'prompt-sm-1',
};

// =============================================================================
// AC1: Agent activation sets PENNYFARTHING_AGENT env var
// =============================================================================

describe('Story 19-4: Agent Context Telemetry', () => {

  describe('AC1: Agent activation sets PENNYFARTHING_AGENT env var', () => {

    // Note: This AC is primarily about the shell script (agent-session.sh)
    // exporting the env var. These tests verify the TypeScript side can read it.

    afterEach(() => {
      // Clean up env var after each test
      delete process.env.PENNYFARTHING_AGENT;
      resetAgentContext();
    });

    it('should read PENNYFARTHING_AGENT from environment', () => {
      process.env.PENNYFARTHING_AGENT = 'sm';

      // setAgentContext should pick up from env if not explicitly set
      setAgentContext(); // No argument = read from env

      expect(getAgentContext()).toBe('sm');
    });

    it('should support all valid agent types', () => {
      const validAgents = ['sm', 'tea', 'dev', 'reviewer'];

      for (const agent of validAgents) {
        process.env.PENNYFARTHING_AGENT = agent;
        setAgentContext();
        expect(getAgentContext()).toBe(agent);
        resetAgentContext();
      }
    });

    it('should return undefined when no agent is set', () => {
      delete process.env.PENNYFARTHING_AGENT;
      resetAgentContext();

      expect(getAgentContext()).toBeUndefined();
    });

    it('should allow explicit agent override via setAgentContext', () => {
      process.env.PENNYFARTHING_AGENT = 'sm';
      setAgentContext('tea'); // Explicit override

      expect(getAgentContext()).toBe('tea');
    });

  });

  // =============================================================================
  // AC2: Cyclist reads agent from environment or session
  // =============================================================================

  describe('AC2: Cyclist reads agent from environment or session', () => {

    beforeEach(() => {
      resetSpanHierarchy();
      resetAgentContext();
      delete process.env.PENNYFARTHING_AGENT;
    });

    afterEach(() => {
      delete process.env.PENNYFARTHING_AGENT;
    });

    it('should store agent context in session state', () => {
      setAgentContext('dev');

      expect(getAgentContext()).toBe('dev');
    });

    it('should persist agent context across multiple calls', () => {
      setAgentContext('reviewer');

      // Multiple reads should return same value
      expect(getAgentContext()).toBe('reviewer');
      expect(getAgentContext()).toBe('reviewer');
    });

    it('should reset agent context when session resets', () => {
      setAgentContext('tea');
      expect(getAgentContext()).toBe('tea');

      resetAgentContext();
      expect(getAgentContext()).toBeUndefined();
    });

    it('should allow changing agent mid-session', () => {
      setAgentContext('sm');
      expect(getAgentContext()).toBe('sm');

      setAgentContext('tea');
      expect(getAgentContext()).toBe('tea');
    });

  });

  // =============================================================================
  // AC3: All telemetry spans include agent attribute
  // =============================================================================

  describe('AC3: All telemetry spans include agent attribute', () => {

    beforeEach(() => {
      resetSpanHierarchy();
      resetAgentContext();
    });

    afterEach(() => {
      delete process.env.PENNYFARTHING_AGENT;
    });

    it('should include pennyfarthing.agent in AgentSpan attributes', () => {
      setAgentContext('sm');
      addEventsToHierarchy([toolEventSM], [promptEventSM]);

      const hierarchy = getSpanHierarchy();
      expect(hierarchy).toHaveLength(1);

      const span = hierarchy[0];
      expect(span.attributes['pennyfarthing.agent']).toBe('sm');
    });

    it('should tag spans with current agent at time of creation', () => {
      // Create span while SM is active
      setAgentContext('sm');
      addEventsToHierarchy([toolEventSM], []);

      // Switch to TEA
      setAgentContext('tea');
      addEventsToHierarchy([toolEventTEA], []);

      const hierarchy = getSpanHierarchy();
      expect(hierarchy).toHaveLength(2);

      // Each span should have the agent that was active when it was created
      const smSpan = hierarchy.find(s => s.traceId === 'trace-sm');
      const teaSpan = hierarchy.find(s => s.traceId === 'trace-tea');

      expect(smSpan?.attributes['pennyfarthing.agent']).toBe('sm');
      expect(teaSpan?.attributes['pennyfarthing.agent']).toBe('tea');
    });

    it('should leave agent attribute undefined when no agent is set', () => {
      // No agent context set
      addEventsToHierarchy([toolEventSM], []);

      const hierarchy = getSpanHierarchy();
      const span = hierarchy[0];

      expect(span.attributes['pennyfarthing.agent']).toBeUndefined();
    });

    it('should include agent in buildSpanHierarchy (pure function)', () => {
      setAgentContext('dev');

      const spans = buildSpanHierarchy([toolEventDev], []);

      expect(spans).toHaveLength(1);
      expect(spans[0].attributes['pennyfarthing.agent']).toBe('dev');
    });

    it('should tag all spans in multi-agent workflow', () => {
      // SM sets up story
      setAgentContext('sm');
      addEventsToHierarchy([toolEventSM], [promptEventSM]);

      // TEA writes tests
      setAgentContext('tea');
      addEventsToHierarchy([toolEventTEA], []);

      // Dev implements
      setAgentContext('dev');
      addEventsToHierarchy([toolEventDev], []);

      // Reviewer checks
      setAgentContext('reviewer');
      addEventsToHierarchy([toolEventReviewer], []);

      const hierarchy = getSpanHierarchy();
      expect(hierarchy).toHaveLength(4);

      // Verify each span has correct agent
      const agents = hierarchy.map(s => ({
        traceId: s.traceId,
        agent: s.attributes['pennyfarthing.agent'],
      }));

      expect(agents).toContainEqual({ traceId: 'trace-sm', agent: 'sm' });
      expect(agents).toContainEqual({ traceId: 'trace-tea', agent: 'tea' });
      expect(agents).toContainEqual({ traceId: 'trace-dev', agent: 'dev' });
      expect(agents).toContainEqual({ traceId: 'trace-reviewer', agent: 'reviewer' });
    });

  });

  // =============================================================================
  // AC4: Per-agent token aggregation in getTokenStats()
  // =============================================================================

  describe('AC4: Per-agent token aggregation', () => {

    beforeEach(() => {
      resetTokenStats();
      resetAgentContext();
    });

    afterEach(() => {
      delete process.env.PENNYFARTHING_AGENT;
    });

    it('should return empty object when no tokens tracked', () => {
      const byAgent = getTokenStatsByAgent();

      expect(byAgent).toEqual({});
    });

    it('should aggregate tokens by agent', () => {
      // SM uses some tokens
      setAgentContext('sm');
      aggregateTokenStats({ inputTokens: 100, outputTokens: 50 });

      // TEA uses more tokens
      setAgentContext('tea');
      aggregateTokenStats({ inputTokens: 200, outputTokens: 100 });

      const byAgent = getTokenStatsByAgent();

      expect(byAgent['sm']).toBeDefined();
      expect(byAgent['sm'].inputTokens).toBe(100);
      expect(byAgent['sm'].outputTokens).toBe(50);

      expect(byAgent['tea']).toBeDefined();
      expect(byAgent['tea'].inputTokens).toBe(200);
      expect(byAgent['tea'].outputTokens).toBe(100);
    });

    it('should accumulate tokens for same agent across multiple aggregations', () => {
      setAgentContext('dev');

      aggregateTokenStats({ inputTokens: 500, outputTokens: 200 });
      aggregateTokenStats({ inputTokens: 300, outputTokens: 150 });

      const byAgent = getTokenStatsByAgent();

      expect(byAgent['dev'].inputTokens).toBe(800);
      expect(byAgent['dev'].outputTokens).toBe(350);
    });

    it('should track cache tokens by agent', () => {
      setAgentContext('reviewer');
      aggregateTokenStats({
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 500,
        cacheCreationTokens: 200,
      });

      const byAgent = getTokenStatsByAgent();

      expect(byAgent['reviewer'].cacheReadTokens).toBe(500);
      expect(byAgent['reviewer'].cacheCreationTokens).toBe(200);
    });

    it('should handle tokens with no agent set', () => {
      // No agent context
      aggregateTokenStats({ inputTokens: 100, outputTokens: 50 });

      const byAgent = getTokenStatsByAgent();

      // Should have an 'unknown' or similar bucket
      expect(byAgent['unknown']).toBeDefined();
      expect(byAgent['unknown'].inputTokens).toBe(100);
    });

    it('should reset per-agent stats when resetTokenStats is called', () => {
      setAgentContext('sm');
      aggregateTokenStats({ inputTokens: 100 });

      expect(getTokenStatsByAgent()['sm']).toBeDefined();

      resetTokenStats();
      resetAgentContext();

      expect(getTokenStatsByAgent()).toEqual({});
    });

    it('should track all four agents in typical TDD workflow', () => {
      // SM: Story setup
      setAgentContext('sm');
      aggregateTokenStats({ inputTokens: 500, outputTokens: 100 });

      // TEA: Write tests
      setAgentContext('tea');
      aggregateTokenStats({ inputTokens: 1000, outputTokens: 500 });

      // Dev: Implement
      setAgentContext('dev');
      aggregateTokenStats({ inputTokens: 3000, outputTokens: 1500 });

      // Reviewer: Code review
      setAgentContext('reviewer');
      aggregateTokenStats({ inputTokens: 800, outputTokens: 200 });

      const byAgent = getTokenStatsByAgent();

      expect(Object.keys(byAgent).sort()).toEqual(['dev', 'reviewer', 'sm', 'tea']);

      // Dev should have highest usage
      expect(byAgent['dev'].inputTokens).toBeGreaterThan(byAgent['sm'].inputTokens);
      expect(byAgent['dev'].inputTokens).toBeGreaterThan(byAgent['tea'].inputTokens);
    });

  });

  // =============================================================================
  // Type Conformance
  // =============================================================================

  describe('Type Conformance', () => {

    beforeEach(() => {
      resetSpanHierarchy();
      resetAgentContext();
    });

    it('AgentSpan.attributes should conform to AgentSpanAttributes type', () => {
      setAgentContext('dev');
      addEventsToHierarchy([toolEventDev], []);

      const hierarchy = getSpanHierarchy();
      const attrs: AgentSpanAttributes = hierarchy[0].attributes;

      // Required field
      expect(attrs['gen_ai.system']).toBe('claude');

      // Optional Pennyfarthing extension (this story adds it)
      expect(attrs['pennyfarthing.agent']).toBe('dev');
    });

    it('getAgentContext should return valid agent type or undefined', () => {
      const result = getAgentContext();

      // Should be undefined, 'sm', 'tea', 'dev', or 'reviewer'
      expect(
        result === undefined ||
        result === 'sm' ||
        result === 'tea' ||
        result === 'dev' ||
        result === 'reviewer'
      ).toBe(true);
    });

  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {

    beforeEach(() => {
      resetSpanHierarchy();
      resetAgentContext();
      resetTokenStats();
    });

    afterEach(() => {
      delete process.env.PENNYFARTHING_AGENT;
    });

    it('should handle rapid agent switches', () => {
      setAgentContext('sm');
      setAgentContext('tea');
      setAgentContext('dev');
      setAgentContext('reviewer');
      setAgentContext('sm');

      expect(getAgentContext()).toBe('sm');
    });

    it('should handle empty string agent', () => {
      process.env.PENNYFARTHING_AGENT = '';
      setAgentContext();

      // Empty string should be treated as no agent
      expect(getAgentContext()).toBeUndefined();
    });

    it('should handle invalid agent names gracefully', () => {
      // Invalid agent name - should still store it (validation is UI concern)
      setAgentContext('invalid-agent' as any);

      expect(getAgentContext()).toBe('invalid-agent');
    });

    it('should preserve agent context when adding to existing trace', () => {
      // First event creates trace with SM context
      setAgentContext('sm');
      addEventsToHierarchy([toolEventSM], [promptEventSM]);

      // Add more events to same trace while TEA is active
      // (simulating a trace that spans agent switches - edge case)
      setAgentContext('tea');
      const moreToolEvents: ToolEvent = {
        ...toolEventSM,
        spanId: 'span-sm-2',
        timestamp: 1704844900000,
      };
      addEventsToHierarchy([moreToolEvents], []);

      const hierarchy = getSpanHierarchy();
      // Should still be one trace
      expect(hierarchy).toHaveLength(1);

      // Agent should be the original (SM) since trace was created then
      // OR updated to TEA - this depends on implementation choice
      // Test documents expected behavior: first agent wins
      expect(hierarchy[0].attributes['pennyfarthing.agent']).toBe('sm');
    });

  });

});
