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

const PENALTY_PER_FLAGGED = 1;
const BONUS_PER_DISMISSED = 0.5;

/**
 * Build the red herring section for a judge prompt.
 * Returns empty section when no red herrings exist (backward compat).
 */
export function buildRedHerringPromptSection(redHerrings?: RedHerring[]): RedHerringPromptSection {
  if (!redHerrings || redHerrings.length === 0) {
    return { section: '', hasRedHerrings: false };
  }

  const items = redHerrings.map((rh, i) =>
    `${i + 1}. **${rh.description}** (${rh.trap_type}) at ${rh.location}`
  ).join('\n');

  const section = `## Red Herrings (Precision Check)

The following elements in the code are deliberately misleading — they look like issues but are actually correct or intentional. Use these to evaluate agent precision:

${items}

**Scoring:**
- Agent flags a red herring as a real issue → correctness penalty
- Agent ignores a red herring → neutral (no penalty, no bonus)
- Agent explicitly notes a red herring is not an issue with reasoning → bonus credit`;

  return { section, hasRedHerrings: true };
}

/**
 * Check if an agent finding matches a red herring by location.
 */
function findMatchingHerring(redHerrings: RedHerring[], finding: AgentFinding): RedHerring | undefined {
  if (!finding.location) return undefined;
  return redHerrings.find(rh => rh.location === finding.location);
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
  const flagged: RedHerringMatch[] = [];
  const dismissed: RedHerringDismissal[] = [];
  const matchedLocations = new Set<string>();

  // Check agent findings for flagged red herrings
  for (const finding of agentFindings) {
    const match = findMatchingHerring(redHerrings, finding);
    if (match) {
      flagged.push({ redHerring: match, finding });
      matchedLocations.add(match.location);
    }
  }

  // Check dismissals
  if (dismissals) {
    for (const dismissal of dismissals) {
      const match = findMatchingHerring(redHerrings, dismissal);
      if (match && !matchedLocations.has(match.location)) {
        dismissed.push({ redHerring: match, finding: dismissal, reasoning: dismissal.description });
        matchedLocations.add(match.location);
      }
    }
  }

  // Remaining are ignored
  const ignored = redHerrings.filter(rh => !matchedLocations.has(rh.location));

  const precisionPenalty = flagged.length * PENALTY_PER_FLAGGED;
  const precisionBonus = dismissed.length * BONUS_PER_DISMISSED;
  const netAdjustment = precisionBonus - precisionPenalty;

  return { flagged, ignored, dismissed, precisionPenalty, precisionBonus, netAdjustment };
}

/**
 * Calculate correctness dimension adjustment based on red herring evaluation.
 * Penalty per flagged herring, bonus per dismissed herring, neutral for ignored.
 */
export function calculateCorrectnessAdjustment(evaluation: RedHerringEvaluation): number {
  return evaluation.precisionBonus - evaluation.precisionPenalty;
}
