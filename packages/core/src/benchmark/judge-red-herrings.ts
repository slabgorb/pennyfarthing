/**
 * Judge Red Herring Detection
 * Story 43-2: Update judge for red herring detection
 *
 * Functions for building red herring prompt sections and evaluating
 * agent precision when red herrings are present in scenarios.
 */

import type { RedHerring } from './scenario-schema.js';

export interface AgentFinding {
  description: string;
  location?: string;
}

export interface RedHerringMatch {
  redHerring: RedHerring;
  finding: AgentFinding;
}

export interface RedHerringDismissal {
  redHerring: RedHerring;
  finding: AgentFinding;
  reasoning: string;
}

export interface RedHerringEvaluation {
  flagged: RedHerringMatch[];
  ignored: RedHerring[];
  dismissed: RedHerringDismissal[];
  precisionPenalty: number;
  precisionBonus: number;
  netAdjustment: number;
}

export interface RedHerringPromptSection {
  section: string;
  hasRedHerrings: boolean;
}

/**
 * Build the red herring section for a judge prompt.
 * Returns empty section when no red herrings exist (backward compat).
 */
export function buildRedHerringPromptSection(redHerrings?: RedHerring[]): RedHerringPromptSection {
  throw new Error('not implemented');
}

/**
 * Evaluate an agent's precision with respect to red herrings.
 * Matches agent findings against known red herrings to determine
 * which were incorrectly flagged, correctly ignored, or explicitly dismissed.
 */
export function evaluateRedHerringPrecision(
  redHerrings: RedHerring[],
  agentFindings: AgentFinding[],
  dismissals?: AgentFinding[],
): RedHerringEvaluation {
  throw new Error('not implemented');
}

/**
 * Calculate correctness dimension adjustment based on red herring evaluation.
 * Penalty per flagged herring, bonus per dismissed herring, neutral for ignored.
 */
export function calculateCorrectnessAdjustment(evaluation: RedHerringEvaluation): number {
  throw new Error('not implemented');
}
