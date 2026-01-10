/**
 * Agent Evaluation Framework - Story 19-9
 *
 * Tracks and compares agent performance across tasks using telemetry data.
 * Computes quality metrics beyond just token counts including completion rates,
 * tool efficiency, and regression detection.
 *
 * Pattern: In-memory state management following tdd-metrics.ts
 */
import type { AgentSpan, ToolSpan, AgentMetrics, PersonaMetrics, TaskMetrics, AgentEvaluation, RegressionAlert, JobFairBaseline, TrendDirection } from './telemetry-types.js';
/**
 * Calculate completion rate from spans
 * completed = 1.0, running = 0.5, error = 0.0
 *
 * @param spans - Array of agent spans to analyze
 * @returns Completion rate between 0.0 and 1.0
 */
export declare function calculateCompletionRate(spans: AgentSpan[]): number;
/**
 * Calculate error rate from spans
 *
 * @param spans - Array of agent spans to analyze
 * @returns Error rate between 0.0 and 1.0
 */
export declare function calculateErrorRate(spans: AgentSpan[]): number;
/**
 * Calculate average tokens from spans
 *
 * @param spans - Array of agent spans to analyze
 * @returns Average total tokens (input + output)
 */
export declare function calculateAverageTokens(spans: AgentSpan[]): number;
/**
 * Calculate average time from spans
 *
 * @param spans - Array of agent spans to analyze
 * @returns Average duration in milliseconds
 */
export declare function calculateAverageTime(spans: AgentSpan[]): number;
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
export declare function calculateToolEfficiency(toolSpans: ToolSpan[], taskType: string): number;
/**
 * Aggregate spans by agent role
 *
 * @param spans - Array of agent spans to aggregate
 * @returns Record of agent role to metrics
 */
export declare function aggregateByAgent(spans: AgentSpan[]): Record<string, AgentMetrics>;
/**
 * Aggregate spans by persona/theme
 *
 * @param spans - Array of agent spans to aggregate
 * @returns Record of theme to persona metrics
 */
export declare function aggregateByPersona(spans: AgentSpan[]): Record<string, PersonaMetrics>;
/**
 * Aggregate spans by task type
 *
 * @param spans - Array of agent spans to aggregate
 * @returns Record of task type to metrics
 */
export declare function aggregateByTaskType(spans: AgentSpan[]): Record<string, TaskMetrics>;
/**
 * Create an evaluation from agent spans
 *
 * @param spans - Array of agent spans to analyze
 * @returns The created AgentEvaluation
 */
export declare function createEvaluation(spans: AgentSpan[]): AgentEvaluation;
/**
 * Get current evaluation
 *
 * @returns Current evaluation or null if none exists
 */
export declare function getEvaluation(): AgentEvaluation | null;
/**
 * Reset evaluation state
 */
export declare function resetEvaluation(): void;
/**
 * Detect regressions by comparing current metrics to baseline
 *
 * @param current - Current agent metrics
 * @param baseline - Baseline metrics to compare against
 * @returns Array of regression alerts
 */
export declare function detectRegressions(current: AgentMetrics, baseline: AgentMetrics): RegressionAlert[];
/**
 * Generate recommendations from evaluation
 *
 * @param evaluation - The evaluation to analyze
 * @returns Array of recommendation strings
 */
export declare function generateRecommendations(evaluation: AgentEvaluation): string[];
/**
 * Load job-fair baselines from path
 *
 * @param path - Path to baselines file (or mock:// for mock data)
 * @returns Array of baselines
 */
export declare function loadJobFairBaselines(path: string): JobFairBaseline[];
/**
 * Compare current metrics to baseline
 *
 * Returns a composite score: positive = overperforming, negative = underperforming
 *
 * @param current - Current agent metrics
 * @param baseline - Baseline to compare against
 * @returns Percentage difference (positive = better, negative = worse)
 */
export declare function compareToBaseline(current: AgentMetrics, baseline: JobFairBaseline): number;
/**
 * Store evaluation in history
 *
 * @param evaluation - Evaluation to store
 */
export declare function storeEvaluation(evaluation: AgentEvaluation): void;
/**
 * Get evaluation history for an agent
 *
 * @param agentRole - Agent role to get history for
 * @param limit - Maximum number of evaluations to return
 * @returns Array of evaluations containing this agent
 */
export declare function getEvaluationHistory(agentRole: string, limit?: number): AgentEvaluation[];
/**
 * Detect trend direction for an agent
 *
 * @param agentRole - Agent role to analyze
 * @returns Trend direction
 */
export declare function detectTrend(agentRole: string): TrendDirection;
/**
 * Reset history (for testing)
 */
export declare function resetHistory(): void;
//# sourceMappingURL=agent-evaluation.d.ts.map