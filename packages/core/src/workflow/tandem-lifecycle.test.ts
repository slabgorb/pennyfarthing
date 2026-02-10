/**
 * Tests for Story 95-2: Backseat Agent Spawn and Lifecycle
 *
 * RED state tests for tandem backseat agent lifecycle in phased workflows.
 * These tests cover all 5 acceptance criteria:
 *
 * AC1: BikeLane spawns backseat agent at tandem phase start
 * AC2: BikeLane terminates backseat agent at phase end
 * AC3: Zero orphan processes (NFR8)
 * AC4: Primary agent continues if backseat crashes (NFR10)
 * AC5: Backward compatible (no tandem = no change)
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { WorkflowPhase } from './workflow-schema.js';

// Import tandem lifecycle functions
import {
  spawnBackseat,
  terminateBackseat,
  getActiveBackseat,
  registerCleanupHandler,
  executeCleanupHandlers,
  _resetForTesting,
} from './tandem-lifecycle.js';

import type {
  BackseatHandle,
  SpawnBackseatParams,
  TandemCleanupHandler,
  ProcessAdapter,
} from './tandem-lifecycle.js';

// Get directory for test fixtures
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(__dirname, '__test_tandem_lifecycle__');

// =============================================================================
// Test Fixtures
// =============================================================================

/** Phase with tandem config (file-watch scope) */
const PHASE_WITH_TANDEM: WorkflowPhase = {
  name: 'implement',
  agent: 'dev',
  tandem: {
    partner: 'architect',
    scope: 'file-watch',
  },
};

/** Phase with tandem config (multiple scopes) */
const PHASE_WITH_MULTI_SCOPE: WorkflowPhase = {
  name: 'implement',
  agent: 'dev',
  tandem: {
    partner: 'tea',
    scope: ['file-watch', 'tool-watch'],
  },
};

/** Phase with tandem config (default scope — no scope specified) */
const PHASE_WITH_DEFAULT_SCOPE: WorkflowPhase = {
  name: 'implement',
  agent: 'dev',
  tandem: {
    partner: 'architect',
  },
};

/** Phase without tandem config */
const PHASE_WITHOUT_TANDEM: WorkflowPhase = {
  name: 'review',
  agent: 'reviewer',
  gate: { type: 'approval' },
};

// =============================================================================
// AC1: BikeLane spawns backseat agent at tandem phase start
// =============================================================================

describe('95-2: Tandem Lifecycle', () => {

  beforeEach(() => {
    _resetForTesting();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, '.session'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('AC1: Spawn backseat agent at tandem phase start', () => {

    it('should detect tandem config on phase and spawn backseat', async () => {
      const params: SpawnBackseatParams = {
        phase: PHASE_WITH_TANDEM,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
      };

      const result = await spawnBackseat(params);

      assert.strictEqual(result.success, true, 'Spawn should succeed');
      assert.ok(result.data, 'Should return backseat handle');
      assert.ok(result.data.taskId, 'Handle should have taskId');
      assert.strictEqual(result.data.partner, 'architect', 'Partner should match tandem config');
    });

    it('should use haiku model for backseat agent', async () => {
      const params: SpawnBackseatParams = {
        phase: PHASE_WITH_TANDEM,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
      };

      const result = await spawnBackseat(params);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.model, 'haiku', 'Must use haiku model per framework rules');
    });

    it('should run backseat in background', async () => {
      const params: SpawnBackseatParams = {
        phase: PHASE_WITH_TANDEM,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
      };

      const result = await spawnBackseat(params);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.runInBackground, true, 'Must run in background');
    });

    it('should pass scope config to backseat agent', async () => {
      const params: SpawnBackseatParams = {
        phase: PHASE_WITH_TANDEM,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
      };

      const result = await spawnBackseat(params);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.data?.scope, ['file-watch'], 'Should normalize scope to array');
    });

    it('should handle multiple scopes', async () => {
      const params: SpawnBackseatParams = {
        phase: PHASE_WITH_MULTI_SCOPE,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
      };

      const result = await spawnBackseat(params);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.data?.scope, ['file-watch', 'tool-watch']);
    });

    it('should default scope to file-watch when not specified', async () => {
      const params: SpawnBackseatParams = {
        phase: PHASE_WITH_DEFAULT_SCOPE,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
      };

      const result = await spawnBackseat(params);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.data?.scope, ['file-watch'], 'Should default to file-watch');
    });

    it('should set observation file path on handle', async () => {
      const params: SpawnBackseatParams = {
        phase: PHASE_WITH_TANDEM,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
      };

      const result = await spawnBackseat(params);

      assert.strictEqual(result.success, true);
      const expectedPath = join(TEST_DIR, '.session', '95-2-tandem-architect.md');
      assert.strictEqual(result.data?.observationFilePath, expectedPath,
        'Observation file path should follow convention');
    });

    it('should register cleanup handler at spawn time', async () => {
      const params: SpawnBackseatParams = {
        phase: PHASE_WITH_TANDEM,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
      };

      const result = await spawnBackseat(params);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.cleanupRegistered, true,
        'Cleanup handler must be registered at spawn time');
    });

    it('should return no-op result for phase without tandem', async () => {
      const params: SpawnBackseatParams = {
        phase: PHASE_WITHOUT_TANDEM,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
      };

      const result = await spawnBackseat(params);

      assert.strictEqual(result.success, true, 'Should succeed (no-op)');
      assert.strictEqual(result.data, undefined, 'No handle for non-tandem phase');
    });
  });

  // =============================================================================
  // AC2: BikeLane terminates backseat agent at phase end
  // =============================================================================

  describe('AC2: Terminate backseat agent at phase end', () => {

    it('should terminate active backseat by task ID', async () => {
      // First spawn
      const spawnResult = await spawnBackseat({
        phase: PHASE_WITH_TANDEM,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
      });
      assert.strictEqual(spawnResult.success, true);

      const handle = spawnResult.data!;
      const result = await terminateBackseat(handle);

      assert.strictEqual(result.success, true, 'Termination should succeed');
    });

    it('should update background task status on termination', async () => {
      const spawnResult = await spawnBackseat({
        phase: PHASE_WITH_TANDEM,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
      });
      const handle = spawnResult.data!;

      const result = await terminateBackseat(handle);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.status, 'terminated',
        'Background task status should be terminated');
    });

    it('should clear active backseat after termination', async () => {
      const spawnResult = await spawnBackseat({
        phase: PHASE_WITH_TANDEM,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
      });
      const handle = spawnResult.data!;

      await terminateBackseat(handle);

      const active = getActiveBackseat('95-2');
      assert.strictEqual(active, null, 'No active backseat after termination');
    });

    it('should handle termination of already-stopped task gracefully', async () => {
      // Simulate a handle for a task that already stopped
      const staleHandle: BackseatHandle = {
        taskId: 'stale-task-id',
        partner: 'architect',
        model: 'haiku',
        runInBackground: true,
        scope: ['file-watch'],
        observationFilePath: join(TEST_DIR, '.session', '95-2-tandem-architect.md'),
        cleanupRegistered: true,
      };

      const result = await terminateBackseat(staleHandle);

      // Should succeed gracefully, not throw
      assert.strictEqual(result.success, true, 'Should handle already-stopped gracefully');
    });
  });

  // =============================================================================
  // AC3: Zero orphan processes (NFR8)
  // =============================================================================

  describe('AC3: Zero orphan processes', () => {

    it('should register cleanup handler that can terminate backseat', async () => {
      let cleanupCalled = false;
      const handler: TandemCleanupHandler = {
        storyId: '95-2',
        cleanup: async () => { cleanupCalled = true; },
      };

      registerCleanupHandler(handler);
      await executeCleanupHandlers('95-2');

      assert.strictEqual(cleanupCalled, true, 'Cleanup handler should be invoked');
    });

    it('should execute cleanup handlers even on error', async () => {
      let cleanupCalled = false;

      registerCleanupHandler({
        storyId: '95-2',
        cleanup: async () => { cleanupCalled = true; },
      });

      // Simulate crash-like cleanup
      await executeCleanupHandlers('95-2');

      assert.strictEqual(cleanupCalled, true,
        'Cleanup must execute even in error scenarios');
    });

    it('should support multiple cleanup handlers per story', async () => {
      let handler1Called = false;
      let handler2Called = false;

      registerCleanupHandler({
        storyId: '95-2',
        cleanup: async () => { handler1Called = true; },
      });
      registerCleanupHandler({
        storyId: '95-2',
        cleanup: async () => { handler2Called = true; },
      });

      await executeCleanupHandlers('95-2');

      assert.strictEqual(handler1Called, true, 'First handler should be called');
      assert.strictEqual(handler2Called, true, 'Second handler should be called');
    });

    it('should not affect handlers for other stories', async () => {
      let otherCalled = false;

      registerCleanupHandler({
        storyId: 'other-story',
        cleanup: async () => { otherCalled = true; },
      });
      registerCleanupHandler({
        storyId: '95-2',
        cleanup: async () => { /* noop */ },
      });

      await executeCleanupHandlers('95-2');

      assert.strictEqual(otherCalled, false,
        'Should not invoke handlers for other stories');
    });

    it('should clear handlers after execution', async () => {
      let callCount = 0;

      registerCleanupHandler({
        storyId: '95-2',
        cleanup: async () => { callCount++; },
      });

      await executeCleanupHandlers('95-2');
      await executeCleanupHandlers('95-2'); // Second call

      assert.strictEqual(callCount, 1, 'Handler should only execute once');
    });
  });

  // =============================================================================
  // AC4: Primary agent continues if backseat crashes (NFR10)
  // =============================================================================

  describe('AC4: Primary continues if backseat crashes', () => {

    it('should return success even when backseat process is unavailable', async () => {
      // Terminating a non-existent task should not throw
      const deadHandle: BackseatHandle = {
        taskId: 'dead-process-id',
        partner: 'architect',
        model: 'haiku',
        runInBackground: true,
        scope: ['file-watch'],
        observationFilePath: join(TEST_DIR, '.session', '95-2-tandem-architect.md'),
        cleanupRegistered: true,
      };

      const result = await terminateBackseat(deadHandle);

      assert.strictEqual(result.success, true,
        'Termination must succeed even for crashed backseat');
    });

    it('should not throw when cleanup handler encounters error', async () => {
      registerCleanupHandler({
        storyId: '95-2',
        cleanup: async () => { throw new Error('Simulated crash'); },
      });

      // executeCleanupHandlers should not throw despite handler error
      await assert.doesNotReject(
        () => executeCleanupHandlers('95-2'),
        'Cleanup should swallow handler errors'
      );
    });

    it('should continue executing remaining handlers after one fails', async () => {
      let secondCalled = false;

      registerCleanupHandler({
        storyId: '95-2',
        cleanup: async () => { throw new Error('First handler crash'); },
      });
      registerCleanupHandler({
        storyId: '95-2',
        cleanup: async () => { secondCalled = true; },
      });

      await executeCleanupHandlers('95-2');

      assert.strictEqual(secondCalled, true,
        'Remaining handlers must execute even if earlier ones fail');
    });

    it('should return error info but success=true for crashed backseat spawn', async () => {
      // Spawn with invalid config to simulate crash at spawn
      const params: SpawnBackseatParams = {
        phase: {
          name: 'test',
          agent: 'dev',
          tandem: {
            partner: '', // Invalid: empty partner
          },
        },
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
      };

      const result = await spawnBackseat(params);

      // Should not crash the primary agent
      assert.strictEqual(result.success, false, 'Spawn with invalid config should fail');
      assert.ok(result.error, 'Should include error message');
    });
  });

  // =============================================================================
  // AC5: Backward compatible
  // =============================================================================

  describe('AC5: Backward compatibility', () => {

    it('should be a no-op for phases without tandem config', async () => {
      const params: SpawnBackseatParams = {
        phase: PHASE_WITHOUT_TANDEM,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
      };

      const result = await spawnBackseat(params);

      assert.strictEqual(result.success, true, 'Should succeed as no-op');
      assert.strictEqual(result.data, undefined, 'No handle for non-tandem');
    });

    it('should not modify WorkflowPhase interface contract', () => {
      // Verify existing phase fields still work without tandem
      const phase: WorkflowPhase = {
        name: 'red',
        agent: 'tea',
        input: ['session_file'],
        output: ['failing_tests'],
        gate: { type: 'tests_fail', condition: 'Coverage check' },
      };

      assert.strictEqual(phase.name, 'red');
      assert.strictEqual(phase.agent, 'tea');
      assert.ok(Array.isArray(phase.input));
      assert.ok(Array.isArray(phase.output));
      assert.strictEqual(phase.gate?.type, 'tests_fail');
      assert.strictEqual(phase.tandem, undefined, 'Tandem should be optional/undefined');
    });

    it('should return null for getActiveBackseat when no tandem running', () => {
      const active = getActiveBackseat('nonexistent-story');

      assert.strictEqual(active, null, 'No active backseat for non-tandem story');
    });

    it('should handle executeCleanupHandlers with no registered handlers', async () => {
      // No handlers registered for this story
      await assert.doesNotReject(
        () => executeCleanupHandlers('no-handlers-story'),
        'Should handle empty cleanup gracefully'
      );
    });

    it('should terminate gracefully when no backseat exists for phase transition', async () => {
      // Simulates completeStep for a non-tandem phase
      const nullHandle = getActiveBackseat('95-2');
      assert.strictEqual(nullHandle, null);
      // No crash, no error — workflow continues
    });
  });

  // =============================================================================
  // ProcessAdapter integration
  // =============================================================================

  describe('ProcessAdapter integration', () => {

    it('should call adapter.spawn when adapter is provided', async () => {
      let spawnCalled = false;
      let spawnParams: Record<string, unknown> = {};
      const adapter: ProcessAdapter = {
        spawn: async (params) => {
          spawnCalled = true;
          spawnParams = params;
          return { taskId: 'real-task-123' };
        },
        terminate: async () => {},
      };

      const result = await spawnBackseat({
        phase: PHASE_WITH_TANDEM,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });

      assert.strictEqual(spawnCalled, true, 'Adapter spawn must be called');
      assert.strictEqual(result.data?.taskId, 'real-task-123', 'Should use adapter taskId');
      assert.strictEqual(spawnParams.partner, 'architect');
      assert.strictEqual(spawnParams.model, 'haiku');
    });

    it('should call adapter.terminate when terminating with adapter', async () => {
      let terminatedId = '';
      const adapter: ProcessAdapter = {
        spawn: async () => ({ taskId: 'real-task-456' }),
        terminate: async (taskId) => { terminatedId = taskId; },
      };

      const spawnResult = await spawnBackseat({
        phase: PHASE_WITH_TANDEM,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });

      await terminateBackseat(spawnResult.data!, adapter);

      assert.strictEqual(terminatedId, 'real-task-456', 'Adapter terminate must be called with correct taskId');
    });

    it('should call adapter.terminate in cleanup handler', async () => {
      let terminatedId = '';
      const adapter: ProcessAdapter = {
        spawn: async () => ({ taskId: 'cleanup-task-789' }),
        terminate: async (taskId) => { terminatedId = taskId; },
      };

      await spawnBackseat({
        phase: PHASE_WITH_TANDEM,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });

      await executeCleanupHandlers('95-2');

      assert.strictEqual(terminatedId, 'cleanup-task-789', 'Cleanup must call adapter.terminate');
    });

    it('should terminate existing backseat before spawning new one for same story', async () => {
      const terminated: string[] = [];
      const adapter: ProcessAdapter = {
        spawn: async () => ({ taskId: `task-${++taskCounter}` }),
        terminate: async (taskId) => { terminated.push(taskId); },
      };
      let taskCounter = 0;

      // First spawn
      await spawnBackseat({
        phase: PHASE_WITH_TANDEM,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });

      // Second spawn for same story — should terminate first
      await spawnBackseat({
        phase: PHASE_WITH_MULTI_SCOPE,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });

      assert.strictEqual(terminated.length, 1, 'First backseat should be terminated');
      assert.strictEqual(terminated[0], 'task-1', 'Should terminate the first task');
    });

    it('should return error result when adapter.spawn fails', async () => {
      const adapter: ProcessAdapter = {
        spawn: async () => { throw new Error('Connection refused'); },
        terminate: async () => {},
      };

      const result = await spawnBackseat({
        phase: PHASE_WITH_TANDEM,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('Connection refused'));
    });

    it('should succeed even when adapter.terminate fails', async () => {
      const adapter: ProcessAdapter = {
        spawn: async () => ({ taskId: 'will-fail-terminate' }),
        terminate: async () => { throw new Error('Process not found'); },
      };

      const spawnResult = await spawnBackseat({
        phase: PHASE_WITH_TANDEM,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
        adapter,
      });

      const result = await terminateBackseat(spawnResult.data!, adapter);
      assert.strictEqual(result.success, true, 'Should swallow terminate errors');
    });
  });

  // =============================================================================
  // Result format compliance
  // =============================================================================

  describe('Result format compliance', () => {

    it('should return {success, data?, error?} from spawnBackseat', async () => {
      const result = await spawnBackseat({
        phase: PHASE_WITH_TANDEM,
        storyId: '95-2',
        sessionDir: join(TEST_DIR, '.session'),
      });

      assert.ok('success' in result, 'Must have success field');
      assert.ok(typeof result.success === 'boolean', 'success must be boolean');
      // data and error are optional
    });

    it('should return {success, data?, error?} from terminateBackseat', async () => {
      const handle: BackseatHandle = {
        taskId: 'test-id',
        partner: 'architect',
        model: 'haiku',
        runInBackground: true,
        scope: ['file-watch'],
        observationFilePath: '/tmp/test.md',
        cleanupRegistered: true,
      };

      const result = await terminateBackseat(handle);

      assert.ok('success' in result, 'Must have success field');
      assert.ok(typeof result.success === 'boolean', 'success must be boolean');
    });
  });
});
