/**
 * Tests for Story 86-10: Phase-scoped team lifecycle + gate hooks
 *
 * RED state tests for native Agent Teams lifecycle in phased workflows.
 * These tests cover all 9 acceptance criteria:
 *
 * AC1: Lead creates team on phase entry when workflow has team block
 * AC2: Lead spawns teammates per workflow YAML teammates config
 * AC3: TaskCompleted hook enforces gate checks
 * AC4: TeammateIdle hook validates teammate work
 * AC5: Lead shuts down all teammates before exit protocol
 * AC6: TeamDelete runs before pf handoff (full cleanup before marker)
 * AC7: Session file updated with teammate activity summary
 * AC8: Sidecar file locking for concurrent teammate writes
 * AC9: Graceful degradation when teammate crashes
 *
 * Run with: pnpm build && pnpm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { WorkflowPhase, TeamConfig } from './workflow-schema.js';

import {
  createTeam,
  spawnTeammates,
  shutdownAllTeammates,
  cleanupTeam,
  checkGateOnTaskCompleted,
  checkGateOnTeammateIdle,
  generateTeamSummary,
  acquireSidecarLock,
  releaseSidecarLock,
  getActiveTeam,
  _resetForTesting,
} from './team-lifecycle.js';

import type {
  TeamHandle,
  TeammateHandle,
  CreateTeamParams,
  TeamProcessAdapter,
  GateCheckResult,
  TeamActivitySummary,
  SidecarLock,
} from './team-lifecycle.js';

// Get directory for test fixtures
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(__dirname, '__test_team_lifecycle__');

// =============================================================================
// Test Fixtures
// =============================================================================

/** Phase with team config (Dev + Architect) */
const PHASE_WITH_TEAM: WorkflowPhase = {
  name: 'green',
  agent: 'dev',
  input: ['failing_tests'],
  output: ['implementation', 'passing_tests'],
  team: {
    teammates: [
      { agent: 'architect', task: 'Review implementation approach and patterns' },
      { agent: 'tea', task: 'Verify tests stay green, flag regressions' },
    ],
    model: 'sonnet',
    display: 'in-process',
  },
};

/** Phase with team config (single teammate) */
const PHASE_WITH_SINGLE_TEAMMATE: WorkflowPhase = {
  name: 'review',
  agent: 'reviewer',
  team: {
    teammates: [
      { agent: 'architect', task: 'Validate architectural patterns' },
    ],
  },
};

/** Phase with team and gate */
const PHASE_WITH_TEAM_AND_GATE: WorkflowPhase = {
  name: 'green',
  agent: 'dev',
  team: {
    teammates: [
      { agent: 'tea', task: 'Verify tests pass' },
    ],
  },
  gate: {
    type: 'tests_pass',
    condition: 'All tests must pass before phase completion',
  },
};

/** Phase without team config */
const PHASE_WITHOUT_TEAM: WorkflowPhase = {
  name: 'red',
  agent: 'tea',
  input: ['session_file'],
  output: ['failing_tests'],
};

/** No-op adapter for tests that don't need real process interaction */
function createMockAdapter(overrides?: Partial<TeamProcessAdapter>): TeamProcessAdapter {
  return {
    createTeam: async (params) => ({ teamName: params.teamName }),
    deleteTeam: async () => {},
    spawnTeammate: async (params) => ({ agentId: `mock-${params.agent}-001` }),
    shutdownTeammate: async () => {},
    ...overrides,
  };
}

// =============================================================================
// Test Suite
// =============================================================================

describe('86-10: Phase-scoped Team Lifecycle', () => {

  beforeEach(() => {
    _resetForTesting();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, '.session'), { recursive: true });
  });

  afterEach(() => {
    _resetForTesting();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  // ===========================================================================
  // AC1: Lead creates team on phase entry when workflow has team block
  // ===========================================================================

  describe('AC1: Create team on phase entry', () => {

    it('should create team when phase has team config', async () => {
      const params: CreateTeamParams = {
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter: createMockAdapter(),
      };

      const result = await createTeam(params);

      assert.strictEqual(result.success, true, 'Team creation should succeed');
      assert.ok(result.data, 'Should return team handle');
      assert.ok(result.data.teamName, 'Handle should have team name');
      assert.strictEqual(result.data.storyId, '86-10', 'Story ID should match');
      assert.strictEqual(result.data.phase, 'green', 'Phase should match');
    });

    it('should generate team name from storyId and phase', async () => {
      const result = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter: createMockAdapter(),
      });

      assert.strictEqual(result.success, true);
      assert.ok(
        result.data!.teamName.includes('86-10'),
        'Team name should include story ID',
      );
      assert.ok(
        result.data!.teamName.includes('green'),
        'Team name should include phase name',
      );
    });

    it('should set createdAt timestamp on team handle', async () => {
      const result = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter: createMockAdapter(),
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.data!.createdAt, 'Should have createdAt timestamp');
      // Verify it's a valid ISO date string
      const date = new Date(result.data!.createdAt);
      assert.ok(!isNaN(date.getTime()), 'createdAt should be valid ISO date');
    });

    it('should register team in active registry', async () => {
      await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter: createMockAdapter(),
      });

      const active = getActiveTeam('86-10');
      assert.ok(active, 'Team should be in active registry');
      assert.strictEqual(active!.storyId, '86-10');
    });

    it('should call adapter.createTeam when adapter provided', async () => {
      let createCalled = false;
      let createParams: Record<string, unknown> = {};
      const adapter = createMockAdapter({
        createTeam: async (params) => {
          createCalled = true;
          createParams = params;
          return { teamName: params.teamName };
        },
      });

      await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });

      assert.strictEqual(createCalled, true, 'Adapter createTeam must be called');
      assert.ok(createParams.teamName, 'Should pass team name to adapter');
    });

    it('should return no-op for phase without team config', async () => {
      const result = await createTeam({
        phase: PHASE_WITHOUT_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter: createMockAdapter(),
      });

      assert.strictEqual(result.success, true, 'Should succeed as no-op');
      assert.strictEqual(result.data, undefined, 'No handle for non-team phase');
    });

    it('should not register anything for non-team phase', async () => {
      await createTeam({
        phase: PHASE_WITHOUT_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
      });

      const active = getActiveTeam('86-10');
      assert.strictEqual(active, null, 'No active team for non-team phase');
    });

    it('should clean up existing team before creating new one for same story', async () => {
      const deleted: string[] = [];
      const adapter = createMockAdapter({
        deleteTeam: async (teamName) => { deleted.push(teamName); },
      });

      // First team
      await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });

      // Second team for same story (different phase)
      await createTeam({
        phase: PHASE_WITH_SINGLE_TEAMMATE,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });

      assert.strictEqual(deleted.length, 1, 'First team should be deleted');
      const active = getActiveTeam('86-10');
      assert.strictEqual(active!.phase, 'review', 'Second team should be active');
    });
  });

  // ===========================================================================
  // AC2: Lead spawns teammates per workflow YAML teammates config
  // ===========================================================================

  describe('AC2: Spawn teammates per YAML config', () => {

    it('should spawn all teammates from team config', async () => {
      const createResult = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter: createMockAdapter(),
      });
      const handle = createResult.data!;

      const result = await spawnTeammates(
        handle,
        PHASE_WITH_TEAM.team!,
        '86-10',
        'green',
        createMockAdapter(),
      );

      assert.strictEqual(result.success, true, 'Spawn should succeed');
      assert.ok(result.data, 'Should return teammate handles');
      assert.strictEqual(result.data!.length, 2, 'Should spawn 2 teammates');
    });

    it('should spawn teammates with correct agent names', async () => {
      const createResult = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter: createMockAdapter(),
      });

      const result = await spawnTeammates(
        createResult.data!,
        PHASE_WITH_TEAM.team!,
        '86-10',
        'green',
        createMockAdapter(),
      );

      const agents = result.data!.map((t) => t.agent).sort();
      assert.deepStrictEqual(agents, ['architect', 'tea'], 'Should match YAML config');
    });

    it('should pass task descriptions to spawned teammates', async () => {
      const createResult = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter: createMockAdapter(),
      });

      const result = await spawnTeammates(
        createResult.data!,
        PHASE_WITH_TEAM.team!,
        '86-10',
        'green',
        createMockAdapter(),
      );

      const architect = result.data!.find((t) => t.agent === 'architect');
      assert.ok(architect, 'Should have architect teammate');
      assert.strictEqual(
        architect!.task,
        'Review implementation approach and patterns',
        'Task should match YAML config',
      );
    });

    it('should call adapter.spawnTeammate for each teammate', async () => {
      const spawnedAgents: string[] = [];
      const adapter = createMockAdapter({
        spawnTeammate: async (params) => {
          spawnedAgents.push(params.agent);
          return { agentId: `mock-${params.agent}` };
        },
      });

      const createResult = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });

      await spawnTeammates(
        createResult.data!,
        PHASE_WITH_TEAM.team!,
        '86-10',
        'green',
        adapter,
      );

      assert.deepStrictEqual(
        spawnedAgents.sort(),
        ['architect', 'tea'],
        'Should call adapter for each teammate',
      );
    });

    it('should set initial teammate status to spawned', async () => {
      const createResult = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter: createMockAdapter(),
      });

      const result = await spawnTeammates(
        createResult.data!,
        PHASE_WITH_TEAM.team!,
        '86-10',
        'green',
        createMockAdapter(),
      );

      for (const teammate of result.data!) {
        assert.strictEqual(
          teammate.status,
          'spawned',
          `Teammate ${teammate.agent} should have status 'spawned'`,
        );
      }
    });

    it('should update team handle with spawned teammates', async () => {
      const createResult = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter: createMockAdapter(),
      });

      await spawnTeammates(
        createResult.data!,
        PHASE_WITH_TEAM.team!,
        '86-10',
        'green',
        createMockAdapter(),
      );

      const active = getActiveTeam('86-10');
      assert.ok(active, 'Team should still be in registry');
      assert.strictEqual(
        active!.teammates.length,
        2,
        'Active team should have spawned teammates',
      );
    });

    it('should handle single teammate config', async () => {
      const createResult = await createTeam({
        phase: PHASE_WITH_SINGLE_TEAMMATE,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter: createMockAdapter(),
      });

      const result = await spawnTeammates(
        createResult.data!,
        PHASE_WITH_SINGLE_TEAMMATE.team!,
        '86-10',
        'review',
        createMockAdapter(),
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data!.length, 1, 'Should spawn exactly 1 teammate');
      assert.strictEqual(result.data![0].agent, 'architect');
    });
  });

  // ===========================================================================
  // AC3: TaskCompleted hook enforces gate checks
  // ===========================================================================

  describe('AC3: TaskCompleted gate enforcement', () => {

    it('should check gate when task completed event fires', () => {
      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [
          { agent: 'architect', status: 'idle' },
          { agent: 'tea', status: 'idle' },
        ],
        createdAt: new Date().toISOString(),
      };

      const result = checkGateOnTaskCompleted(handle, PHASE_WITH_TEAM_AND_GATE);

      assert.ok('passed' in result, 'Should return gate check result');
      assert.ok('gate' in result, 'Should include gate type');
      assert.ok(typeof result.passed === 'boolean', 'passed must be boolean');
    });

    it('should return gate type from phase config', () => {
      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [{ agent: 'tea', status: 'idle' }],
        createdAt: new Date().toISOString(),
      };

      const result = checkGateOnTaskCompleted(handle, PHASE_WITH_TEAM_AND_GATE);

      assert.strictEqual(result.gate, 'tests_pass', 'Should reflect phase gate type');
    });

    it('should fail gate when teammates still active', () => {
      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [
          { agent: 'tea', status: 'active' }, // still working
        ],
        createdAt: new Date().toISOString(),
      };

      const result = checkGateOnTaskCompleted(handle, PHASE_WITH_TEAM_AND_GATE);

      assert.strictEqual(result.passed, false, 'Gate should fail when teammates still active');
      assert.ok(result.reason, 'Should provide failure reason');
    });

    it('should pass gate when all teammates idle and criteria met', () => {
      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [
          { agent: 'tea', status: 'idle' },
        ],
        createdAt: new Date().toISOString(),
      };

      const result = checkGateOnTaskCompleted(handle, PHASE_WITH_TEAM_AND_GATE);

      assert.strictEqual(result.passed, true, 'Gate should pass when all idle');
    });

    it('should pass trivially when phase has no gate', () => {
      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [{ agent: 'architect', status: 'active' }],
        createdAt: new Date().toISOString(),
      };

      // Phase with team but no gate
      const phaseNoGate: WorkflowPhase = {
        name: 'green',
        agent: 'dev',
        team: { teammates: [{ agent: 'architect' }] },
      };

      const result = checkGateOnTaskCompleted(handle, phaseNoGate);

      assert.strictEqual(result.passed, true, 'No gate = always passes');
    });
  });

  // ===========================================================================
  // AC4: TeammateIdle hook validates teammate work
  // ===========================================================================

  describe('AC4: TeammateIdle validation', () => {

    it('should validate teammate when idle event fires', () => {
      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [
          { agent: 'tea', task: 'Verify tests pass', status: 'idle' },
        ],
        createdAt: new Date().toISOString(),
      };
      const teammate: TeammateHandle = handle.teammates[0];

      const result = checkGateOnTeammateIdle(handle, teammate, PHASE_WITH_TEAM_AND_GATE);

      assert.ok('passed' in result, 'Should return gate check result');
      assert.ok(typeof result.passed === 'boolean');
    });

    it('should include gate type in idle check result', () => {
      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [{ agent: 'tea', status: 'idle' }],
        createdAt: new Date().toISOString(),
      };

      const result = checkGateOnTeammateIdle(
        handle,
        handle.teammates[0],
        PHASE_WITH_TEAM_AND_GATE,
      );

      assert.strictEqual(result.gate, 'tests_pass', 'Gate type should match phase config');
    });

    it('should fail if teammate task implies tests but tests not passing', () => {
      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [
          { agent: 'tea', task: 'Verify tests pass', status: 'crashed' },
        ],
        createdAt: new Date().toISOString(),
      };

      const result = checkGateOnTeammateIdle(
        handle,
        handle.teammates[0],
        PHASE_WITH_TEAM_AND_GATE,
      );

      assert.strictEqual(result.passed, false, 'Crashed teammate should fail gate');
    });

    it('should pass when idle teammate completed task successfully', () => {
      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [
          { agent: 'tea', task: 'Verify tests pass', status: 'idle' },
        ],
        createdAt: new Date().toISOString(),
      };

      const result = checkGateOnTeammateIdle(
        handle,
        handle.teammates[0],
        PHASE_WITH_TEAM_AND_GATE,
      );

      assert.strictEqual(result.passed, true, 'Idle teammate should pass');
    });

    it('should pass trivially when phase has no gate', () => {
      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [{ agent: 'architect', status: 'idle' }],
        createdAt: new Date().toISOString(),
      };

      const phaseNoGate: WorkflowPhase = {
        name: 'green',
        agent: 'dev',
        team: { teammates: [{ agent: 'architect' }] },
      };

      const result = checkGateOnTeammateIdle(handle, handle.teammates[0], phaseNoGate);

      assert.strictEqual(result.passed, true, 'No gate = always passes');
    });
  });

  // ===========================================================================
  // AC5: Lead shuts down all teammates before exit protocol
  // ===========================================================================

  describe('AC5: Shutdown all teammates', () => {

    it('should shut down all active teammates', async () => {
      const shutdownAgents: string[] = [];
      const adapter = createMockAdapter({
        shutdownTeammate: async (params) => { shutdownAgents.push(params.agent); },
      });

      const createResult = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });
      const handle = createResult.data!;
      // Manually add teammate handles to simulate spawned state
      handle.teammates = [
        { agent: 'architect', status: 'active' },
        { agent: 'tea', status: 'idle' },
      ];

      const result = await shutdownAllTeammates(handle, adapter);

      assert.strictEqual(result.success, true, 'Shutdown should succeed');
      assert.deepStrictEqual(
        shutdownAgents.sort(),
        ['architect', 'tea'],
        'Should shut down all teammates',
      );
    });

    it('should return count of teammates shut down', async () => {
      const adapter = createMockAdapter();
      const createResult = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });
      const handle = createResult.data!;
      handle.teammates = [
        { agent: 'architect', status: 'active' },
        { agent: 'tea', status: 'idle' },
      ];

      const result = await shutdownAllTeammates(handle, adapter);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.shutdownCount, 2, 'Should report 2 shutdowns');
    });

    it('should update teammate statuses to shutdown', async () => {
      const adapter = createMockAdapter();
      const createResult = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });
      const handle = createResult.data!;
      handle.teammates = [
        { agent: 'architect', status: 'active' },
        { agent: 'tea', status: 'idle' },
      ];

      await shutdownAllTeammates(handle, adapter);

      for (const teammate of handle.teammates) {
        assert.strictEqual(
          teammate.status,
          'shutdown',
          `${teammate.agent} should be marked shutdown`,
        );
      }
    });

    it('should skip already-shutdown teammates', async () => {
      const shutdownAgents: string[] = [];
      const adapter = createMockAdapter({
        shutdownTeammate: async (params) => { shutdownAgents.push(params.agent); },
      });

      const createResult = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });
      const handle = createResult.data!;
      handle.teammates = [
        { agent: 'architect', status: 'shutdown' }, // already done
        { agent: 'tea', status: 'active' },
      ];

      await shutdownAllTeammates(handle, adapter);

      assert.deepStrictEqual(
        shutdownAgents,
        ['tea'],
        'Should only shut down non-shutdown teammates',
      );
    });

    it('should succeed even with empty teammates list', async () => {
      const adapter = createMockAdapter();
      const createResult = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });
      const handle = createResult.data!;
      handle.teammates = [];

      const result = await shutdownAllTeammates(handle, adapter);

      assert.strictEqual(result.success, true, 'Should succeed with no teammates');
      assert.strictEqual(result.data?.shutdownCount, 0);
    });
  });

  // ===========================================================================
  // AC6: TeamDelete runs before pf handoff
  // ===========================================================================

  describe('AC6: TeamDelete before handoff', () => {

    it('should call adapter.deleteTeam with team name', async () => {
      let deletedTeam = '';
      const adapter = createMockAdapter({
        deleteTeam: async (teamName) => { deletedTeam = teamName; },
      });

      const createResult = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });
      const handle = createResult.data!;

      await cleanupTeam(handle, adapter);

      assert.strictEqual(
        deletedTeam,
        handle.teamName,
        'Should delete team by name',
      );
    });

    it('should remove team from active registry', async () => {
      const adapter = createMockAdapter();

      const createResult = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });
      const handle = createResult.data!;

      await cleanupTeam(handle, adapter);

      const active = getActiveTeam('86-10');
      assert.strictEqual(active, null, 'Team should not be in registry after cleanup');
    });

    it('should return cleaned=true on success', async () => {
      const adapter = createMockAdapter();
      const createResult = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });

      const result = await cleanupTeam(createResult.data!, adapter);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.cleaned, true);
    });

    it('should succeed even when adapter.deleteTeam fails', async () => {
      const adapter = createMockAdapter({
        deleteTeam: async () => { throw new Error('Team not found'); },
      });

      const createResult = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter: createMockAdapter(), // working adapter for create
      });

      // Cleanup with broken adapter — should not throw
      const result = await cleanupTeam(createResult.data!, adapter);

      assert.strictEqual(result.success, true, 'Cleanup should succeed even if delete fails');
    });

    it('should handle cleanup for non-existent team gracefully', async () => {
      const handle: TeamHandle = {
        teamName: 'nonexistent-team',
        storyId: 'no-story',
        phase: 'green',
        teammates: [],
        createdAt: new Date().toISOString(),
      };

      const result = await cleanupTeam(handle, createMockAdapter());

      assert.strictEqual(result.success, true, 'Should succeed for non-existent team');
    });
  });

  // ===========================================================================
  // AC7: Session file updated with teammate activity summary
  // ===========================================================================

  describe('AC7: Team activity summary for audit', () => {

    it('should generate summary with team name', () => {
      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [
          { agent: 'architect', task: 'Review patterns', status: 'shutdown' },
          { agent: 'tea', task: 'Verify tests', status: 'shutdown' },
        ],
        createdAt: new Date().toISOString(),
      };

      const summary = generateTeamSummary(handle);

      assert.strictEqual(summary.teamName, '86-10-green', 'Summary should include team name');
    });

    it('should include all team members with status', () => {
      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [
          { agent: 'architect', task: 'Review patterns', status: 'shutdown' },
          { agent: 'tea', task: 'Verify tests', status: 'crashed' },
        ],
        createdAt: new Date().toISOString(),
      };

      const summary = generateTeamSummary(handle);

      assert.strictEqual(summary.members.length, 2, 'Should list all members');
      const architectMember = summary.members.find((m) => m.agent === 'architect');
      assert.ok(architectMember, 'Should include architect');
      assert.strictEqual(architectMember!.status, 'shutdown');
    });

    it('should include task descriptions in member summaries', () => {
      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [
          { agent: 'architect', task: 'Review patterns', status: 'shutdown' },
        ],
        createdAt: new Date().toISOString(),
      };

      const summary = generateTeamSummary(handle);

      assert.strictEqual(summary.members[0].task, 'Review patterns');
    });

    it('should report clean shutdown status', () => {
      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [
          { agent: 'architect', status: 'shutdown' },
          { agent: 'tea', status: 'shutdown' },
        ],
        createdAt: new Date().toISOString(),
      };

      const summary = generateTeamSummary(handle);

      assert.strictEqual(summary.cleanShutdown, true, 'All shutdown = clean');
    });

    it('should report unclean shutdown when teammate crashed', () => {
      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [
          { agent: 'architect', status: 'shutdown' },
          { agent: 'tea', status: 'crashed' },
        ],
        createdAt: new Date().toISOString(),
      };

      const summary = generateTeamSummary(handle);

      assert.strictEqual(summary.cleanShutdown, false, 'Crashed teammate = unclean');
    });

    it('should include story ID and phase for audit context', () => {
      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [],
        createdAt: new Date().toISOString(),
      };

      const summary = generateTeamSummary(handle);

      assert.strictEqual(summary.storyId, '86-10');
      assert.strictEqual(summary.phase, 'green');
    });
  });

  // ===========================================================================
  // AC8: Sidecar file locking for concurrent teammate writes
  // ===========================================================================

  describe('AC8: Sidecar file locking', () => {

    it('should acquire lock for sidecar file', async () => {
      const filePath = join(TEST_DIR, '.pennyfarthing', 'sidecars', 'patterns.md');

      const result = await acquireSidecarLock(filePath, '86-10');

      assert.strictEqual(result.success, true, 'Lock acquisition should succeed');
      assert.ok(result.data, 'Should return lock handle');
      assert.ok(result.data!.lockPath, 'Lock handle should have lock path');
    });

    it('should include story ID in lock', async () => {
      const filePath = join(TEST_DIR, 'sidecars', 'patterns.md');

      const result = await acquireSidecarLock(filePath, '86-10');

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data!.storyId, '86-10', 'Lock should track story ID');
    });

    it('should set acquiredAt timestamp', async () => {
      const filePath = join(TEST_DIR, 'sidecars', 'patterns.md');

      const result = await acquireSidecarLock(filePath, '86-10');

      assert.strictEqual(result.success, true);
      const date = new Date(result.data!.acquiredAt);
      assert.ok(!isNaN(date.getTime()), 'acquiredAt should be valid ISO date');
    });

    it('should fail to acquire when already locked by different story', async () => {
      const filePath = join(TEST_DIR, 'sidecars', 'patterns.md');

      // First lock succeeds
      const first = await acquireSidecarLock(filePath, '86-10');
      assert.strictEqual(first.success, true);

      // Second lock for different story should fail
      const second = await acquireSidecarLock(filePath, '86-11');
      assert.strictEqual(second.success, false, 'Should fail when already locked');
      assert.ok(second.error, 'Should include error message');
    });

    it('should allow re-entrant lock from same story', async () => {
      const filePath = join(TEST_DIR, 'sidecars', 'patterns.md');

      const first = await acquireSidecarLock(filePath, '86-10');
      assert.strictEqual(first.success, true);

      // Same story re-acquiring should succeed (re-entrant)
      const second = await acquireSidecarLock(filePath, '86-10');
      assert.strictEqual(second.success, true, 'Re-entrant lock should succeed');
    });

    it('should release lock successfully', async () => {
      const filePath = join(TEST_DIR, 'sidecars', 'patterns.md');

      const acquired = await acquireSidecarLock(filePath, '86-10');
      assert.strictEqual(acquired.success, true);

      const released = releaseSidecarLock(acquired.data!);
      assert.strictEqual(released.success, true, 'Release should succeed');
    });

    it('should allow new lock after release', async () => {
      const filePath = join(TEST_DIR, 'sidecars', 'patterns.md');

      // Acquire and release
      const first = await acquireSidecarLock(filePath, '86-10');
      releaseSidecarLock(first.data!);

      // New lock should succeed
      const second = await acquireSidecarLock(filePath, '86-11');
      assert.strictEqual(second.success, true, 'Should acquire after release');
    });

    it('should handle release of already-released lock gracefully', () => {
      const stalelock: SidecarLock = {
        lockPath: join(TEST_DIR, 'stale.lock'),
        storyId: '86-10',
        acquiredAt: new Date().toISOString(),
      };

      const result = releaseSidecarLock(stalelock);
      assert.strictEqual(result.success, true, 'Should succeed for stale lock');
    });
  });

  // ===========================================================================
  // AC9: Graceful degradation when teammate crashes
  // ===========================================================================

  describe('AC9: Graceful degradation on teammate crash', () => {

    it('should continue spawning remaining teammates when one fails', async () => {
      let spawnCount = 0;
      const adapter = createMockAdapter({
        spawnTeammate: async (params) => {
          spawnCount++;
          if (params.agent === 'architect') {
            throw new Error('Spawn failed: connection refused');
          }
          return { agentId: `mock-${params.agent}` };
        },
      });

      const createResult = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter: createMockAdapter(), // working adapter for create
      });

      const result = await spawnTeammates(
        createResult.data!,
        PHASE_WITH_TEAM.team!,
        '86-10',
        'green',
        adapter,
      );

      // Should still succeed overall (degraded mode)
      assert.strictEqual(result.success, true, 'Should succeed in degraded mode');
      assert.strictEqual(spawnCount, 2, 'Should attempt both spawns');
    });

    it('should mark crashed teammate with crashed status', async () => {
      const adapter = createMockAdapter({
        spawnTeammate: async (params) => {
          if (params.agent === 'architect') {
            throw new Error('Spawn failed');
          }
          return { agentId: `mock-${params.agent}` };
        },
      });

      const createResult = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter: createMockAdapter(),
      });

      const result = await spawnTeammates(
        createResult.data!,
        PHASE_WITH_TEAM.team!,
        '86-10',
        'green',
        adapter,
      );

      const crashed = result.data!.find((t) => t.agent === 'architect');
      assert.ok(crashed, 'Crashed teammate should still appear in list');
      assert.strictEqual(crashed!.status, 'crashed', 'Failed spawn should be marked crashed');
    });

    it('should not block shutdown when teammate already crashed', async () => {
      const adapter = createMockAdapter({
        shutdownTeammate: async (params) => {
          if (params.agent === 'architect') {
            throw new Error('Cannot shutdown: process not found');
          }
        },
      });

      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [
          { agent: 'architect', status: 'crashed' },
          { agent: 'tea', status: 'active' },
        ],
        createdAt: new Date().toISOString(),
      };

      const result = await shutdownAllTeammates(handle, adapter);

      assert.strictEqual(result.success, true, 'Shutdown should succeed despite crash');
    });

    it('should not block cleanup when team deletion fails', async () => {
      const adapter = createMockAdapter({
        deleteTeam: async () => { throw new Error('Team already deleted'); },
      });

      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [],
        createdAt: new Date().toISOString(),
      };

      const result = await cleanupTeam(handle, adapter);

      assert.strictEqual(result.success, true, 'Cleanup should not throw');
    });

    it('should return error info for crashed teammates in spawn result', async () => {
      const adapter = createMockAdapter({
        spawnTeammate: async (params) => {
          if (params.agent === 'architect') {
            throw new Error('Connection refused');
          }
          return { agentId: `mock-${params.agent}` };
        },
      });

      const createResult = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter: createMockAdapter(),
      });

      const result = await spawnTeammates(
        createResult.data!,
        PHASE_WITH_TEAM.team!,
        '86-10',
        'green',
        adapter,
      );

      // Successful teammates should still be in the result
      const tea = result.data!.find((t) => t.agent === 'tea');
      assert.ok(tea, 'Successful teammate should be in result');
      assert.strictEqual(tea!.status, 'spawned');
    });
  });

  // ===========================================================================
  // Result format compliance
  // ===========================================================================

  describe('Result format compliance', () => {

    it('should return {success, data?, error?} from createTeam', async () => {
      const result = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter: createMockAdapter(),
      });

      assert.ok('success' in result, 'Must have success field');
      assert.strictEqual(typeof result.success, 'boolean', 'success must be boolean');
    });

    it('should return {success, data?, error?} from spawnTeammates', async () => {
      const createResult = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter: createMockAdapter(),
      });

      const result = await spawnTeammates(
        createResult.data!,
        PHASE_WITH_TEAM.team!,
        '86-10',
        'green',
        createMockAdapter(),
      );

      assert.ok('success' in result, 'Must have success field');
      assert.strictEqual(typeof result.success, 'boolean');
    });

    it('should return {success, data?, error?} from shutdownAllTeammates', async () => {
      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [],
        createdAt: new Date().toISOString(),
      };

      const result = await shutdownAllTeammates(handle, createMockAdapter());

      assert.ok('success' in result, 'Must have success field');
      assert.strictEqual(typeof result.success, 'boolean');
    });

    it('should return {success, data?, error?} from cleanupTeam', async () => {
      const handle: TeamHandle = {
        teamName: '86-10-green',
        storyId: '86-10',
        phase: 'green',
        teammates: [],
        createdAt: new Date().toISOString(),
      };

      const result = await cleanupTeam(handle, createMockAdapter());

      assert.ok('success' in result, 'Must have success field');
      assert.strictEqual(typeof result.success, 'boolean');
    });
  });

  // ===========================================================================
  // ProcessAdapter integration
  // ===========================================================================

  describe('ProcessAdapter integration', () => {

    it('should work without adapter (in-memory test mode)', async () => {
      const result = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        // No adapter — test mode
      });

      assert.strictEqual(result.success, true, 'Should work without adapter');
      assert.ok(result.data, 'Should return handle even without adapter');
    });

    it('should propagate adapter errors as result errors, not exceptions', async () => {
      const adapter = createMockAdapter({
        createTeam: async () => { throw new Error('Network timeout'); },
      });

      const result = await createTeam({
        phase: PHASE_WITH_TEAM,
        storyId: '86-10',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });

      assert.strictEqual(result.success, false, 'Should fail, not throw');
      assert.ok(result.error?.includes('Network timeout'), 'Should include error message');
    });
  });
});
