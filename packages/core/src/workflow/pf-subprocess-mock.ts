/**
 * Test helper: Mock pf CLI subprocess calls
 *
 * Story 141-18: Provides a way to mock execFileSync/execSync calls to `pf`
 * so that tests can verify CLI delegation without requiring the real pf binary.
 *
 * Usage:
 *   import { PfMock } from './pf-subprocess-mock.js';
 *
 *   const mock = new PfMock();
 *   mock.onCommand(['workflow', 'route', '141-18', '--json'], {
 *     workflow: 'tdd',
 *     reason: 'explicit-tag',
 *   });
 *   mock.onCommand(['handoff', 'resolve-gate', '--json'], {
 *     passed: true,
 *     gateType: 'tests_pass',
 *     message: 'All tests pass',
 *   });
 *
 *   // In the module under test, replace execFileSync with mock.execFileSync
 *   const result = mock.execFileSync('pf', ['workflow', 'route', '141-18', '--json']);
 *   // result is JSON.stringify of the registered response
 */

export interface PfMockResponse {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

interface RegisteredCommand {
  args: string[];
  response: PfMockResponse;
}

export class PfMock {
  private commands: RegisteredCommand[] = [];
  private calls: { bin: string; args: string[] }[] = [];

  /**
   * Register a mock response for a specific pf command.
   * @param args - The arguments to match (e.g., ['workflow', 'route', '141-18', '--json'])
   * @param data - The JSON data to return as stdout, or a PfMockResponse for full control
   */
  onCommand(args: string[], data: unknown): void {
    const response: PfMockResponse =
      typeof data === 'object' && data !== null && 'exitCode' in data
        ? (data as PfMockResponse)
        : { exitCode: 0, stdout: JSON.stringify(data), stderr: '' };
    this.commands.push({ args, response });
  }

  /**
   * Register a failing command response.
   */
  onCommandError(args: string[], error: string, exitCode = 1): void {
    this.commands.push({
      args,
      response: { exitCode, stdout: '', stderr: error },
    });
  }

  /**
   * Mock replacement for execFileSync.
   * Matches registered commands by prefix (registered args must be a prefix of actual args).
   */
  execFileSync(bin: string, args: string[]): string {
    this.calls.push({ bin, args });

    const match = this.commands.find((cmd) =>
      cmd.args.every((arg, i) => args[i] === arg)
    );

    if (!match) {
      const err = new Error(
        `PfMock: No registered command for: ${bin} ${args.join(' ')}`
      ) as Error & { status: number; stderr: string };
      err.status = 127;
      err.stderr = `Command not found: ${bin} ${args.join(' ')}`;
      throw err;
    }

    if (match.response.exitCode !== 0) {
      const err = new Error(
        match.response.stderr || `Process exited with code ${match.response.exitCode}`
      ) as Error & { status: number; stderr: string; stdout: string };
      err.status = match.response.exitCode!;
      err.stderr = match.response.stderr || '';
      err.stdout = match.response.stdout || '';
      throw err;
    }

    return match.response.stdout || '';
  }

  /**
   * Get all recorded calls for assertions.
   */
  getCalls(): { bin: string; args: string[] }[] {
    return [...this.calls];
  }

  /**
   * Get calls matching a specific command prefix.
   */
  getCallsMatching(prefix: string[]): { bin: string; args: string[] }[] {
    return this.calls.filter((call) =>
      prefix.every((arg, i) => call.args[i] === arg)
    );
  }

  /**
   * Assert that a specific command was called.
   */
  assertCalled(prefix: string[]): void {
    const matching = this.getCallsMatching(prefix);
    if (matching.length === 0) {
      throw new Error(
        `Expected pf command to be called with args starting with: ${prefix.join(' ')}\n` +
        `Actual calls: ${this.calls.map((c) => c.args.join(' ')).join('\n  ')}`
      );
    }
  }

  /**
   * Assert that a specific command was NOT called.
   */
  assertNotCalled(prefix: string[]): void {
    const matching = this.getCallsMatching(prefix);
    if (matching.length > 0) {
      throw new Error(
        `Expected pf command NOT to be called with args starting with: ${prefix.join(' ')}\n` +
        `But it was called ${matching.length} time(s)`
      );
    }
  }

  /**
   * Reset all registered commands and recorded calls.
   */
  reset(): void {
    this.commands = [];
    this.calls = [];
  }
}
