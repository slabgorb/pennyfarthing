/**
 * Gate handler delegation wrapper.
 *
 * Story 141-18: Replaces gate detection logic in gate-handler.ts and
 * gate checking in handoff.ts with subprocess calls to pf handoff.
 */

import { callPfJson, type CliCallOptions, type CliResult } from './pf-cli-call.js';

// ---------- resolve-gate ----------

export interface CliResolveGateData {
  status: string;
  gateType: string | null;
  gateFile?: string | null;
  nextPhase: string | null;
  nextAgent: string | null;
  assessmentFound?: boolean;
  error: string | null;
}

export type CliResolveGateResult = CliResult<CliResolveGateData>;

/**
 * Resolve a gate via pf CLI.
 * Calls: pf handoff resolve-gate <storyId> <workflow> <phase> --json
 */
export function resolveGateViaCli(
  storyId: string,
  workflow: string,
  phase: string,
  options: CliCallOptions,
): CliResolveGateResult {
  return callPfJson(
    ['handoff', 'resolve-gate', storyId, workflow, phase, '--json'],
    options,
    (raw: unknown) => {
      const r = raw as Record<string, unknown>;
      return {
        status: String(r.status ?? ''),
        gateType: r.gate_type != null ? String(r.gate_type) : null,
        gateFile: r.gate_file != null ? String(r.gate_file) : undefined,
        nextPhase: r.next_phase != null ? String(r.next_phase) : null,
        nextAgent: r.next_agent != null ? String(r.next_agent) : null,
        assessmentFound: r.assessment_found as boolean | undefined,
        error: r.error != null ? String(r.error) : null,
      };
    },
  );
}

// ---------- check-gate ----------

export interface CliGateCheckData {
  passed: boolean;
  gateType: string | null;
  message: string | null;
}

export type CliGateCheckResult = CliResult<CliGateCheckData>;

/**
 * Simple pass/fail gate check via pf CLI.
 * Calls: pf handoff check-gate --json <storyId> <workflow> <phase>
 */
export function checkGateViaCli(
  storyId: string,
  workflow: string,
  phase: string,
  options: CliCallOptions,
): CliGateCheckResult {
  return callPfJson(
    ['handoff', 'check-gate', '--json', storyId, workflow, phase],
    options,
    (raw: unknown) => {
      const r = raw as Record<string, unknown>;
      return {
        passed: Boolean(r.passed),
        gateType: r.gate_type != null ? String(r.gate_type) : null,
        message: r.message != null ? String(r.message) : null,
      };
    },
  );
}
