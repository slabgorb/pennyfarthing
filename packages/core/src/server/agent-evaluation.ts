/**
 * Agent evaluation stub for server module.
 * Provides functions used by evaluation API route without cyclist dependency.
 */

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

export function getEvaluation(): EvaluationResult | null { return null; }
export function detectTrend(_results: EvaluationResult[]): unknown { return null; }
export function generateRecommendations(_results: EvaluationResult[]): string[] { return []; }
