/**
 * Finalize Run Validator
 * Story 44-3: Multi-judge validation for benchmark results
 *
 * Validates benchmark run data (single-judge and multi-judge formats)
 * before storage. This is the guardrail — real data or no data.
 */

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
  classification: string;
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
// Stub implementations — will fail tests (RED state)
// ============================================================================

export function validateJudgeVerdict(_verdict: JudgeVerdict): Result<boolean> {
  return { success: false, error: 'not implemented' };
}

export function validateFinalizeRun(_input: FinalizeRunInput): Result<ValidationResult> {
  return { success: false, error: 'not implemented' };
}

export function aggregateMultiJudgeScores(_scores: Record<string, number>[]): Result<{ mean: number }> {
  return { success: false, error: 'not implemented' };
}

export function isMultiJudge(_input: FinalizeRunInput): boolean {
  return false;
}
