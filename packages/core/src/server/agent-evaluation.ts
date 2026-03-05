/**
 * Agent evaluation — re-exports from benchmark module.
 *
 * Story 141-21: Relocated from packages/cyclist/src/agent-evaluation.ts
 * to packages/core/src/benchmark/agent-evaluation.ts. This stub re-exports
 * the real implementation plus route-specific helpers.
 */

export {
  getEvaluation,
  detectTrend,
  generateRecommendations,
} from '../benchmark/agent-evaluation.js';

export interface EvaluationResult {
  [key: string]: unknown;
}

export interface EvaluationSummary {
  [key: string]: unknown;
}

export function getEvaluationResults(): EvaluationResult[] {
  return [];
}

export function getEvaluationSummary(): EvaluationSummary | null {
  return null;
}

export function clearEvaluationResults(): void {}
