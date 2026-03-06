/**
 * Session state delegation wrapper.
 *
 * Story 141-18: Replaces direct session file reads in session-state.ts
 * with subprocess calls to pf handoff status --json.
 */

import { callPfJson, type CliCallOptions, type CliResult } from './pf-cli-call.js';

export interface CliWorkflowStateData {
  name: string;
  type: string;
  mode?: string;
  status: string;
  started: string;
  lastUpdated: string;
  currentStep: number;
  stepsCompleted: number[];
  notes?: string | null;
}

export interface CliTandemData {
  partner: string;
  scope?: string;
  active: boolean;
}

export interface CliSessionStateData {
  storyId: string;
  workflow: string;
  phase: string | null;
  nextAgent: string | null;
  handoffReady: boolean;
  workflowState: CliWorkflowStateData | null;
  tandem?: CliTandemData | null;
}

export type CliSessionStateResult = CliResult<CliSessionStateData>;

function mapWorkflowState(raw: unknown): CliWorkflowStateData | null {
  if (raw == null) return null;
  const r = raw as Record<string, unknown>;
  return {
    name: String(r.name ?? ''),
    type: String(r.type ?? ''),
    mode: r.mode != null ? String(r.mode) : undefined,
    status: String(r.status ?? ''),
    started: String(r.started ?? ''),
    lastUpdated: String(r.last_updated ?? ''),
    currentStep: Number(r.current_step ?? 0),
    stepsCompleted: Array.isArray(r.steps_completed) ? r.steps_completed as number[] : [],
    notes: r.notes != null ? String(r.notes) : undefined,
  };
}

function mapTandem(raw: unknown): CliTandemData | null {
  if (raw == null) return null;
  const r = raw as Record<string, unknown>;
  return {
    partner: String(r.partner ?? ''),
    scope: r.scope != null ? String(r.scope) : undefined,
    active: Boolean(r.active),
  };
}

/**
 * Get session state via pf CLI. No direct file reads.
 * Calls: pf handoff status <storyId> --json
 */
export function getSessionStateViaCli(
  storyId: string,
  options: CliCallOptions,
): CliSessionStateResult {
  return callPfJson(
    ['handoff', 'status', storyId, '--json'],
    options,
    (raw: unknown) => {
      const r = raw as Record<string, unknown>;
      return {
        storyId: String(r.story_id ?? ''),
        workflow: String(r.workflow ?? ''),
        phase: r.phase != null ? String(r.phase) : null,
        nextAgent: r.next_agent != null ? String(r.next_agent) : null,
        handoffReady: Boolean(r.handoff_ready),
        workflowState: mapWorkflowState(r.workflow_state),
        tandem: mapTandem(r.tandem),
      };
    },
  );
}
