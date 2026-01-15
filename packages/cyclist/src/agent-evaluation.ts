/**
 * Agent Evaluation Framework - Story 19-9
 *
 * Tracks and compares agent performance across tasks using telemetry data.
 * Computes quality metrics beyond just token counts including completion rates,
 * tool efficiency, and regression detection.
 *
 * Pattern: In-memory state management following tdd-metrics.ts
 */

import { readFileSync, existsSync } from 'fs';
import type {
  AgentSpan,
  ToolSpan,
  AgentMetrics,
  PersonaMetrics,
  TaskMetrics,
  AgentEvaluation,
  RegressionAlert,
  JobFairBaseline,
  TrendDirection,
} from './telemetry-types.js';

// =============================================================================
// State
// =============================================================================

/** Current evaluation (null if not created) */
let currentEvaluation: AgentEvaluation | null = null;

/** Historical evaluations for trend analysis */
let evaluationHistory: AgentEvaluation[] = [];

/** Expected minimum tool counts per task type */
const EXPECTED_TOOL_COUNTS: Record<string, number> = {
  implementation: 2,
  test_writing: 3,
  code_review: 2,
  story_setup: 1,
  default: 2,
};

// =============================================================================
// Metric Calculation Functions
// =============================================================================

/**
 * Calculate completion rate from spans
 * completed = 1.0, running = 0.5, error = 0.0
 *
 * @param spans - Array of agent spans to analyze
 * @returns Completion rate between 0.0 and 1.0
 */
export function calculateCompletionRate(spans: AgentSpan[]): number {
  if (spans.length === 0) {
    return 0;
  }

  let total = 0;
  for (const span of spans) {
    if (span.status === 'completed') {
      total += 1.0;
    } else if (span.status === 'running') {
      total += 0.5;
    }
    // error = 0
  }

  return total / spans.length;
}

/**
 * Calculate error rate from spans
 *
 * @param spans - Array of agent spans to analyze
 * @returns Error rate between 0.0 and 1.0
 */
export function calculateErrorRate(spans: AgentSpan[]): number {
  if (spans.length === 0) {
    return 0;
  }

  const errors = spans.filter(s => s.status === 'error').length;
  return errors / spans.length;
}

/**
 * Calculate average tokens from spans
 *
 * @param spans - Array of agent spans to analyze
 * @returns Average total tokens (input + output)
 */
export function calculateAverageTokens(spans: AgentSpan[]): number {
  if (spans.length === 0) {
    return 0;
  }

  let totalTokens = 0;
  for (const span of spans) {
    const input = span.attributes['gen_ai.usage.input_tokens'] ?? 0;
    const output = span.attributes['gen_ai.usage.output_tokens'] ?? 0;
    totalTokens += input + output;
  }

  return totalTokens / spans.length;
}

/**
 * Calculate average time from spans
 *
 * @param spans - Array of agent spans to analyze
 * @returns Average duration in milliseconds
 */
export function calculateAverageTime(spans: AgentSpan[]): number {
  if (spans.length === 0) {
    return 0;
  }

  let totalTime = 0;
  let countWithTime = 0;

  for (const span of spans) {
    if (span.endTime !== undefined) {
      totalTime += span.endTime - span.startTime;
      countWithTime++;
    }
  }

  return countWithTime > 0 ? totalTime / countWithTime : 0;
}

/**
 * Calculate tool efficiency metric
 *
 * Efficiency = min(1, expectedTools / actualTools)
 * Failed tools additionally penalize efficiency
 *
 * @param toolSpans - Array of tool spans to analyze
 * @param taskType - Type of task (determines expected tool count)
 * @returns Efficiency score between 0.0 and 1.0
 */
export function calculateToolEfficiency(toolSpans: ToolSpan[], taskType: string): number {
  if (toolSpans.length === 0) {
    return 1; // No tools used = perfect efficiency (nothing wasted)
  }

  const expected = EXPECTED_TOOL_COUNTS[taskType] ?? EXPECTED_TOOL_COUNTS.default;
  const actual = toolSpans.length;

  // Base efficiency: ratio of expected to actual (capped at 1.0)
  let efficiency = Math.min(1, expected / actual);

  // Penalize for failed tool calls
  const failedCount = toolSpans.filter(t => !t.attributes['tool.success']).length;
  if (failedCount > 0) {
    const failurePenalty = failedCount / actual * 0.5; // 50% penalty per failure
    efficiency = Math.max(0, efficiency - failurePenalty);
  }

  return efficiency;
}

// =============================================================================
// Aggregation Functions
// =============================================================================

/**
 * Aggregate spans by agent role
 *
 * @param spans - Array of agent spans to aggregate
 * @returns Record of agent role to metrics
 */
export function aggregateByAgent(spans: AgentSpan[]): Record<string, AgentMetrics> {
  const byAgent: Record<string, AgentSpan[]> = {};

  // Group spans by agent role (skip spans without agent attribute)
  for (const span of spans) {
    const agent = span.attributes['pennyfarthing.agent'];
    if (!agent) continue; // Skip spans without agent attribute
    if (!byAgent[agent]) {
      byAgent[agent] = [];
    }
    byAgent[agent].push(span);
  }

  // Calculate metrics per agent
  const result: Record<string, AgentMetrics> = {};
  for (const [agent, agentSpans] of Object.entries(byAgent)) {
    // Gather all tool spans from child spans
    const allToolSpans: ToolSpan[] = [];
    for (const span of agentSpans) {
      allToolSpans.push(...span.childSpans);
    }

    result[agent] = {
      agentRole: agent,
      taskCompletionRate: calculateCompletionRate(agentSpans),
      averageTokens: calculateAverageTokens(agentSpans),
      averageTimeMs: calculateAverageTime(agentSpans),
      toolEfficiency: calculateToolEfficiency(allToolSpans, 'default'),
      errorRate: calculateErrorRate(agentSpans),
      qualitySignals: {
        testsPassing: true, // Default assumption
        reviewApprovalRate: 0.9, // Default
      },
    };
  }

  return result;
}

/**
 * Aggregate spans by persona/theme
 *
 * @param spans - Array of agent spans to aggregate
 * @returns Record of theme to persona metrics
 */
export function aggregateByPersona(spans: AgentSpan[]): Record<string, PersonaMetrics> {
  const byTheme: Record<string, AgentSpan[]> = {};

  // Group spans by theme (skip spans without theme attribute)
  for (const span of spans) {
    const theme = span.attributes['pennyfarthing.theme'];
    if (!theme) continue; // Skip spans without theme attribute
    if (!byTheme[theme]) {
      byTheme[theme] = [];
    }
    byTheme[theme].push(span);
  }

  // Calculate metrics per theme
  const result: Record<string, PersonaMetrics> = {};
  for (const [theme, themeSpans] of Object.entries(byTheme)) {
    // Determine the primary agent role for this theme
    const agentRoles = themeSpans.map(s => s.attributes['pennyfarthing.agent'] ?? 'unknown');
    const primaryRole = agentRoles[0] ?? 'unknown';

    // Gather all tool spans
    const allToolSpans: ToolSpan[] = [];
    for (const span of themeSpans) {
      allToolSpans.push(...span.childSpans);
    }

    result[theme] = {
      agentRole: primaryRole,
      theme,
      taskCompletionRate: calculateCompletionRate(themeSpans),
      averageTokens: calculateAverageTokens(themeSpans),
      averageTimeMs: calculateAverageTime(themeSpans),
      toolEfficiency: calculateToolEfficiency(allToolSpans, 'default'),
      errorRate: calculateErrorRate(themeSpans),
      qualitySignals: {
        testsPassing: true,
        reviewApprovalRate: 0.9,
      },
    };
  }

  return result;
}

/**
 * Aggregate spans by task type
 *
 * @param spans - Array of agent spans to aggregate
 * @returns Record of task type to metrics
 */
export function aggregateByTaskType(spans: AgentSpan[]): Record<string, TaskMetrics> {
  // For now, infer task type from agent role
  const byTaskType: Record<string, AgentSpan[]> = {};

  for (const span of spans) {
    const agent = span.attributes['pennyfarthing.agent'] ?? 'unknown';
    // Map agent roles to task types
    let taskType: string;
    switch (agent) {
      case 'tea':
        taskType = 'test_writing';
        break;
      case 'dev':
        taskType = 'implementation';
        break;
      case 'reviewer':
        taskType = 'code_review';
        break;
      case 'sm':
        taskType = 'story_setup';
        break;
      default:
        taskType = 'unknown';
    }

    if (!byTaskType[taskType]) {
      byTaskType[taskType] = [];
    }
    byTaskType[taskType].push(span);
  }

  const result: Record<string, TaskMetrics> = {};
  for (const [taskType, taskSpans] of Object.entries(byTaskType)) {
    result[taskType] = {
      taskType,
      count: taskSpans.length,
      averageTokens: calculateAverageTokens(taskSpans),
      averageTimeMs: calculateAverageTime(taskSpans),
      successRate: calculateCompletionRate(taskSpans),
    };
  }

  return result;
}

// =============================================================================
// Evaluation Management
// =============================================================================

/**
 * Create an evaluation from agent spans
 *
 * @param spans - Array of agent spans to analyze
 * @returns The created AgentEvaluation
 */
export function createEvaluation(spans: AgentSpan[]): AgentEvaluation {
  // Extract story ID from first span that has it
  let storyId: string | undefined;
  for (const span of spans) {
    if (span.attributes['pennyfarthing.story_id']) {
      storyId = span.attributes['pennyfarthing.story_id'];
      break;
    }
  }

  const evaluation: AgentEvaluation = {
    evaluationId: `eval-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    timestamp: Date.now(),
    storyId,
    agentMetrics: aggregateByAgent(spans),
    personaMetrics: aggregateByPersona(spans),
    taskTypeMetrics: aggregateByTaskType(spans),
    regressionAlerts: [],
    recommendations: [],
  };

  currentEvaluation = evaluation;
  return evaluation;
}

/**
 * Get current evaluation
 *
 * @returns Current evaluation or null if none exists
 */
export function getEvaluation(): AgentEvaluation | null {
  return currentEvaluation;
}

/**
 * Reset evaluation state
 */
export function resetEvaluation(): void {
  currentEvaluation = null;
}

// =============================================================================
// Regression Detection
// =============================================================================

/**
 * Detect regressions by comparing current metrics to baseline
 *
 * @param current - Current agent metrics
 * @param baseline - Baseline metrics to compare against
 * @returns Array of regression alerts
 */
export function detectRegressions(current: AgentMetrics, baseline: AgentMetrics): RegressionAlert[] {
  const alerts: RegressionAlert[] = [];

  // Check each metric for regression
  const metrics: Array<{ name: string; current: number; baseline: number; higherIsBetter: boolean }> = [
    { name: 'taskCompletionRate', current: current.taskCompletionRate, baseline: baseline.taskCompletionRate, higherIsBetter: true },
    { name: 'averageTokens', current: current.averageTokens, baseline: baseline.averageTokens, higherIsBetter: false },
    { name: 'averageTimeMs', current: current.averageTimeMs, baseline: baseline.averageTimeMs, higherIsBetter: false },
    { name: 'toolEfficiency', current: current.toolEfficiency, baseline: baseline.toolEfficiency, higherIsBetter: true },
    { name: 'errorRate', current: current.errorRate, baseline: baseline.errorRate, higherIsBetter: false },
  ];

  for (const metric of metrics) {
    if (metric.baseline === 0) continue; // Avoid division by zero

    const percentChange = ((metric.current - metric.baseline) / metric.baseline) * 100;

    // Determine if this is a regression
    const isRegression = metric.higherIsBetter ? percentChange < -10 : percentChange > 10;

    if (isRegression) {
      // Determine severity based on percent change magnitude
      const absChange = Math.abs(percentChange);
      let severity: 'info' | 'warning' | 'critical';
      if (absChange >= 25) {
        severity = 'critical';
      } else if (absChange >= 15) {
        severity = 'warning';
      } else {
        severity = 'info';
      }

      alerts.push({
        agentRole: current.agentRole,
        metric: metric.name,
        currentValue: metric.current,
        baselineValue: metric.baseline,
        percentChange: metric.higherIsBetter ? percentChange : -percentChange,
        severity,
      });
    }
  }

  return alerts;
}

/**
 * Generate recommendations from evaluation
 *
 * @param evaluation - The evaluation to analyze
 * @returns Array of recommendation strings
 */
export function generateRecommendations(evaluation: AgentEvaluation): string[] {
  const recommendations: string[] = [];

  // Compare personas and recommend better performing ones
  const personaMetrics = Object.values(evaluation.personaMetrics);
  if (personaMetrics.length >= 2) {
    // Sort by completion rate (higher is better)
    personaMetrics.sort((a, b) => b.taskCompletionRate - a.taskCompletionRate);
    const best = personaMetrics[0];
    const worst = personaMetrics[personaMetrics.length - 1];

    if (best.taskCompletionRate > worst.taskCompletionRate + 0.1) {
      recommendations.push(
        `Consider using ${best.theme} persona for ${best.agentRole} tasks - ` +
        `${Math.round((best.taskCompletionRate - worst.taskCompletionRate) * 100)}% higher completion rate than ${worst.theme}`
      );
    }
  }

  // Check for high error rates
  for (const metrics of Object.values(evaluation.agentMetrics)) {
    if (metrics.errorRate > 0.2) {
      recommendations.push(
        `${metrics.agentRole} has ${Math.round(metrics.errorRate * 100)}% error rate - ` +
        `investigate common failure patterns`
      );
    }
  }

  // Check for low tool efficiency
  for (const metrics of Object.values(evaluation.agentMetrics)) {
    if (metrics.toolEfficiency < 0.6) {
      recommendations.push(
        `${metrics.agentRole} has low tool efficiency (${Math.round(metrics.toolEfficiency * 100)}%) - ` +
        `may be using excessive tool calls`
      );
    }
  }

  return recommendations;
}

// =============================================================================
// Job-Fair Integration
// =============================================================================

/**
 * Load job-fair baselines from path
 *
 * @param path - Path to baselines file (or mock:// for mock data)
 * @returns Array of baselines
 */
export function loadJobFairBaselines(path: string): JobFairBaseline[] {
  // Mock data for testing
  if (path.startsWith('mock://')) {
    return [
      {
        persona: 'Hamlet',
        agentRole: 'tea',
        taskType: 'test_writing',
        metrics: {
          averageTokens: 3000,
          averageTimeMs: 25000,
          completionRate: 0.95,
        },
      },
      {
        persona: 'Vorenus',
        agentRole: 'dev',
        taskType: 'implementation',
        metrics: {
          averageTokens: 5000,
          averageTimeMs: 30000,
          completionRate: 0.90,
        },
      },
    ];
  }

  // Read baselines from file
  if (!existsSync(path)) {
    console.warn(`Baselines file not found: ${path}`);
    return [];
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const data = JSON.parse(content);

    // Validate structure - expect array of baselines
    if (!Array.isArray(data)) {
      console.warn(`Baselines file must contain an array: ${path}`);
      return [];
    }

    // Validate each baseline has required fields
    const validated: JobFairBaseline[] = [];
    for (const item of data) {
      if (isValidBaseline(item)) {
        validated.push(item);
      } else {
        console.warn(`Invalid baseline entry skipped:`, item);
      }
    }

    return validated;
  } catch (error) {
    console.warn(`Failed to load baselines from ${path}:`, error);
    return [];
  }
}

/**
 * Validate a baseline object has required fields
 */
function isValidBaseline(obj: unknown): obj is JobFairBaseline {
  if (typeof obj !== 'object' || obj === null) return false;

  const b = obj as Record<string, unknown>;
  if (typeof b.persona !== 'string') return false;
  if (typeof b.agentRole !== 'string') return false;
  if (typeof b.taskType !== 'string') return false;

  const metrics = b.metrics as Record<string, unknown> | undefined;
  if (typeof metrics !== 'object' || metrics === null) return false;
  if (typeof metrics.averageTokens !== 'number') return false;
  if (typeof metrics.averageTimeMs !== 'number') return false;
  if (typeof metrics.completionRate !== 'number') return false;

  return true;
}

/**
 * Compare current metrics to baseline
 *
 * Returns a composite score: positive = overperforming, negative = underperforming
 *
 * @param current - Current agent metrics
 * @param baseline - Baseline to compare against
 * @returns Percentage difference (positive = better, negative = worse)
 */
export function compareToBaseline(current: AgentMetrics, baseline: JobFairBaseline): number {
  // Calculate weighted composite score
  // Completion rate has highest weight, then time, then tokens

  const completionDiff = (current.taskCompletionRate - baseline.metrics.completionRate) / baseline.metrics.completionRate * 100;
  const timeDiff = (baseline.metrics.averageTimeMs - current.averageTimeMs) / baseline.metrics.averageTimeMs * 100; // Less is better
  const tokenDiff = (baseline.metrics.averageTokens - current.averageTokens) / baseline.metrics.averageTokens * 100; // Less is better

  // Weighted average: completion 50%, time 30%, tokens 20%
  return completionDiff * 0.5 + timeDiff * 0.3 + tokenDiff * 0.2;
}

// =============================================================================
// Historical Storage
// =============================================================================

/**
 * Store evaluation in history
 *
 * @param evaluation - Evaluation to store
 */
export function storeEvaluation(evaluation: AgentEvaluation): void {
  evaluationHistory.push(evaluation);
}

/**
 * Get evaluation history for an agent
 *
 * @param agentRole - Agent role to get history for
 * @param limit - Maximum number of evaluations to return
 * @returns Array of evaluations containing this agent
 */
export function getEvaluationHistory(agentRole: string, limit?: number): AgentEvaluation[] {
  const relevant = evaluationHistory.filter(e => agentRole in e.agentMetrics);

  if (limit !== undefined) {
    return relevant.slice(-limit);
  }

  return relevant;
}

/**
 * Detect trend direction for an agent
 *
 * @param agentRole - Agent role to analyze
 * @returns Trend direction
 */
export function detectTrend(agentRole: string): TrendDirection {
  const history = getEvaluationHistory(agentRole, 5);

  if (history.length < 2) {
    return 'unknown';
  }

  // Compare first and last completion rates
  const first = history[0].agentMetrics[agentRole]?.taskCompletionRate ?? 0;
  const last = history[history.length - 1].agentMetrics[agentRole]?.taskCompletionRate ?? 0;

  const change = last - first;

  if (change > 0.05) {
    return 'improving';
  } else if (change < -0.05) {
    return 'declining';
  } else {
    return 'stable';
  }
}

/**
 * Reset history (for testing)
 */
export function resetHistory(): void {
  evaluationHistory = [];
}
