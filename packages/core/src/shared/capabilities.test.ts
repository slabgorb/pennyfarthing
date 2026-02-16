import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  detectTeamsCapability,
  isTeamsEnvVarSet,
  isInteractiveMode,
  getTeammateMode,
  checkTeamsCapability,
  resolvePhaseExecution,
  type CapabilityResult,
  type TeamsCapabilityResult,
  type CapabilityCheckResult,
  type PhaseExecutionStrategy,
} from './capabilities.js';

describe('capabilities', () => {
  // Save and restore env vars between tests
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS =
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  });

  afterEach(() => {
    if (savedEnv.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS !== undefined) {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS =
        savedEnv.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
    } else {
      delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
    }
  });

  // =========================================================================
  // AC1: Check CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS environment variable
  // =========================================================================
  describe('isTeamsEnvVarSet', () => {
    it('should return true when env var is set to "true"', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = 'true';
      assert.strictEqual(isTeamsEnvVarSet(), true);
    });

    it('should return true when env var is set to "1"', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
      assert.strictEqual(isTeamsEnvVarSet(), true);
    });

    it('should return false when env var is unset', () => {
      delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
      assert.strictEqual(isTeamsEnvVarSet(), false);
    });

    it('should return false when env var is "false"', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = 'false';
      assert.strictEqual(isTeamsEnvVarSet(), false);
    });

    it('should return false when env var is empty string', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '';
      assert.strictEqual(isTeamsEnvVarSet(), false);
    });

    it('should return false when env var is "0"', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '0';
      assert.strictEqual(isTeamsEnvVarSet(), false);
    });
  });

  // =========================================================================
  // AC2: Detect interactive vs -p mode
  // =========================================================================
  describe('isInteractiveMode', () => {
    it('should return a boolean', () => {
      const result = isInteractiveMode();
      assert.strictEqual(typeof result, 'boolean');
    });

    // Note: Full interactive mode testing requires mocking process.argv
    // and TTY state. The implementation should check:
    // - process.argv does not contain '-p'
    // - process.stdin.isTTY is true
    // These are environment-dependent and tested via integration tests.
    // The unit test verifies the function exists and returns boolean.
  });

  // =========================================================================
  // AC3: Detect teammateMode setting
  // =========================================================================
  describe('getTeammateMode', () => {
    it('should return null when no config path is provided and no default exists', () => {
      // With no config, should return null (not configured)
      const result = getTeammateMode('/nonexistent/path/config.json');
      assert.strictEqual(result, null);
    });

    it('should return "in-process" or "tmux" when teammateMode is configured', () => {
      // This test validates the return type constraint
      const result = getTeammateMode();
      // Must be one of the valid values or null
      assert.ok(
        result === null || result === 'in-process' || result === 'tmux',
        `Expected null, "in-process", or "tmux" but got: ${result}`,
      );
    });
  });

  // =========================================================================
  // AC4: Expose detection function returning result object
  // =========================================================================
  describe('detectTeamsCapability', () => {
    it('should return a CapabilityResult with success field', () => {
      const result: CapabilityResult = detectTeamsCapability();
      assert.ok('success' in result, 'Result must have success field');
      assert.strictEqual(typeof result.success, 'boolean');
    });

    it('should return data with all required fields when successful', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = 'true';
      const result: CapabilityResult = detectTeamsCapability();

      assert.strictEqual(result.success, true, 'Should succeed when env var is set');
      assert.ok(result.data, 'Should have data field on success');

      const data: TeamsCapabilityResult = result.data!;
      assert.ok('teamsAvailable' in data, 'data must have teamsAvailable');
      assert.ok('envVarSet' in data, 'data must have envVarSet');
      assert.ok('isInteractive' in data, 'data must have isInteractive');
      assert.ok('teammateMode' in data, 'data must have teammateMode');
    });

    it('should report envVarSet=true when env var is set', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = 'true';
      const result = detectTeamsCapability();
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data!.envVarSet, true);
    });

    it('should report envVarSet=false when env var is unset', () => {
      delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
      const result = detectTeamsCapability();
      // Should still succeed (detection itself works), but envVarSet=false
      assert.strictEqual(result.success, true, 'Detection should always succeed');
      assert.strictEqual(result.data!.envVarSet, false);
    });

    it('should include reason when teams are unavailable', () => {
      delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
      const result = detectTeamsCapability();
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data!.teamsAvailable, false);
      assert.ok(result.data!.reason, 'Should provide reason when teams unavailable');
      assert.strictEqual(typeof result.data!.reason, 'string');
    });

    it('should not have error field on successful detection', () => {
      const result = detectTeamsCapability();
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.error, undefined);
    });

    it('should detect teamsAvailable=false when env var is missing', () => {
      delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
      const result = detectTeamsCapability();
      assert.strictEqual(result.data!.teamsAvailable, false);
    });
  });

  // =========================================================================
  // AC5: pennyfarthing doctor reports teams capability status
  // =========================================================================
  describe('checkTeamsCapability', () => {
    it('should return an array of check results', () => {
      const results: CapabilityCheckResult[] = checkTeamsCapability();
      assert.ok(Array.isArray(results), 'Should return an array');
      assert.ok(results.length > 0, 'Should return at least one check result');
    });

    it('should return results with valid CheckResult shape', () => {
      const results = checkTeamsCapability();
      for (const result of results) {
        assert.ok('name' in result, 'Each result must have name');
        assert.ok('status' in result, 'Each result must have status');
        assert.ok(
          ['pass', 'warn', 'fail'].includes(result.status),
          `Status must be pass/warn/fail, got: ${result.status}`,
        );
      }
    });

    it('should report pass when env var is set', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = 'true';
      const results = checkTeamsCapability();
      const envCheck = results.find((r) => r.name.toLowerCase().includes('env') ||
        r.name.toLowerCase().includes('teams'));
      assert.ok(envCheck, 'Should have a check for teams env var');
      assert.strictEqual(envCheck!.status, 'pass');
    });

    it('should report warn when env var is not set', () => {
      delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
      const results = checkTeamsCapability();
      const envCheck = results.find((r) => r.name.toLowerCase().includes('env') ||
        r.name.toLowerCase().includes('teams'));
      assert.ok(envCheck, 'Should have a check for teams env var');
      assert.strictEqual(
        envCheck!.status,
        'warn',
        'Missing env var should be a warning, not failure',
      );
    });

    it('should include detail message in each result', () => {
      const results = checkTeamsCapability();
      for (const result of results) {
        assert.ok(result.detail, `Check "${result.name}" should have a detail message`);
      }
    });
  });

  // =========================================================================
  // AC6: Graceful degradation for phases with team: block
  // =========================================================================
  describe('resolvePhaseExecution', () => {
    it('should return team mode when teams are available and phase has team block', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = 'true';
      const phaseConfig = {
        team: { agents: ['tea', 'architect'], strategy: 'parallel' },
      };
      const result: PhaseExecutionStrategy = resolvePhaseExecution(phaseConfig);
      assert.strictEqual(result.mode, 'team');
      assert.strictEqual(result.degraded, false);
    });

    it('should degrade to solo-tandem when teams unavailable but phase has team block', () => {
      delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
      const phaseConfig = {
        team: { agents: ['tea', 'architect'], strategy: 'parallel' },
      };
      const result: PhaseExecutionStrategy = resolvePhaseExecution(phaseConfig);
      assert.strictEqual(result.mode, 'solo-tandem');
      assert.strictEqual(result.degraded, true);
      assert.ok(result.reason, 'Should explain why degradation occurred');
    });

    it('should return solo mode when phase has no team block', () => {
      const phaseConfig = {};
      const result: PhaseExecutionStrategy = resolvePhaseExecution(phaseConfig);
      assert.strictEqual(result.mode, 'solo');
      assert.strictEqual(result.degraded, false);
    });

    it('should not mark as degraded when phase has no team block regardless of capability', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = 'true';
      const phaseConfig = {};
      const result: PhaseExecutionStrategy = resolvePhaseExecution(phaseConfig);
      assert.strictEqual(result.degraded, false);
    });

    it('should include reason string when degraded', () => {
      delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
      const phaseConfig = { team: { agents: ['dev'] } };
      const result = resolvePhaseExecution(phaseConfig);
      assert.strictEqual(result.degraded, true);
      assert.strictEqual(typeof result.reason, 'string');
      assert.ok(result.reason!.length > 0, 'Reason should not be empty');
    });
  });
});
