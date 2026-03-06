/**
 * Workflow schema validation delegation wrapper.
 *
 * Story 141-18: Replaces TypeScript YAML validation in workflow-schema.ts
 * with subprocess call to pf workflow validate --json.
 */

import { callPfJson, type CliCallOptions, type CliResult } from './pf-cli-call.js';

export interface CliValidationData {
  valid: boolean;
  workflow: Record<string, unknown> | null;
  errors: Array<{ field: string; message: string }> | null;
}

export type CliValidationResult = CliResult<CliValidationData>;

export function validateWorkflowViaCli(
  workflowName: string,
  options: CliCallOptions,
): CliValidationResult {
  return callPfJson(
    ['workflow', 'validate', workflowName, '--json'],
    options,
    (raw: unknown) => {
      const r = raw as Record<string, unknown>;
      return {
        valid: Boolean(r.valid),
        workflow: r.workflow as Record<string, unknown> | null ?? null,
        errors: Array.isArray(r.errors) ? r.errors as Array<{ field: string; message: string }> : null,
      };
    },
  );
}
