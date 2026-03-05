/**
 * Handoff delegation wrapper.
 *
 * Story 141-18: Replaces phase transition, status reads, and marker emission
 * in handoff.ts with subprocess calls to pf handoff subcommands.
 */

import { callPfJson, type CliCallOptions, type CliResult } from './pf-cli-call.js';

// ---------- complete-phase ----------

export interface CliCompletePhaseData {
  status: string;
  sessionFile?: string;
  error?: string | null;
}

export type CliCompletePhaseResult = CliResult<CliCompletePhaseData>;

/**
 * Complete a workflow phase transition via pf CLI.
 * Calls: pf handoff complete-phase <storyId> <workflow> <fromPhase> <toPhase> <gateType> --json
 */
export function completePhaseViaCli(
  storyId: string,
  workflow: string,
  fromPhase: string,
  toPhase: string,
  gateType: string,
  options: CliCallOptions,
): CliCompletePhaseResult {
  return callPfJson(
    ['handoff', 'complete-phase', storyId, workflow, fromPhase, toPhase, gateType, '--json'],
    options,
    (raw: unknown) => {
      const r = raw as Record<string, unknown>;
      return {
        status: String(r.status ?? ''),
        sessionFile: r.session_file != null ? String(r.session_file) : undefined,
        error: r.error != null ? String(r.error) : null,
      };
    },
  );
}

// ---------- status ----------

export interface CliHandoffStatusData {
  storyId: string;
  workflow: string;
  phase: string;
  nextAgent: string | null;
  handoffReady: boolean;
}

export type CliHandoffStatus = CliResult<CliHandoffStatusData>;

/**
 * Get handoff status for a story via pf CLI.
 * Calls: pf handoff status <storyId> --json
 */
export function getHandoffStatusViaCli(
  storyId: string,
  options: CliCallOptions,
): CliHandoffStatus {
  return callPfJson(
    ['handoff', 'status', storyId, '--json'],
    options,
    (raw: unknown) => {
      const r = raw as Record<string, unknown>;
      return {
        storyId: String(r.story_id ?? ''),
        workflow: String(r.workflow ?? ''),
        phase: String(r.phase ?? ''),
        nextAgent: r.next_agent != null ? String(r.next_agent) : null,
        handoffReady: Boolean(r.handoff_ready),
      };
    },
  );
}

// ---------- marker ----------

export interface CliMarkerData {
  relay: boolean;
  invoke: string;
  fallback: string;
  contextPercent: number;
}

export type CliMarkerResult = CliResult<CliMarkerData>;

/**
 * Emit a handoff marker via pf CLI.
 * Calls: pf handoff marker <agent> --json
 */
export function emitMarkerViaCli(
  agent: string,
  options: CliCallOptions,
): CliMarkerResult {
  return callPfJson(
    ['handoff', 'marker', agent, '--json'],
    options,
    (raw: unknown) => {
      const r = raw as Record<string, unknown>;
      return {
        relay: Boolean(r.relay),
        invoke: String(r.invoke ?? ''),
        fallback: String(r.fallback ?? ''),
        contextPercent: Number(r.context_percent ?? 0),
      };
    },
  );
}
