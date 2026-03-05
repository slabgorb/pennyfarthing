/**
 * Shared utility for calling pf CLI and parsing JSON output.
 *
 * Story 141-18: Common pattern used by all delegation wrappers.
 * Each wrapper calls pf with specific args and maps the JSON response.
 */

import { execFileSync as realExecFileSync } from 'node:child_process';

export interface CliCallOptions {
  /** Injectable execFileSync for testing. Defaults to real child_process.execFileSync. */
  execFileSync?: (bin: string, args: string[]) => string;
  /** Working directory for the subprocess. */
  projectDir?: string;
}

export interface CliResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Call pf CLI with given args, parse JSON output, and return a result object.
 * Never throws — always returns {success, data?, error?}.
 */
export function callPfJson<T>(
  args: string[],
  options: CliCallOptions,
  mapFn: (raw: unknown) => T,
): CliResult<T> {
  const exec = options.execFileSync ?? ((bin: string, a: string[]) =>
    realExecFileSync(bin, a, {
      cwd: options.projectDir,
      encoding: 'utf8',
      timeout: 10000,
    })
  );

  try {
    const output = exec('pf', args);
    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch {
      return { success: false, error: `Invalid JSON from pf: ${output.slice(0, 200)}` };
    }
    return { success: true, data: mapFn(parsed) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
