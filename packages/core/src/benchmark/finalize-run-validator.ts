/**
 * Finalize Run Validator
 * Story 44-3: Multi-judge validation for benchmark results
 *
 * Validates benchmark run data (single-judge and multi-judge formats)
 * before storage. This is the guardrail — real data or no data.
 */

import { classifyAlpha } from './agreement.js';

// ============================================================================
// Types
// ============================================================================

export interface AgentData {
  spec: string;
  cli_timestamp: string;
  response_text: string;
  input_tokens: number;
  output_tokens: number;
}

export interface JudgeVerdict {
  cli_timestamp: string;
  response_text: string;
  input_tokens?: number;
  output_tokens?: number;
}

export interface MultiJudgeSection {
  alpha_mean: number;
  alpha_min: number;
  alpha_max: number;
  classification: 'reliable' | 'acceptable' | 'unreliable';
}

export interface FinalizeRunInput {
  type: 'solo' | 'duel' | 'relay';
  timestamp: string;
  scenario: { name: string; title: string };
  agents: AgentData[];
  judge?: JudgeVerdict;
  judges?: JudgeVerdict[];
  scores: Record<string, number> | Record<string, number>[];
  output_path: string;
}

interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ValidationResult {
  validated: boolean;
  agents_validated: number;
  judges_validated: number;
  scores_verified: boolean;
  timestamp_sane: boolean;
  multi_judge?: MultiJudgeSection;
  warnings: string[];
  statistics: {
    mean: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T/;
const SCORE_MARKER_RE = /WEIGHTED_TOTAL|RATING:/;
const SCORE_RANGE = 99; // scores 1-100

// ============================================================================
// Public API
// ============================================================================

export function isMultiJudge(input: FinalizeRunInput): boolean {
  return Array.isArray(input.judges) && input.judges.length > 0;
}

export function validateJudgeVerdict(verdict: JudgeVerdict): Result<boolean> {
  if (!verdict.cli_timestamp || !ISO8601_RE.test(verdict.cli_timestamp)) {
    return { success: false, error: 'Invalid or missing timestamp' };
  }
  if (!verdict.response_text || verdict.response_text.length < 100) {
    return { success: false, error: 'Response too short (minimum 100 characters)' };
  }
  if (!SCORE_MARKER_RE.test(verdict.response_text)) {
    return { success: false, error: 'Missing score marker (WEIGHTED_TOTAL or RATING:)' };
  }
  return { success: true, data: true };
}

export function aggregateMultiJudgeScores(scores: Record<string, number>[]): Result<{ mean: number }> {
  if (!scores || scores.length === 0) {
    return { success: false, error: 'No scores provided' };
  }
  const specs = Object.keys(scores[0]);
  if (specs.length === 0) {
    return { success: false, error: 'No specs in scores' };
  }
  let total = 0;
  for (const spec of specs) {
    let specSum = 0;
    for (const entry of scores) {
      specSum += entry[spec] ?? 0;
    }
    total += specSum / scores.length;
  }
  return { success: true, data: { mean: Math.round((total / specs.length) * 100) / 100 } };
}

export function validateFinalizeRun(input: FinalizeRunInput): Result<ValidationResult> {
  const warnings: string[] = [];

  // Validate agents
  for (const agent of input.agents) {
    const r = validateAgent(agent);
    if (!r.success) return { success: false, error: r.error };
  }

  const multi = isMultiJudge(input);

  if (multi) {
    const judges = input.judges!;
    const scores = input.scores as Record<string, number>[];
    if (!Array.isArray(scores) || scores.length !== judges.length) {
      return { success: false, error: 'Scores array length must match judges array length' };
    }
    for (let i = 0; i < judges.length; i++) {
      const r = validateJudgeVerdict(judges[i]);
      if (!r.success) return { success: false, error: `Judge ${i}: ${r.error}` };
    }
    const agreement = computeAgreement(scores);
    if (agreement.classification === 'unreliable') {
      warnings.push(
        `WARNING: Low inter-judge agreement (alpha=${agreement.alpha_mean}). Consider revising rubric anchors.`
      );
    }
    const agg = aggregateMultiJudgeScores(scores);
    if (!agg.success) return { success: false, error: agg.error };
    return {
      success: true,
      data: {
        validated: true,
        agents_validated: input.agents.length,
        judges_validated: judges.length,
        scores_verified: true,
        timestamp_sane: true,
        multi_judge: agreement,
        warnings,
        statistics: { mean: agg.data!.mean },
      },
    };
  }

  // Single judge
  if (!input.judge) {
    return { success: false, error: 'No judge or judges provided' };
  }
  const r = validateJudgeVerdict(input.judge);
  if (!r.success) return { success: false, error: r.error };

  const scores = input.scores as Record<string, number>;
  const vals = Object.values(scores);
  const mean = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

  return {
    success: true,
    data: {
      validated: true,
      agents_validated: input.agents.length,
      judges_validated: 1,
      scores_verified: true,
      timestamp_sane: true,
      warnings,
      statistics: { mean },
    },
  };
}

// ============================================================================
// Internal helpers
// ============================================================================

function validateAgent(agent: AgentData): Result<boolean> {
  if (!agent.cli_timestamp || !ISO8601_RE.test(agent.cli_timestamp)) {
    return { success: false, error: 'Invalid agent timestamp' };
  }
  if (!agent.response_text || agent.response_text.length < 200) {
    return { success: false, error: 'Agent response too short (minimum 200 characters)' };
  }
  if (agent.input_tokens <= 0) {
    return { success: false, error: 'Invalid input tokens' };
  }
  if (agent.output_tokens <= 0) {
    return { success: false, error: 'Invalid output tokens' };
  }
  return { success: true, data: true };
}

function computeAgreement(scores: Record<string, number>[]): MultiJudgeSection {
  const specs = Object.keys(scores[0]);
  const alphas: number[] = [];

  for (const spec of specs) {
    const values = scores.map(s => s[spec]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
    const alpha = Math.max(0, Math.round((1 - (2 * std / SCORE_RANGE)) * 10000) / 10000);
    alphas.push(alpha);
  }

  const alphaMean = Math.round((alphas.reduce((a, b) => a + b, 0) / alphas.length) * 10000) / 10000;
  const { classification } = classifyAlpha(alphaMean);

  return {
    alpha_mean: alphaMean,
    alpha_min: Math.min(...alphas),
    alpha_max: Math.max(...alphas),
    classification,
  };
}
