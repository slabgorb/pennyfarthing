/**
 * Story 100-6: Sprint panel — sprint metrics from completed/current/future
 *
 * Tests that getSprintData() surfaces aggregate metrics from:
 * 1. Completed sprint archives (sprint-{N}-completed.yaml + archive/epic-*.yaml)
 * 2. Current sprint (active epics in current-sprint.yaml)
 * 3. Future sprint data (future.yaml initiatives)
 *
 * The SprintData.metrics field should provide a unified view across all periods.
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

// Mock story-parser to isolate sprint-data tests
vi.mock('../src/story-parser.js', () => ({
  getStoryInfo: vi.fn(() => ({ id: null, title: null, phase: null })),
}));

import { existsSync, readFileSync } from 'fs';

// =============================================================================
// Test Fixtures
// =============================================================================

const CURRENT_SPRINT_YAML = `
sprint:
  name: TO Sprint 2606
  end_date: "2026-02-15"
  jira_sprint_id: 309

epics:
  - id: epic-99
    title: "Epic: Active Feature"
    jira: MSSCI-14758
    stories:
      - id: 99-1
        title: Active story one
        points: 3
        status: in_progress
      - id: 99-2
        title: Backlog story
        points: 2
        status: backlog
      - id: 99-3
        title: Done story
        points: 5
        status: done
  - id: epic-100
    title: "Epic: Another Active"
    jira: MSSCI-14784
    stories:
      - id: 100-1
        title: Blocked story
        points: 3
        status: blocked
      - id: 100-2
        title: Done story two
        points: 2
        status: done
`;

const COMPLETED_YAML = `
sprint:
  name: "TO Sprint 2606"
  number: 2606
  start_date: 2026-02-02
  end_date: 2026-02-15
  status: active

completed_epics:
  - MSSCI-14453
  - MSSCI-14469
`;

const ARCHIVED_EPIC_14453 = `
stories:
  - id: 80-1
    title: 'Python codemarkers module'
    points: 2
    status: done
    completed: '2026-02-08'
    jira: MSSCI-14454
  - id: 80-2
    title: '@deprecated detection'
    points: 2
    status: done
    completed: '2026-02-09'
    jira: MSSCI-14455
  - id: 80-3
    title: 'Code markers dialog'
    points: 1
    status: done
    completed: '2026-02-08'
    jira: MSSCI-14456
id: epic-80
title: Code Markers Tool
jira: MSSCI-14453
status: done
completed: '2026-02-09'
`;

const ARCHIVED_EPIC_14469 = `
stories:
  - id: 81-1
    title: 'WebSocket reconnection'
    points: 3
    status: done
    completed: '2026-02-08'
    jira: MSSCI-14470
  - id: 81-2
    title: 'Heartbeat mechanism'
    points: 2
    status: done
    completed: '2026-02-09'
    jira: MSSCI-14471
id: epic-81
title: Connection Reliability
jira: MSSCI-14469
status: done
completed: '2026-02-08'
`;

const FUTURE_YAML = `
future:
  initiatives:
    - benchmarking
    - technical-debt
`;

const INITIATIVE_BENCHMARKING = `
name: Benchmarking
description: Performance benchmarking and persona evaluation
total_points: 13
status: ready
epics:
  - title: Benchmark Framework
    points: 8
  - title: Persona Evaluation
    points: 5
`;

const INITIATIVE_TECH_DEBT = `
name: Technical Debt
description: Address accumulated tech debt
total_points: 21
status: planning
epics:
  - title: Refactor Sprint Data
    points: 8
  - title: Migrate Legacy Hooks
    points: 13
`;

// =============================================================================
// Test Setup
// =============================================================================

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockExistsSync.mockReturnValue(false);
  mockReadFileSync.mockReturnValue('');
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
// AC1: SprintData should include a metrics field with completed sprint totals
// =============================================================================

describe('Sprint Metrics — Completed Sprint Totals (AC1)', () => {
  it('should include metrics.completed with total done points from archived epics', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
      'sprint-2606-completed.yaml': COMPLETED_YAML,
      'archive/epic-MSSCI-14453.yaml': ARCHIVED_EPIC_14453,
      'archive/epic-MSSCI-14469.yaml': ARCHIVED_EPIC_14469,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Archived epics: epic-80 has 5pts done, epic-81 has 5pts done = 10 total
    expect(data.metrics).toBeDefined();
    expect(data.metrics.completed.points).toBe(10);
  });

  it('should include metrics.completed with story count from archived epics', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
      'sprint-2606-completed.yaml': COMPLETED_YAML,
      'archive/epic-MSSCI-14453.yaml': ARCHIVED_EPIC_14453,
      'archive/epic-MSSCI-14469.yaml': ARCHIVED_EPIC_14469,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // epic-80 has 3 stories, epic-81 has 2 stories = 5 total
    expect(data.metrics.completed.stories).toBe(5);
  });

  it('should include metrics.completed with epic count', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
      'sprint-2606-completed.yaml': COMPLETED_YAML,
      'archive/epic-MSSCI-14453.yaml': ARCHIVED_EPIC_14453,
      'archive/epic-MSSCI-14469.yaml': ARCHIVED_EPIC_14469,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.metrics.completed.epics).toBe(2);
  });

  it('should return zero completed metrics when no completed sprint file exists', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.metrics).toBeDefined();
    expect(data.metrics.completed.points).toBe(0);
    expect(data.metrics.completed.stories).toBe(0);
    expect(data.metrics.completed.epics).toBe(0);
  });
});

// =============================================================================
// AC2: SprintData should include metrics for current sprint
// =============================================================================

describe('Sprint Metrics — Current Sprint (AC2)', () => {
  it('should include metrics.current with done/inProgress/remaining points', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Active epics: 99-3 done(5) + 100-2 done(2) = 7 done
    // 99-1 in_progress(3) = 3 inProgress
    // 99-2 backlog(2) = 2 remaining
    // 100-1 blocked(3) = not counted
    expect(data.metrics.current.done).toBe(7);
    expect(data.metrics.current.inProgress).toBe(3);
    expect(data.metrics.current.remaining).toBe(2);
  });

  it('should include metrics.current with total points', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Total countable points: done(7) + inProgress(3) + remaining(2) = 12
    // blocked(3) not counted
    expect(data.metrics.current.totalPoints).toBe(12);
  });

  it('should include metrics.current story counts by status', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // 2 done, 1 in_progress, 1 backlog, 1 blocked
    expect(data.metrics.current.storiesDone).toBe(2);
    expect(data.metrics.current.storiesInProgress).toBe(1);
    expect(data.metrics.current.storiesRemaining).toBe(1);
  });
});

// =============================================================================
// AC3: SprintData should include metrics for future work
// =============================================================================

describe('Sprint Metrics — Future Work (AC3)', () => {
  it('should include metrics.future with total estimated points', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': FUTURE_YAML,
      'initiative-benchmarking.yaml': INITIATIVE_BENCHMARKING,
      'initiative-technical-debt.yaml': INITIATIVE_TECH_DEBT,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // benchmarking: 13pts + technical-debt: 21pts = 34 total
    expect(data.metrics.future.totalPoints).toBe(34);
  });

  it('should include metrics.future with initiative count', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': FUTURE_YAML,
      'initiative-benchmarking.yaml': INITIATIVE_BENCHMARKING,
      'initiative-technical-debt.yaml': INITIATIVE_TECH_DEBT,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.metrics.future.initiatives).toBe(2);
  });

  it('should return zero future metrics when no future.yaml exists', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.metrics.future.totalPoints).toBe(0);
    expect(data.metrics.future.initiatives).toBe(0);
  });
});

// =============================================================================
// AC4: Metrics isolation — completed metrics don't inflate current sprint
// =============================================================================

describe('Sprint Metrics — Isolation (AC4)', () => {
  it('completed metrics should be separate from current sprint metrics', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
      'sprint-2606-completed.yaml': COMPLETED_YAML,
      'archive/epic-MSSCI-14453.yaml': ARCHIVED_EPIC_14453,
      'archive/epic-MSSCI-14469.yaml': ARCHIVED_EPIC_14469,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Current sprint done should NOT include archived epic points
    expect(data.metrics.current.done).toBe(7); // only active epics
    expect(data.metrics.completed.points).toBe(10); // only archived
    // They should NOT add up in sprint.done
    expect(data.sprint.done).toBe(7);
  });

  it('future metrics should be separate from current sprint metrics', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': FUTURE_YAML,
      'initiative-benchmarking.yaml': INITIATIVE_BENCHMARKING,
      'initiative-technical-debt.yaml': INITIATIVE_TECH_DEBT,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Future points should NOT inflate current sprint metrics
    expect(data.metrics.current.totalPoints).toBe(12);
    expect(data.metrics.future.totalPoints).toBe(34);
    expect(data.sprint.done).toBe(7);
  });

  it('existing sprint.done/inProgress/remaining should be unchanged', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': FUTURE_YAML,
      'initiative-benchmarking.yaml': INITIATIVE_BENCHMARKING,
      'initiative-technical-debt.yaml': INITIATIVE_TECH_DEBT,
      'sprint-2606-completed.yaml': COMPLETED_YAML,
      'archive/epic-MSSCI-14453.yaml': ARCHIVED_EPIC_14453,
      'archive/epic-MSSCI-14469.yaml': ARCHIVED_EPIC_14469,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Legacy sprint metrics untouched
    expect(data.sprint.done).toBe(7);
    expect(data.sprint.inProgress).toBe(3);
    expect(data.sprint.remaining).toBe(2);
  });
});

// =============================================================================
// AC5: Graceful degradation
// =============================================================================

describe('Sprint Metrics — Graceful Degradation (AC5)', () => {
  it('should provide all metric sections even with minimal data', async () => {
    setupFileMocks({
      'current-sprint.yaml': `
sprint:
  name: TO Sprint 2606
  end_date: "2026-02-15"
epics: []
`,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.metrics).toBeDefined();
    expect(data.metrics.completed).toBeDefined();
    expect(data.metrics.current).toBeDefined();
    expect(data.metrics.future).toBeDefined();
  });

  it('should handle missing archive shards gracefully in metrics', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
      'sprint-2606-completed.yaml': COMPLETED_YAML,
      // Only one archive shard exists — the other is missing
      'archive/epic-MSSCI-14453.yaml': ARCHIVED_EPIC_14453,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Should count only the epic that exists (5 points from epic-80)
    expect(data.metrics.completed.points).toBe(5);
    expect(data.metrics.completed.epics).toBe(1);
  });
});
