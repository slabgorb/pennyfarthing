/**
 * Workflow executor delegation wrapper.
 *
 * Story 141-18: Replaces stepped workflow state machine in workflow-executor.ts
 * with subprocess calls to pf workflow subcommands.
 */

import { callPfJson, type CliCallOptions, type CliResult } from './pf-cli-call.js';

export interface CliWorkflowStatusData {
  name: string;
  type: string;
  currentStep: number;
  totalSteps: number;
  stepsCompleted: number[];
  completionPercent: number;
  status: string;
  started: string;
  lastUpdated: string;
}

export type CliWorkflowStatusResult = CliResult<CliWorkflowStatusData>;

export function getWorkflowStatusViaCli(
  storyId: string,
  options: CliCallOptions,
): CliWorkflowStatusResult {
  return callPfJson(
    ['workflow', 'status', storyId, '--json'],
    options,
    (raw: unknown) => {
      const r = raw as Record<string, unknown>;
      return {
        name: String(r.name ?? ''),
        type: String(r.type ?? ''),
        currentStep: Number(r.current_step ?? 0),
        totalSteps: Number(r.total_steps ?? 0),
        stepsCompleted: Array.isArray(r.steps_completed) ? r.steps_completed as number[] : [],
        completionPercent: Number(r.completion_percent ?? 0),
        status: String(r.status ?? ''),
        started: String(r.started ?? ''),
        lastUpdated: String(r.last_updated ?? ''),
      };
    },
  );
}

export interface CliStartWorkflowData {
  workflow: string;
  step: number;
  totalSteps?: number;
  status?: string;
}

export type CliStartWorkflowResult = CliResult<CliStartWorkflowData>;

export function startWorkflowViaCli(
  workflowName: string,
  storyId: string,
  options: CliCallOptions,
): CliStartWorkflowResult {
  return callPfJson(
    ['workflow', 'start', workflowName, storyId, '--json'],
    options,
    (raw: unknown) => {
      const r = raw as Record<string, unknown>;
      return {
        workflow: String(r.workflow ?? ''),
        step: Number(r.step ?? 0),
        totalSteps: r.total_steps != null ? Number(r.total_steps) : undefined,
        status: r.status != null ? String(r.status) : undefined,
      };
    },
  );
}
