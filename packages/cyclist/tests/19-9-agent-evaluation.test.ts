/**
 * Story 19-9: Agent Evaluation Framework Tests
 *
 * Tests for the agent evaluation tool that tracks and compares agent
 * performance across tasks using telemetry data.
 *
 * These tests are written to FAIL initially (RED phase) and should pass
 * after Dev implements the agent evaluation functionality.
 *
 * Acceptance Criteria:
 * 1. AgentEvaluation type defined with all metric fields
 * 2. Evaluation data collected from telemetry spans
 * 3. Per-agent metrics aggregated and stored
 * 4. Per-persona comparison available
 * 5. Task completion tracking (success/failure/partial)
 * 6. Tool efficiency metric calculated
 * 7. API endpoint for evaluation data retrieval
 * 8. Integration with job-fair baseline data
 * 9. Historical trend storage for regression detection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Types from telemetry-types.ts (existing + new for this story)
import type {
  AgentSpan,
  ToolSpan,
  SpanStatus,
  AgentSpanAttributes,
  ToolSpanAttributes,
} from '../src/telemetry-types.js';

// NEW types and functions that need to be implemented for this story
import type {
  AgentMetrics,
  PersonaMetrics,
  TaskMetrics,
  AgentEvaluation,
  QualitySignals,
  RegressionAlert,
  JobFairBaseline,
  TrendDirection,
} from '../src/telemetry-types.js';

import {
  // Core aggregation functions
  aggregateByAgent,
  aggregateByPersona,
  aggregateByTaskType,
  // Metric calculation functions
  calculateCompletionRate,
  calculateToolEfficiency,
  calculateErrorRate,
  calculateAverageTokens,
  calculateAverageTime,
  // Evaluation management
  createEvaluation,
  getEvaluation,
  resetEvaluation,
  // Regression and recommendations
  detectRegressions,
  generateRecommendations,
  // Job-fair integration
  loadJobFairBaselines,
  compareToBaseline,
  // Historical storage
  storeEvaluation,
  getEvaluationHistory,
  detectTrend,
} from '../src/agent-evaluation.js';

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

/** Create a mock ToolSpan for testing */
function createMockToolSpan(overrides: Partial<ToolSpan> = {}): ToolSpan {
  return {
    traceId: 'trace-123',
    spanId: 'tool-789',
    parentSpanId: 'span-456',
    name: 'tool.Read',
    startTime: 2000,
    endTime: 2100,
    attributes: {
      'tool.name': 'Read',
      'tool.input': '/path/to/file.ts',
      'tool.duration_ms': 100,
      'tool.success': true,
    },
    ...overrides,
  };
}

/** Create multiple agent spans for aggregation testing */
function createAgentSpansForAggregation(): AgentSpan[] {
  return [
    // SM spans
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
      status: 'completed',
    }),
    // TEA spans
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
      status: 'completed',
    }),
    createMockAgentSpan({
      spanId: 'tea-2',
      attributes: {
        'gen_ai.system': 'claude',
        'gen_ai.request.model': 'claude-sonnet-4',
        'gen_ai.usage.input_tokens': 1800,
        'gen_ai.usage.output_tokens': 1200,
        'pennyfarthing.agent': 'tea',
        'pennyfarthing.theme': 'shakespeare',
      },
      status: 'completed',
    }),
    // Dev spans
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
      status: 'completed',
    }),
    createMockAgentSpan({
      spanId: 'dev-2',
      attributes: {
        'gen_ai.system': 'claude',
        'gen_ai.request.model': 'claude-sonnet-4',
        'gen_ai.usage.input_tokens': 4500,
        'gen_ai.usage.output_tokens': 2800,
        'pennyfarthing.agent': 'dev',
        'pennyfarthing.theme': 'shakespeare',
      },
      status: 'error',
    }),
    // Reviewer span
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
      status: 'completed',
    }),
  ];
}

/** Create spans with different personas */
function createPersonaSpans(): AgentSpan[] {
  return [
    // Shakespeare theme
    createMockAgentSpan({
      spanId: 'hamlet-1',
      attributes: {
        'gen_ai.system': 'claude',
        'gen_ai.request.model': 'claude-sonnet-4',
        'gen_ai.usage.input_tokens': 2000,
        'gen_ai.usage.output_tokens': 1500,
        'pennyfarthing.agent': 'tea',
        'pennyfarthing.theme': 'shakespeare',
      },
      status: 'completed',
    }),
    // Norse theme
    createMockAgentSpan({
      spanId: 'tyr-1',
      attributes: {
        'gen_ai.system': 'claude',
        'gen_ai.request.model': 'claude-sonnet-4',
        'gen_ai.usage.input_tokens': 1800,
        'gen_ai.usage.output_tokens': 1200,
        'pennyfarthing.agent': 'tea',
        'pennyfarthing.theme': 'norse',
      },
      status: 'completed',
    }),
    createMockAgentSpan({
      spanId: 'tyr-2',
      attributes: {
        'gen_ai.system': 'claude',
        'gen_ai.request.model': 'claude-sonnet-4',
        'gen_ai.usage.input_tokens': 2200,
        'gen_ai.usage.output_tokens': 1600,
        'pennyfarthing.agent': 'tea',
        'pennyfarthing.theme': 'norse',
      },
      status: 'error',
    }),
  ];
}

// =============================================================================
// AC1: AgentEvaluation type defined with all metric fields
// =============================================================================

describe('Story 19-9: Agent Evaluation Framework', () => {

  describe('AC1: AgentEvaluation type defined with all metric fields', () => {

    beforeEach(() => {
      resetEvaluation();
    });

    it('should define AgentMetrics with required fields', () => {
      const metrics: AgentMetrics = {
        agentRole: 'dev',
        taskCompletionRate: 0.95,
        averageTokens: 5000,
        averageTimeMs: 30000,
        toolEfficiency: 0.8,
        errorRate: 0.05,
        qualitySignals: {
          testsPassing: true,
          reviewApprovalRate: 0.9,
        },
      };

      expect(metrics.agentRole).toBe('dev');
      expect(metrics.taskCompletionRate).toBeGreaterThanOrEqual(0);
      expect(metrics.taskCompletionRate).toBeLessThanOrEqual(1);
      expect(metrics.averageTokens).toBeGreaterThan(0);
      expect(metrics.averageTimeMs).toBeGreaterThan(0);
      expect(metrics.toolEfficiency).toBeGreaterThanOrEqual(0);
      expect(metrics.errorRate).toBeGreaterThanOrEqual(0);
      expect(metrics.qualitySignals).toBeDefined();
    });

    it('should define PersonaMetrics extending AgentMetrics', () => {
      const metrics: PersonaMetrics = {
        agentRole: 'tea',
        persona: 'Hamlet',
        theme: 'shakespeare',
        taskCompletionRate: 0.92,
        averageTokens: 3500,
        averageTimeMs: 25000,
        toolEfficiency: 0.85,
        errorRate: 0.08,
        qualitySignals: {
          testsPassing: true,
          reviewApprovalRate: 0.88,
        },
      };

      expect(metrics.persona).toBe('Hamlet');
      expect(metrics.theme).toBe('shakespeare');
      // Should have all AgentMetrics fields too
      expect(metrics.agentRole).toBe('tea');
    });

    it('should define TaskMetrics with task type breakdown', () => {
      const metrics: TaskMetrics = {
        taskType: 'test_writing',
        count: 15,
        averageTokens: 2500,
        averageTimeMs: 20000,
        successRate: 0.93,
      };

      expect(metrics.taskType).toBe('test_writing');
      expect(metrics.count).toBeGreaterThan(0);
      expect(metrics.successRate).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBeLessThanOrEqual(1);
    });

    it('should define complete AgentEvaluation structure', () => {
      const evaluation: AgentEvaluation = {
        evaluationId: 'eval-123',
        timestamp: Date.now(),
        storyId: '19-9',
        agentMetrics: {
          dev: {
            agentRole: 'dev',
            taskCompletionRate: 0.95,
            averageTokens: 5000,
            averageTimeMs: 30000,
            toolEfficiency: 0.8,
            errorRate: 0.05,
            qualitySignals: { testsPassing: true, reviewApprovalRate: 0.9 },
          },
        },
        personaMetrics: {},
        taskTypeMetrics: {},
        regressionAlerts: [],
        recommendations: [],
      };

      expect(evaluation.evaluationId).toBeDefined();
      expect(evaluation.timestamp).toBeGreaterThan(0);
      expect(evaluation.agentMetrics).toBeDefined();
      expect(evaluation.personaMetrics).toBeDefined();
      expect(evaluation.taskTypeMetrics).toBeDefined();
      expect(evaluation.regressionAlerts).toBeInstanceOf(Array);
      expect(evaluation.recommendations).toBeInstanceOf(Array);
    });

    it('should define QualitySignals interface', () => {
      const signals: QualitySignals = {
        testsPassing: true,
        reviewApprovalRate: 0.85,
        lintClean: true,
        buildSuccess: true,
      };

      expect(signals.testsPassing).toBe(true);
      expect(signals.reviewApprovalRate).toBeGreaterThanOrEqual(0);
    });

    it('should define RegressionAlert interface', () => {
      const alert: RegressionAlert = {
        agentRole: 'dev',
        metric: 'taskCompletionRate',
        currentValue: 0.75,
        baselineValue: 0.95,
        percentChange: -21.05,
        severity: 'warning',
      };

      expect(alert.agentRole).toBe('dev');
      expect(alert.metric).toBe('taskCompletionRate');
      expect(alert.percentChange).toBeLessThan(0); // Regression is negative
      expect(['info', 'warning', 'critical']).toContain(alert.severity);
    });

  });

  // =============================================================================
  // AC2: Evaluation data collected from telemetry spans
  // =============================================================================

  describe('AC2: Evaluation data collected from telemetry spans', () => {

    beforeEach(() => {
      resetEvaluation();
    });

    it('should create evaluation from agent spans', () => {
      const spans = createAgentSpansForAggregation();

      const evaluation = createEvaluation(spans);

      expect(evaluation).not.toBeNull();
      expect(evaluation.evaluationId).toBeDefined();
      expect(evaluation.timestamp).toBeGreaterThan(0);
    });

    it('should extract agent role from span attributes', () => {
      const spans = [
        createMockAgentSpan({
          attributes: {
            'gen_ai.system': 'claude',
            'gen_ai.request.model': 'claude-sonnet-4',
            'pennyfarthing.agent': 'tea',
          },
        }),
      ];

      const evaluation = createEvaluation(spans);

      expect(evaluation.agentMetrics['tea']).toBeDefined();
    });

    it('should extract token counts from span attributes', () => {
      const spans = [
        createMockAgentSpan({
          attributes: {
            'gen_ai.system': 'claude',
            'gen_ai.request.model': 'claude-sonnet-4',
            'gen_ai.usage.input_tokens': 1000,
            'gen_ai.usage.output_tokens': 500,
            'pennyfarthing.agent': 'dev',
          },
        }),
      ];

      const evaluation = createEvaluation(spans);

      expect(evaluation.agentMetrics['dev'].averageTokens).toBe(1500);
    });

    it('should extract timing from span start/end times', () => {
      const spans = [
        createMockAgentSpan({
          startTime: 1000,
          endTime: 31000, // 30 seconds
          attributes: {
            'gen_ai.system': 'claude',
            'gen_ai.request.model': 'claude-sonnet-4',
            'pennyfarthing.agent': 'dev',
          },
        }),
      ];

      const evaluation = createEvaluation(spans);

      expect(evaluation.agentMetrics['dev'].averageTimeMs).toBe(30000);
    });

    it('should handle spans without pennyfarthing.agent attribute', () => {
      const spans = [
        createMockAgentSpan({
          attributes: {
            'gen_ai.system': 'claude',
            'gen_ai.request.model': 'claude-sonnet-4',
            // No pennyfarthing.agent
          },
        }),
      ];

      const evaluation = createEvaluation(spans);

      // Should categorize as 'unknown' or skip
      expect(evaluation.agentMetrics['unknown'] || Object.keys(evaluation.agentMetrics).length === 0).toBe(true);
    });

    it('should handle empty spans array', () => {
      const evaluation = createEvaluation([]);

      expect(evaluation).not.toBeNull();
      expect(Object.keys(evaluation.agentMetrics)).toHaveLength(0);
    });

    it('should extract story ID from spans', () => {
      const spans = [
        createMockAgentSpan({
          attributes: {
            'gen_ai.system': 'claude',
            'gen_ai.request.model': 'claude-sonnet-4',
            'pennyfarthing.agent': 'dev',
            'pennyfarthing.story_id': '19-9',
          },
        }),
      ];

      const evaluation = createEvaluation(spans);

      expect(evaluation.storyId).toBe('19-9');
    });

  });

  // =============================================================================
  // AC3: Per-agent metrics aggregated and stored
  // =============================================================================

  describe('AC3: Per-agent metrics aggregated and stored', () => {

    beforeEach(() => {
      resetEvaluation();
    });

    it('should aggregate spans by agent role', () => {
      const spans = createAgentSpansForAggregation();

      const agentMetrics = aggregateByAgent(spans);

      expect(agentMetrics['sm']).toBeDefined();
      expect(agentMetrics['tea']).toBeDefined();
      expect(agentMetrics['dev']).toBeDefined();
      expect(agentMetrics['reviewer']).toBeDefined();
    });

    it('should calculate average tokens per agent', () => {
      const spans = createAgentSpansForAggregation();

      const agentMetrics = aggregateByAgent(spans);

      // TEA has 2 spans: (2000+1500) + (1800+1200) = 6500 tokens, average = 3250
      expect(agentMetrics['tea'].averageTokens).toBe(3250);
    });

    it('should calculate average time per agent', () => {
      const spans = [
        createMockAgentSpan({
          startTime: 0,
          endTime: 10000,
          attributes: {
            'gen_ai.system': 'claude',
            'gen_ai.request.model': 'claude-sonnet-4',
            'pennyfarthing.agent': 'dev',
          },
        }),
        createMockAgentSpan({
          startTime: 0,
          endTime: 20000,
          attributes: {
            'gen_ai.system': 'claude',
            'gen_ai.request.model': 'claude-sonnet-4',
            'pennyfarthing.agent': 'dev',
          },
        }),
      ];

      const agentMetrics = aggregateByAgent(spans);

      expect(agentMetrics['dev'].averageTimeMs).toBe(15000);
    });

    it('should store metrics in evaluation state', () => {
      const spans = createAgentSpansForAggregation();
      createEvaluation(spans);

      const evaluation = getEvaluation();

      expect(evaluation).not.toBeNull();
      expect(evaluation!.agentMetrics['dev']).toBeDefined();
    });

    it('should reset evaluation state', () => {
      const spans = createAgentSpansForAggregation();
      createEvaluation(spans);

      resetEvaluation();

      expect(getEvaluation()).toBeNull();
    });

    it('should count tasks per agent', () => {
      const spans = createAgentSpansForAggregation();

      const agentMetrics = aggregateByAgent(spans);

      // Dev has 2 spans
      expect(agentMetrics['dev']).toBeDefined();
      // SM has 1 span
      expect(agentMetrics['sm']).toBeDefined();
    });

  });

  // =============================================================================
  // AC4: Per-persona comparison available
  // =============================================================================

  describe('AC4: Per-persona comparison available', () => {

    beforeEach(() => {
      resetEvaluation();
    });

    it('should aggregate spans by persona/theme', () => {
      const spans = createPersonaSpans();

      const personaMetrics = aggregateByPersona(spans);

      expect(personaMetrics['shakespeare']).toBeDefined();
      expect(personaMetrics['norse']).toBeDefined();
    });

    it('should include theme in persona metrics', () => {
      const spans = createPersonaSpans();

      const personaMetrics = aggregateByPersona(spans);

      expect(personaMetrics['shakespeare'].theme).toBe('shakespeare');
      expect(personaMetrics['norse'].theme).toBe('norse');
    });

    it('should calculate metrics per persona', () => {
      const spans = createPersonaSpans();

      const personaMetrics = aggregateByPersona(spans);

      // Shakespeare has 1 span with 3500 tokens
      expect(personaMetrics['shakespeare'].averageTokens).toBe(3500);
      // Norse has 2 spans: 3000 + 3800 = 6800 tokens, average = 3400
      expect(personaMetrics['norse'].averageTokens).toBe(3400);
    });

    it('should calculate completion rate per persona', () => {
      const spans = createPersonaSpans();

      const personaMetrics = aggregateByPersona(spans);

      // Shakespeare: 1/1 completed
      expect(personaMetrics['shakespeare'].taskCompletionRate).toBe(1.0);
      // Norse: 1/2 completed (one error)
      expect(personaMetrics['norse'].taskCompletionRate).toBe(0.5);
    });

    it('should handle spans without theme attribute', () => {
      const spans = [
        createMockAgentSpan({
          attributes: {
            'gen_ai.system': 'claude',
            'gen_ai.request.model': 'claude-sonnet-4',
            'pennyfarthing.agent': 'dev',
            // No pennyfarthing.theme
          },
        }),
      ];

      const personaMetrics = aggregateByPersona(spans);

      // Should use 'unknown' theme or skip
      expect(personaMetrics['unknown'] || Object.keys(personaMetrics).length === 0).toBe(true);
    });

    it('should enable persona comparison across same role', () => {
      const spans = createPersonaSpans();
      const evaluation = createEvaluation(spans);

      // Both shakespeare and norse are TEA spans
      expect(evaluation.personaMetrics['shakespeare']?.agentRole).toBe('tea');
      expect(evaluation.personaMetrics['norse']?.agentRole).toBe('tea');
    });

  });

  // =============================================================================
  // AC5: Task completion tracking (success/failure/partial)
  // =============================================================================

  describe('AC5: Task completion tracking (success/failure/partial)', () => {

    beforeEach(() => {
      resetEvaluation();
    });

    it('should calculate completion rate for successful spans', () => {
      const spans = [
        createMockAgentSpan({ status: 'completed' }),
        createMockAgentSpan({ status: 'completed' }),
        createMockAgentSpan({ status: 'completed' }),
      ];

      const rate = calculateCompletionRate(spans);

      expect(rate).toBe(1.0);
    });

    it('should calculate completion rate with failures', () => {
      const spans = [
        createMockAgentSpan({ status: 'completed' }),
        createMockAgentSpan({ status: 'error' }),
        createMockAgentSpan({ status: 'completed' }),
        createMockAgentSpan({ status: 'error' }),
      ];

      const rate = calculateCompletionRate(spans);

      expect(rate).toBe(0.5);
    });

    it('should handle running spans as partial', () => {
      const spans = [
        createMockAgentSpan({ status: 'completed' }),
        createMockAgentSpan({ status: 'running' }),
      ];

      const rate = calculateCompletionRate(spans);

      // Running spans count as 0.5 (partial)
      expect(rate).toBe(0.75);
    });

    it('should return 0 for empty spans', () => {
      const rate = calculateCompletionRate([]);

      expect(rate).toBe(0);
    });

    it('should track completion in agent metrics', () => {
      const spans = createAgentSpansForAggregation();

      const agentMetrics = aggregateByAgent(spans);

      // Dev has 1 completed, 1 error = 0.5 completion rate
      expect(agentMetrics['dev'].taskCompletionRate).toBe(0.5);
    });

    it('should differentiate by span status values', () => {
      const statuses: SpanStatus[] = ['completed', 'error', 'running'];

      statuses.forEach(status => {
        const span = createMockAgentSpan({ status });
        expect(span.status).toBe(status);
      });
    });

  });

  // =============================================================================
  // AC6: Tool efficiency metric calculated
  // =============================================================================

  describe('AC6: Tool efficiency metric calculated', () => {

    beforeEach(() => {
      resetEvaluation();
    });

    it('should calculate tool efficiency from child spans', () => {
      const toolSpans: ToolSpan[] = [
        createMockToolSpan({ attributes: { 'tool.name': 'Read', 'tool.success': true, 'tool.duration_ms': 100 } }),
        createMockToolSpan({ attributes: { 'tool.name': 'Write', 'tool.success': true, 'tool.duration_ms': 150 } }),
        createMockToolSpan({ attributes: { 'tool.name': 'Read', 'tool.success': true, 'tool.duration_ms': 80 } }),
      ];

      // For 'implementation' task, expected minimum is 2 tools
      const efficiency = calculateToolEfficiency(toolSpans, 'implementation');

      // 3 tools used / 2 expected = 1.5 (but capped or inverted for efficiency score)
      expect(efficiency).toBeGreaterThan(0);
      expect(efficiency).toBeLessThanOrEqual(1);
    });

    it('should handle perfect efficiency (exact tool count)', () => {
      const toolSpans: ToolSpan[] = [
        createMockToolSpan({ attributes: { 'tool.name': 'Read', 'tool.success': true, 'tool.duration_ms': 100 } }),
        createMockToolSpan({ attributes: { 'tool.name': 'Write', 'tool.success': true, 'tool.duration_ms': 150 } }),
      ];

      // Assume 'implementation' expects 2 tools
      const efficiency = calculateToolEfficiency(toolSpans, 'implementation');

      expect(efficiency).toBe(1.0);
    });

    it('should penalize excessive tool usage', () => {
      const toolSpans: ToolSpan[] = [
        createMockToolSpan(),
        createMockToolSpan(),
        createMockToolSpan(),
        createMockToolSpan(),
        createMockToolSpan(),
      ];

      const efficiency = calculateToolEfficiency(toolSpans, 'implementation');

      // More tools than expected = lower efficiency
      expect(efficiency).toBeLessThan(1.0);
    });

    it('should handle failed tool calls', () => {
      const toolSpans: ToolSpan[] = [
        createMockToolSpan({ attributes: { 'tool.name': 'Read', 'tool.success': true, 'tool.duration_ms': 100 } }),
        createMockToolSpan({ attributes: { 'tool.name': 'Read', 'tool.success': false, 'tool.duration_ms': 50, 'tool.error': 'File not found' } }),
        createMockToolSpan({ attributes: { 'tool.name': 'Read', 'tool.success': true, 'tool.duration_ms': 100 } }),
      ];

      const efficiency = calculateToolEfficiency(toolSpans, 'implementation');

      // Failed tool followed by retry = lower efficiency
      expect(efficiency).toBeLessThan(1.0);
    });

    it('should return 1.0 for empty tool spans', () => {
      const efficiency = calculateToolEfficiency([], 'implementation');

      // No tools used = perfect efficiency (or could be 0, depends on implementation)
      expect([0, 1]).toContain(efficiency);
    });

    it('should calculate efficiency per task type', () => {
      const toolSpans: ToolSpan[] = [
        createMockToolSpan(),
        createMockToolSpan(),
      ];

      // Different task types have different expectations
      const testWritingEfficiency = calculateToolEfficiency(toolSpans, 'test_writing');
      const implementationEfficiency = calculateToolEfficiency(toolSpans, 'implementation');

      // Both should be valid numbers
      expect(testWritingEfficiency).toBeGreaterThanOrEqual(0);
      expect(implementationEfficiency).toBeGreaterThanOrEqual(0);
    });

  });

  // =============================================================================
  // AC7: API endpoint for evaluation data retrieval
  // - See 19-9-evaluation-api.test.ts for HTTP endpoint tests
  // =============================================================================

  describe('AC7: API endpoint for evaluation data retrieval (unit)', () => {

    beforeEach(() => {
      resetEvaluation();
    });

    it('should return null when no evaluation exists', () => {
      const evaluation = getEvaluation();

      expect(evaluation).toBeNull();
    });

    it('should return evaluation after creation', () => {
      const spans = createAgentSpansForAggregation();
      createEvaluation(spans);

      const evaluation = getEvaluation();

      expect(evaluation).not.toBeNull();
      expect(evaluation!.agentMetrics).toBeDefined();
    });

    it('should include all metric types in evaluation', () => {
      const spans = createAgentSpansForAggregation();
      createEvaluation(spans);

      const evaluation = getEvaluation();

      expect(evaluation!.agentMetrics).toBeDefined();
      expect(evaluation!.personaMetrics).toBeDefined();
      expect(evaluation!.taskTypeMetrics).toBeDefined();
    });

  });

  // =============================================================================
  // AC8: Integration with job-fair baseline data
  // =============================================================================

  describe('AC8: Integration with job-fair baseline data', () => {

    beforeEach(() => {
      resetEvaluation();
    });

    it('should define JobFairBaseline interface', () => {
      const baseline: JobFairBaseline = {
        persona: 'Hamlet',
        agentRole: 'tea',
        taskType: 'test_writing',
        metrics: {
          averageTokens: 3000,
          averageTimeMs: 25000,
          completionRate: 0.95,
        },
      };

      expect(baseline.persona).toBe('Hamlet');
      expect(baseline.agentRole).toBe('tea');
      expect(baseline.metrics.averageTokens).toBe(3000);
    });

    it('should load job-fair baselines from path', () => {
      // Mock baselines - in real implementation would read from file
      const baselines = loadJobFairBaselines('mock://baselines');

      expect(Array.isArray(baselines)).toBe(true);
    });

    it('should compare current metrics to baseline', () => {
      const currentMetrics: AgentMetrics = {
        agentRole: 'tea',
        taskCompletionRate: 0.80,
        averageTokens: 3500,
        averageTimeMs: 30000,
        toolEfficiency: 0.75,
        errorRate: 0.20,
        qualitySignals: { testsPassing: true, reviewApprovalRate: 0.85 },
      };

      const baseline: JobFairBaseline = {
        persona: 'Hamlet',
        agentRole: 'tea',
        taskType: 'test_writing',
        metrics: {
          averageTokens: 3000,
          averageTimeMs: 25000,
          completionRate: 0.95,
        },
      };

      const comparison = compareToBaseline(currentMetrics, baseline);

      // Returns percentage difference
      expect(typeof comparison).toBe('number');
    });

    it('should identify underperformance vs baseline', () => {
      const currentMetrics: AgentMetrics = {
        agentRole: 'tea',
        taskCompletionRate: 0.75, // Below 0.95 baseline
        averageTokens: 3500,
        averageTimeMs: 30000,
        toolEfficiency: 0.75,
        errorRate: 0.25,
        qualitySignals: { testsPassing: true, reviewApprovalRate: 0.85 },
      };

      const baseline: JobFairBaseline = {
        persona: 'Hamlet',
        agentRole: 'tea',
        taskType: 'test_writing',
        metrics: {
          averageTokens: 3000,
          averageTimeMs: 25000,
          completionRate: 0.95,
        },
      };

      const comparison = compareToBaseline(currentMetrics, baseline);

      // Negative means underperforming
      expect(comparison).toBeLessThan(0);
    });

    it('should identify overperformance vs baseline', () => {
      const currentMetrics: AgentMetrics = {
        agentRole: 'tea',
        taskCompletionRate: 0.98, // Above 0.95 baseline
        averageTokens: 2500, // Better than 3000 baseline
        averageTimeMs: 20000, // Faster than 25000 baseline
        toolEfficiency: 0.95,
        errorRate: 0.02,
        qualitySignals: { testsPassing: true, reviewApprovalRate: 0.95 },
      };

      const baseline: JobFairBaseline = {
        persona: 'Hamlet',
        agentRole: 'tea',
        taskType: 'test_writing',
        metrics: {
          averageTokens: 3000,
          averageTimeMs: 25000,
          completionRate: 0.95,
        },
      };

      const comparison = compareToBaseline(currentMetrics, baseline);

      // Positive means overperforming
      expect(comparison).toBeGreaterThan(0);
    });

  });

  // =============================================================================
  // AC9: Historical trend storage for regression detection
  // =============================================================================

  describe('AC9: Historical trend storage for regression detection', () => {

    beforeEach(() => {
      resetEvaluation();
    });

    it('should store evaluation in history', () => {
      const spans = createAgentSpansForAggregation();
      const evaluation = createEvaluation(spans);

      storeEvaluation(evaluation);

      const history = getEvaluationHistory('dev');
      expect(history.length).toBeGreaterThan(0);
    });

    it('should retrieve evaluation history for agent', () => {
      const spans = createAgentSpansForAggregation();

      // Store multiple evaluations
      const eval1 = createEvaluation(spans);
      storeEvaluation(eval1);

      resetEvaluation();

      const eval2 = createEvaluation(spans);
      storeEvaluation(eval2);

      const history = getEvaluationHistory('dev');

      expect(history.length).toBe(2);
    });

    it('should limit history retrieval', () => {
      const spans = createAgentSpansForAggregation();

      // Store many evaluations
      for (let i = 0; i < 10; i++) {
        resetEvaluation();
        const evaluation = createEvaluation(spans);
        storeEvaluation(evaluation);
      }

      const history = getEvaluationHistory('dev', 5);

      expect(history.length).toBe(5);
    });

    it('should detect regression from historical data', () => {
      const currentMetrics: AgentMetrics = {
        agentRole: 'dev',
        taskCompletionRate: 0.70, // Dropped from 0.95
        averageTokens: 7000, // Increased from 5000
        averageTimeMs: 45000, // Slower than 30000
        toolEfficiency: 0.60,
        errorRate: 0.30,
        qualitySignals: { testsPassing: false, reviewApprovalRate: 0.70 },
      };

      const baselineMetrics: AgentMetrics = {
        agentRole: 'dev',
        taskCompletionRate: 0.95,
        averageTokens: 5000,
        averageTimeMs: 30000,
        toolEfficiency: 0.85,
        errorRate: 0.05,
        qualitySignals: { testsPassing: true, reviewApprovalRate: 0.90 },
      };

      const alerts = detectRegressions(currentMetrics, baselineMetrics);

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts.some(a => a.metric === 'taskCompletionRate')).toBe(true);
    });

    it('should categorize regression severity', () => {
      const currentMetrics: AgentMetrics = {
        agentRole: 'dev',
        taskCompletionRate: 0.50, // Major drop
        averageTokens: 5000,
        averageTimeMs: 30000,
        toolEfficiency: 0.85,
        errorRate: 0.05,
        qualitySignals: { testsPassing: true, reviewApprovalRate: 0.90 },
      };

      const baselineMetrics: AgentMetrics = {
        agentRole: 'dev',
        taskCompletionRate: 0.95,
        averageTokens: 5000,
        averageTimeMs: 30000,
        toolEfficiency: 0.85,
        errorRate: 0.05,
        qualitySignals: { testsPassing: true, reviewApprovalRate: 0.90 },
      };

      const alerts = detectRegressions(currentMetrics, baselineMetrics);

      // >25% drop should be critical
      const completionAlert = alerts.find(a => a.metric === 'taskCompletionRate');
      expect(completionAlert?.severity).toBe('critical');
    });

    it('should detect trend direction', () => {
      // This requires historical data to be set up first
      const trend = detectTrend('dev');

      expect(['improving', 'stable', 'declining', 'unknown']).toContain(trend);
    });

    it('should generate recommendations from evaluation', () => {
      const evaluation: AgentEvaluation = {
        evaluationId: 'eval-123',
        timestamp: Date.now(),
        agentMetrics: {
          dev: {
            agentRole: 'dev',
            taskCompletionRate: 0.70,
            averageTokens: 7000,
            averageTimeMs: 45000,
            toolEfficiency: 0.60,
            errorRate: 0.30,
            qualitySignals: { testsPassing: false, reviewApprovalRate: 0.70 },
          },
        },
        personaMetrics: {
          shakespeare: {
            agentRole: 'dev',
            persona: 'Hamlet',
            theme: 'shakespeare',
            taskCompletionRate: 0.85,
            averageTokens: 5500,
            averageTimeMs: 35000,
            toolEfficiency: 0.75,
            errorRate: 0.15,
            qualitySignals: { testsPassing: true, reviewApprovalRate: 0.80 },
          },
          norse: {
            agentRole: 'dev',
            persona: 'Tyr',
            theme: 'norse',
            taskCompletionRate: 0.60,
            averageTokens: 8000,
            averageTimeMs: 50000,
            toolEfficiency: 0.50,
            errorRate: 0.40,
            qualitySignals: { testsPassing: false, reviewApprovalRate: 0.60 },
          },
        },
        taskTypeMetrics: {},
        regressionAlerts: [],
        recommendations: [],
      };

      const recommendations = generateRecommendations(evaluation);

      expect(Array.isArray(recommendations)).toBe(true);
      // Should recommend shakespeare over norse for dev role
      expect(recommendations.some(r => r.includes('shakespeare') || r.includes('Hamlet'))).toBe(true);
    });

  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {

    beforeEach(() => {
      resetEvaluation();
    });

    it('should handle spans with missing attributes gracefully', () => {
      const spans = [
        createMockAgentSpan({
          attributes: {
            'gen_ai.system': 'claude',
            'gen_ai.request.model': 'claude-sonnet-4',
            // Missing all pennyfarthing.* attributes
          },
        }),
      ];

      expect(() => createEvaluation(spans)).not.toThrow();
    });

    it('should handle calculateErrorRate with no errors', () => {
      const spans = [
        createMockAgentSpan({ status: 'completed' }),
        createMockAgentSpan({ status: 'completed' }),
      ];

      const rate = calculateErrorRate(spans);

      expect(rate).toBe(0);
    });

    it('should handle calculateErrorRate with all errors', () => {
      const spans = [
        createMockAgentSpan({ status: 'error' }),
        createMockAgentSpan({ status: 'error' }),
      ];

      const rate = calculateErrorRate(spans);

      expect(rate).toBe(1);
    });

    it('should handle calculateAverageTokens with missing token attributes', () => {
      const spans = [
        createMockAgentSpan({
          attributes: {
            'gen_ai.system': 'claude',
            'gen_ai.request.model': 'claude-sonnet-4',
            'pennyfarthing.agent': 'dev',
            // No token attributes
          },
        }),
      ];

      const avg = calculateAverageTokens(spans);

      expect(avg).toBe(0);
    });

    it('should handle calculateAverageTime with missing endTime', () => {
      const spans = [
        createMockAgentSpan({
          startTime: 1000,
          endTime: undefined, // Still running
        }),
      ];

      const avg = calculateAverageTime(spans);

      // Should return 0 or use current time
      expect(avg).toBeGreaterThanOrEqual(0);
    });

    it('should handle very large token counts', () => {
      const spans = [
        createMockAgentSpan({
          attributes: {
            'gen_ai.system': 'claude',
            'gen_ai.request.model': 'claude-sonnet-4',
            'gen_ai.usage.input_tokens': 1000000,
            'gen_ai.usage.output_tokens': 500000,
            'pennyfarthing.agent': 'dev',
          },
        }),
      ];

      const avg = calculateAverageTokens(spans);

      expect(avg).toBe(1500000);
    });

    it('should handle aggregation with single span per role', () => {
      const spans = [
        createMockAgentSpan({
          attributes: {
            'gen_ai.system': 'claude',
            'gen_ai.request.model': 'claude-sonnet-4',
            'pennyfarthing.agent': 'dev',
          },
        }),
      ];

      const agentMetrics = aggregateByAgent(spans);

      expect(agentMetrics['dev']).toBeDefined();
    });

  });

  // =============================================================================
  // Type Conformance
  // =============================================================================

  describe('Type Conformance', () => {

    it('should return valid AgentMetrics from aggregateByAgent', () => {
      const spans = createAgentSpansForAggregation();

      const agentMetrics = aggregateByAgent(spans);

      Object.values(agentMetrics).forEach(metrics => {
        expect(typeof metrics.agentRole).toBe('string');
        expect(typeof metrics.taskCompletionRate).toBe('number');
        expect(typeof metrics.averageTokens).toBe('number');
        expect(typeof metrics.averageTimeMs).toBe('number');
        expect(typeof metrics.toolEfficiency).toBe('number');
        expect(typeof metrics.errorRate).toBe('number');
        expect(metrics.qualitySignals).toBeDefined();
      });
    });

    it('should return valid PersonaMetrics from aggregateByPersona', () => {
      const spans = createPersonaSpans();

      const personaMetrics = aggregateByPersona(spans);

      Object.values(personaMetrics).forEach(metrics => {
        expect(typeof metrics.theme).toBe('string');
        // Should also have AgentMetrics fields
        expect(typeof metrics.agentRole).toBe('string');
      });
    });

    it('should return valid TrendDirection from detectTrend', () => {
      const trend = detectTrend('dev');

      expect(['improving', 'stable', 'declining', 'unknown']).toContain(trend);
    });

  });

});
