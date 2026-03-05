/**
 * Workflow routing delegation wrapper.
 *
 * Story 141-18: Replaces the 5-priority routing algorithm in workflow-router.ts
 * with a thin subprocess call to `pf workflow route --json`.
 */

import { callPfJson, type CliCallOptions, type CliResult } from './pf-cli-call.js';

export interface CliRoutingData {
  workflow: string;
  reason: string;
}

export type CliRoutingResult = CliResult<CliRoutingData>;

/**
 * Route a story to a workflow via pf CLI.
 * Calls: pf workflow route <storyId> --json
 */
export function routeStoryViaCli(
  storyId: string,
  options: CliCallOptions,
): CliRoutingResult {
  return callPfJson(
    ['workflow', 'route', storyId, '--json'],
    options,
    (raw: unknown) => {
      const r = raw as Record<string, unknown>;
      return {
        workflow: String(r.workflow ?? ''),
        reason: String(r.reason ?? ''),
      };
    },
  );
}
