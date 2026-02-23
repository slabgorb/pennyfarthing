/**
 * 125-3: Sprint Context Resolution Tests (RED)
 *
 * Verifies that sprint-data.ts delegates path resolution to SprintContext
 * instead of hardcoding sprint/current-sprint.yaml.
 *
 * ACs:
 * - sprint-data.ts uses SprintContext (via subprocess or shared logic)
 * - Orphan epic shard detection matches Python behavior
 * - Future initiative resolution matches Python behavior
 * - WebSocket broadcast still works with new data path
 *
 * Story: MSSCI-15424
 * Epic: MSSCI-15421 (Sprint State Consolidation)
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs module before importing sprint-data
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

// Mock child_process for subprocess calls (git config + SprintContext resolver)
vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

// Mock story-parser to isolate sprint-data tests
vi.mock('../src/story-parser.js', () => ({
  getStoryInfo: vi.fn(() => ({ id: null, title: null, phase: null })),
}));

import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

// =============================================================================
// Test Fixtures
// =============================================================================

const DEFAULT_SPRINT_YAML = `
sprint:
  name: TO Sprint 2608
  end_date: "2026-03-01"
epics:
  - id: epic-125
    title: "Epic: Sprint State Consolidation"
    jira: MSSCI-15421
    stories:
      - id: 125-3
        title: Replace TS sprint-data with SprintContext
        points: 2
        status: in_progress
`;

const FOCUS_SPRINT_YAML = `
sprint:
  name: Focus Sprint 2608
  end_date: "2026-03-01"
epics:
  - id: epic-focus-1
    title: "Epic: Focus Work"
    stories:
      - id: F-1
        title: Focus story
        points: 3
        status: backlog
`;

const CONFIG_WITH_ACTIVE_SPRINT = `
theme: discworld
sprint:
  active: team-focus
`;

const REGISTRY_YAML = `
sprints:
  team-focus:
    file: focus-sprint.yaml
    type: focus
    context_root: /test/project/focus
    session_root: /test/project/focus/.session
`;

const SPRINT_WITH_SHARDED_EPICS = `
sprint:
  name: TO Sprint 2608
epics:
  - MSSCI-15421
  - MSSCI-14510
`;

const SHARD_EPIC_15421 = `
id: epic-125
title: "Epic: Sprint State Consolidation"
jira: MSSCI-15421
stories:
  - id: 125-3
    title: Replace TS sprint-data with SprintContext
    points: 2
    status: in_progress
`;

const SHARD_EPIC_14510 = `
id: epic-91
title: "Epic: CI Pipeline"
jira: MSSCI-14510
stories:
  - id: 91-2
    title: CI polish
    points: 2
    status: backlog
`;

const FUTURE_WITH_SHARDED_INITIATIVES = `
future:
  initiatives:
    - benchmark-reliability
    - name: Inline Initiative
      description: Already inline
      status: planning
      total_points: 8
`;

const SHARD_INITIATIVE = `
name: Benchmark Reliability
description: Improve benchmark consistency
status: ready
total_points: 13
epics: []
`;

// =============================================================================
// Test Setup
// =============================================================================

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;
const mockExecSync = execSync as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
  mockReadFileSync.mockReturnValue('');
  mockExecSync.mockReturnValue('');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setupFileMocks(files: Record<string, string | null>) {
  mockExistsSync.mockImplementation((path: string) => {
    for (const [pattern, content] of Object.entries(files)) {
      if (path.includes(pattern) && content !== null) {
        return true;
      }
    }
    return false;
  });

  mockReadFileSync.mockImplementation((path: string) => {
    for (const [pattern, content] of Object.entries(files)) {
      if (path.includes(pattern) && content !== null) {
        return content;
      }
    }
    throw new Error(`File not found: ${path}`);
  });
}

// =============================================================================
// AC1: sprint-data.ts uses SprintContext
// =============================================================================

describe('AC1: Sprint Context Resolution (125-3)', () => {
  it('should use resolved sprint file path instead of hardcoded default', async () => {
    // Setup: config.local.yaml has active sprint preference,
    // sprints.yaml has registry entry pointing to focus-sprint.yaml
    setupFileMocks({
      'config.local.yaml': CONFIG_WITH_ACTIVE_SPRINT,
      'sprints.yaml': REGISTRY_YAML,
      'current-sprint.yaml': DEFAULT_SPRINT_YAML,
      'focus-sprint.yaml': FOCUS_SPRINT_YAML,
    });

    // Mock subprocess for SprintContext resolution (if impl uses subprocess)
    mockExecSync.mockImplementation((cmd: string) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes('resolve-context') || cmdStr.includes('sprint-context')) {
        return JSON.stringify({
          sprint_file: '/test/project/sprint/focus-sprint.yaml',
          context_root: '/test/project',
          session_root: '/test/project/.session',
          repos: ['pennyfarthing'],
          name: 'team-focus',
          type: 'focus',
          is_default: false,
        });
      }
      return '';
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // FAILS: Current code hardcodes current-sprint.yaml, returns "TO Sprint 2608"
    // After fix: should resolve to focus-sprint.yaml, return "Focus Sprint 2608"
    expect(data.sprint.name).toBe('Focus Sprint 2608');
  });

  it('should fall back to default sprint when no preference is set', async () => {
    setupFileMocks({
      'current-sprint.yaml': DEFAULT_SPRINT_YAML,
    });

    mockExecSync.mockImplementation((cmd: string) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes('resolve-context') || cmdStr.includes('sprint-context')) {
        return JSON.stringify({
          sprint_file: '/test/project/sprint/current-sprint.yaml',
          context_root: '/test/project',
          session_root: '/test/project/.session',
          repos: [],
          name: 'TO Sprint 2608',
          type: 'orchestrator',
          is_default: true,
        });
      }
      return '';
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Should pass: default path is the same regardless of implementation
    expect(data.sprint.name).toBe('TO Sprint 2608');
    expect(data.epics).toHaveLength(1);
  });

  it('should fall back to default when resolver subprocess fails', async () => {
    setupFileMocks({
      'current-sprint.yaml': DEFAULT_SPRINT_YAML,
    });

    mockExecSync.mockImplementation((cmd: string) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes('resolve-context') || cmdStr.includes('sprint-context')) {
        throw new Error('pf not installed');
      }
      return '';
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Should gracefully fall back to default, not crash
    expect(data.sprint.name).toBe('TO Sprint 2608');
  });

  it('should include registry metadata for non-default sprint context', async () => {
    setupFileMocks({
      'config.local.yaml': CONFIG_WITH_ACTIVE_SPRINT,
      'sprints.yaml': REGISTRY_YAML,
      'current-sprint.yaml': DEFAULT_SPRINT_YAML,
      'focus-sprint.yaml': FOCUS_SPRINT_YAML,
    });

    mockExecSync.mockImplementation((cmd: string) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes('resolve-context') || cmdStr.includes('sprint-context')) {
        return JSON.stringify({
          sprint_file: '/test/project/sprint/focus-sprint.yaml',
          context_root: '/test/project/focus',
          session_root: '/test/project/focus/.session',
          repos: ['pennyfarthing'],
          name: 'team-focus',
          type: 'focus',
          is_default: false,
        });
      }
      return '';
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // FAILS: Current code doesn't include registry metadata in output
    // After fix: SprintData should carry context info for UI indicators
    expect((data as Record<string, unknown>)._registry).toBeDefined();
    expect((data as Record<string, unknown> & { _registry: { name: string; type: string; is_default: boolean } })._registry.name).toBe('team-focus');
    expect((data as Record<string, unknown> & { _registry: { name: string; type: string; is_default: boolean } })._registry.type).toBe('focus');
    expect((data as Record<string, unknown> & { _registry: { name: string; type: string; is_default: boolean } })._registry.is_default).toBe(false);
  });
});

// =============================================================================
// AC2: Orphan epic shard detection matches Python behavior
// =============================================================================

describe('AC2: Epic Shard Resolution Parity (125-3)', () => {
  it('should resolve string epic refs from shard files', async () => {
    setupFileMocks({
      'current-sprint.yaml': SPRINT_WITH_SHARDED_EPICS,
      'epic-MSSCI-15421.yaml': SHARD_EPIC_15421,
      'epic-MSSCI-14510.yaml': SHARD_EPIC_14510,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Verify shards are resolved correctly
    expect(data.epics).toHaveLength(2);
    expect(data.epics[0].jiraKey).toBe('MSSCI-15421');
    expect(data.epics[1].jiraKey).toBe('MSSCI-14510');
  });

  it('should warn and skip orphan shard refs when file missing on disk', async () => {
    const sprintWithOrphan = `
sprint:
  name: TO Sprint 2608
epics:
  - MSSCI-15421
  - MSSCI-99999
`;
    setupFileMocks({
      'current-sprint.yaml': sprintWithOrphan,
      'epic-MSSCI-15421.yaml': SHARD_EPIC_15421,
      // MSSCI-99999 shard does NOT exist on disk
    });

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Orphan ref should be skipped, valid ref resolved
    expect(data.epics).toHaveLength(1);
    expect(data.epics[0].jiraKey).toBe('MSSCI-15421');
    // Should log a warning about the missing shard
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('not found'),
    );

    consoleSpy.mockRestore();
  });

  it('should handle shard with malformed YAML gracefully', async () => {
    const malformedShard = `
id: epic-bad
title: "Bad Epic
  this is not valid yaml: [
`;
    setupFileMocks({
      'current-sprint.yaml': SPRINT_WITH_SHARDED_EPICS,
      'epic-MSSCI-15421.yaml': malformedShard,
      'epic-MSSCI-14510.yaml': SHARD_EPIC_14510,
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Malformed shard skipped, valid one kept
    expect(data.epics.length).toBeGreaterThanOrEqual(1);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should not double-prefix epic- refs', async () => {
    // Ref "epic-MSSCI-15421" should resolve to "epic-MSSCI-15421.yaml"
    // NOT "epic-epic-MSSCI-15421.yaml"
    const sprintWithPrefixedRef = `
sprint:
  name: TO Sprint 2608
epics:
  - epic-MSSCI-15421
`;
    setupFileMocks({
      'current-sprint.yaml': sprintWithPrefixedRef,
      'epic-MSSCI-15421.yaml': SHARD_EPIC_15421,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.epics).toHaveLength(1);
    expect(data.epics[0].jiraKey).toBe('MSSCI-15421');
  });
});

// =============================================================================
// AC3: Future initiative resolution matches Python behavior
// =============================================================================

describe('AC3: Future Initiative Resolution Parity (125-3)', () => {
  it('should resolve future.yaml from SprintContext context_root', async () => {
    // When a non-default context is active, future.yaml should be read
    // from the resolved context_root, not the hardcoded projectDir
    setupFileMocks({
      'config.local.yaml': CONFIG_WITH_ACTIVE_SPRINT,
      'sprints.yaml': REGISTRY_YAML,
      'focus-sprint.yaml': FOCUS_SPRINT_YAML,
      // future.yaml only exists under the focus context root
      'focus/sprint/future.yaml': FUTURE_WITH_SHARDED_INITIATIVES,
      'initiative-benchmark-reliability.yaml': SHARD_INITIATIVE,
    });

    mockExecSync.mockImplementation((cmd: string) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes('resolve-context') || cmdStr.includes('sprint-context')) {
        return JSON.stringify({
          sprint_file: '/test/project/sprint/focus-sprint.yaml',
          context_root: '/test/project/focus',
          session_root: '/test/project/focus/.session',
          repos: ['pennyfarthing'],
          name: 'team-focus',
          type: 'focus',
          is_default: false,
        });
      }
      return '';
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // FAILS: Current code hardcodes future.yaml to projectDir/sprint/future.yaml
    // After fix: should use context_root for future.yaml resolution
    expect(data.futureEpics.length).toBeGreaterThanOrEqual(1);
    expect(data.futureEpics.some(e => e.title === 'Benchmark Reliability')).toBe(true);
  });

  it('should resolve initiative shard references from default context', async () => {
    setupFileMocks({
      'current-sprint.yaml': DEFAULT_SPRINT_YAML,
      'future.yaml': FUTURE_WITH_SHARDED_INITIATIVES,
      'initiative-benchmark-reliability.yaml': SHARD_INITIATIVE,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Verify initiative shard was resolved
    expect(data.futureEpics).toHaveLength(2);
    const resolved = data.futureEpics.find(e => e.title === 'Benchmark Reliability');
    expect(resolved).toBeDefined();
    expect(resolved!.status).toBe('ready');
    expect(resolved!.estimatedPoints).toBe(13);

    // Inline initiative also present
    const inline = data.futureEpics.find(e => e.title === 'Inline Initiative');
    expect(inline).toBeDefined();
  });

  it('should skip completed initiatives in future', async () => {
    const futureWithCompleted = `
future:
  initiatives:
    - name: Active Initiative
      status: ready
      total_points: 5
    - name: Done Initiative
      status: complete
      total_points: 10
`;
    setupFileMocks({
      'current-sprint.yaml': DEFAULT_SPRINT_YAML,
      'future.yaml': futureWithCompleted,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Complete initiatives should be filtered out
    expect(data.futureEpics).toHaveLength(1);
    expect(data.futureEpics[0].title).toBe('Active Initiative');
  });
});

// =============================================================================
// AC4: WebSocket broadcast still works with new data path
// =============================================================================

describe('AC4: WebSocket Broadcast Compatibility (125-3)', () => {
  it('should return complete SprintData shape regardless of context', async () => {
    setupFileMocks({
      'current-sprint.yaml': DEFAULT_SPRINT_YAML,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Verify SprintData shape is preserved (WebSocket consumers depend on this)
    expect(data).toHaveProperty('currentStory');
    expect(data).toHaveProperty('nextStory');
    expect(data).toHaveProperty('epics');
    expect(data).toHaveProperty('completedEpics');
    expect(data).toHaveProperty('futureEpics');
    expect(data).toHaveProperty('sprint');
    expect(data).toHaveProperty('metrics');

    // Sprint object shape
    expect(data.sprint).toHaveProperty('number');
    expect(data.sprint).toHaveProperty('name');
    expect(data.sprint).toHaveProperty('done');
    expect(data.sprint).toHaveProperty('remaining');
    expect(data.sprint).toHaveProperty('inProgress');
    expect(data.sprint).toHaveProperty('endDate');

    // Metrics shape
    expect(data.metrics).toHaveProperty('completed');
    expect(data.metrics).toHaveProperty('current');
    expect(data.metrics).toHaveProperty('future');
    expect(data.metrics).toHaveProperty('velocity');
  });

  it('should preserve metrics calculation with resolved context', async () => {
    setupFileMocks({
      'config.local.yaml': CONFIG_WITH_ACTIVE_SPRINT,
      'sprints.yaml': REGISTRY_YAML,
      'current-sprint.yaml': DEFAULT_SPRINT_YAML,
      'focus-sprint.yaml': FOCUS_SPRINT_YAML,
    });

    mockExecSync.mockImplementation((cmd: string) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes('resolve-context') || cmdStr.includes('sprint-context')) {
        return JSON.stringify({
          sprint_file: '/test/project/sprint/focus-sprint.yaml',
          context_root: '/test/project',
          session_root: '/test/project/.session',
          repos: ['pennyfarthing'],
          name: 'team-focus',
          type: 'focus',
          is_default: false,
        });
      }
      return '';
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // FAILS: Current code reads current-sprint.yaml (2pt in_progress, 0 remaining)
    // After fix: should read focus-sprint.yaml (3pt backlog = 3 remaining)
    expect(data.metrics.current.remaining).toBe(3);
    expect(data.metrics.current.storiesRemaining).toBe(1);
  });
});
