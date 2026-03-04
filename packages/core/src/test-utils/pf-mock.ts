/**
 * Shared subprocess mock helper for pf CLI calls.
 *
 * Mocks `child_process.execFileSync` to intercept calls to the `pf` binary
 * and return controlled JSON responses. Reusable across 141-17 and 141-18.
 *
 * Usage:
 *   const mock = createPfMock();
 *   mock.register(['sprint', 'story', 'show', '--json'], { id: '141-17', ... });
 *   mock.register(['theme', 'list', '--json'], [{ id: 'the-expanse', ... }]);
 *   mock.registerError(['theme', 'show', 'nonexistent', '--json'], 1, 'Theme not found');
 *
 *   // After test:
 *   mock.assertCalled(['sprint', 'story', 'show', '--json']);
 *   mock.assertCallCount(['theme', 'list', '--json'], 1);
 *   mock.restore();
 */

import { execFileSync } from 'child_process';
import { mock as nodeMock } from 'node:test';

interface PfCall {
  args: string[];
  timestamp: number;
}

interface PfMockResponse {
  args: string[];
  response: string;
  exitCode: number;
}

export interface PfMock {
  /** Register a successful response for a pf subcommand */
  register(args: string[], response: object | string): void;

  /** Register an error response for a pf subcommand */
  registerError(args: string[], exitCode: number, stderr: string): void;

  /** Assert that a specific pf subcommand was called */
  assertCalled(args: string[]): void;

  /** Assert that a specific pf subcommand was called N times */
  assertCallCount(args: string[], count: number): void;

  /** Assert that a specific pf subcommand was NOT called */
  assertNotCalled(args: string[]): void;

  /** Get all calls made to pf */
  getCalls(): PfCall[];

  /** Restore original execFileSync */
  restore(): void;
}

/**
 * Creates a mock for pf CLI subprocess calls.
 *
 * Intercepts `execFileSync` and returns controlled responses when the
 * command matches a registered `pf` subcommand. Non-pf calls pass through.
 */
export function createPfMock(): PfMock {
  const responses: PfMockResponse[] = [];
  const calls: PfCall[] = [];
  let mockFn: ReturnType<typeof nodeMock.fn> | null = null;

  // Store original
  const originalExecFileSync = execFileSync;

  function matchArgs(registered: string[], actual: string[]): boolean {
    if (registered.length !== actual.length) return false;
    return registered.every((arg, i) => arg === actual[i]);
  }

  function findResponse(args: string[]): PfMockResponse | undefined {
    return responses.find((r) => matchArgs(r.args, args));
  }

  // Create the mock implementation
  mockFn = nodeMock.fn(function mockedExecFileSync(
    file: string,
    args?: readonly string[],
    options?: Record<string, unknown>,
  ): string | Buffer {
    const argArray = args ? [...args] : [];

    // Only intercept pf calls
    if (file === 'pf' || file.endsWith('/pf')) {
      calls.push({ args: argArray, timestamp: Date.now() });

      const resp = findResponse(argArray);
      if (resp) {
        if (resp.exitCode !== 0) {
          const err = new Error(resp.response) as Error & { status: number; stderr: string };
          err.status = resp.exitCode;
          err.stderr = resp.response;
          throw err;
        }
        return resp.response;
      }

      // No registered response — throw like a real missing command would
      const err = new Error(`pf-mock: no response registered for: pf ${argArray.join(' ')}`) as Error & {
        status: number;
      };
      err.status = 1;
      throw err;
    }

    // Non-pf calls pass through to original
    return originalExecFileSync(file, args, options) as string | Buffer;
  });

  return {
    register(args: string[], response: object | string): void {
      const serialized = typeof response === 'string' ? response : JSON.stringify(response);
      responses.push({ args, response: serialized, exitCode: 0 });
    },

    registerError(args: string[], exitCode: number, stderr: string): void {
      responses.push({ args, response: stderr, exitCode });
    },

    assertCalled(args: string[]): void {
      const found = calls.some((c) => matchArgs(args, c.args));
      if (!found) {
        throw new Error(
          `Expected pf to be called with: [${args.join(', ')}]\n` +
            `Actual calls: ${calls.map((c) => `[${c.args.join(', ')}]`).join(', ') || '(none)'}`,
        );
      }
    },

    assertCallCount(args: string[], count: number): void {
      const matching = calls.filter((c) => matchArgs(args, c.args));
      if (matching.length !== count) {
        throw new Error(
          `Expected pf [${args.join(', ')}] to be called ${count} times, but was called ${matching.length} times`,
        );
      }
    },

    assertNotCalled(args: string[]): void {
      const found = calls.some((c) => matchArgs(args, c.args));
      if (found) {
        throw new Error(`Expected pf NOT to be called with: [${args.join(', ')}]`);
      }
    },

    getCalls(): PfCall[] {
      return [...calls];
    },

    restore(): void {
      if (mockFn) {
        mockFn.mock.restore();
        mockFn = null;
      }
      responses.length = 0;
      calls.length = 0;
    },
  };
}
