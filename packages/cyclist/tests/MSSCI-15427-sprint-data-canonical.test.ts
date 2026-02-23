/**
 * MSSCI-15427: Migrate Cyclist sprint panel to canonical data service
 *
 * Tests that sprint-data.ts uses `pf sprint data --json` subprocess
 * instead of inline YAML parsing. The getSprintData() function should
 * be a thin wrapper that calls the CLI and parses JSON output.
 *
 * Story: MSSCI-15427 (125-6)
 * Epic: MSSCI-15421 (Sprint State Engine Consolidation)
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

// Mock child_process
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
// Test Fixtures — Canonical JSON (what `pf sprint data --json` returns)
// =============================================================================

const CANONICAL_JSON_OUTPUT = JSON.stringify({
  sprint: {
    name: 'TO Sprint 2608',
    jira_sprint_id: 310,
    jira_sprint_name: 'TO Sprint 2608',
    goal: 'Installation, agents and workflows',
    start_date: '2026-02-16',
    end_date: '2026-03-01',
    status: 'active',
    number: 2608,
  },
  epics: [
    {
      id: 'epic-125',
      jira: 'MSSCI-15421',
      title: 'Sprint State Engine Consolidation',
      description: 'Consolidate fragmented sprint state',
      priority: 'P2',
      status: 'in_progress',
      repos: 'pennyfarthing',
      stories: [
        {
          id: '125-5',
          jira: 'MSSCI-15426',
          title: 'Add pf sprint data --json canonical output',
          points: 2,
          priority: 'p2',
          status: 'done',
          workflow: 'tdd',
          assigned_to: 'keith.avery@1898andco.io',
          completed: '2026-02-23',
        },
        {
          id: '125-6',
          jira: 'MSSCI-15427',
          title: 'Migrate Cyclist sprint panel to canonical data service',
          points: 2,
          priority: 'p2',
          status: 'in_progress',
          workflow: 'tdd',
        },
        {
          id: '125-7',
          jira: 'MSSCI-15428',
          title: 'Implement story lifecycle state machine',
          points: 3,
          priority: 'p2',
          status: 'backlog',
          workflow: 'tdd',
        },
      ],
    },
  ],
  stories: [],
  standalone_stories: [],
  points: { total: 7, completed: 2, in_progress: 2, backlog: 3 },
  stories_count: { total: 3, done: 1, in_progress: 1, backlog: 1 },
  _orphans: [],
});

const PROJECT_DIR = '/test/project';

// =============================================================================
// AC1: Sprint panel data comes from pf sprint data --json subprocess
// =============================================================================

describe('AC1: getSprintData uses pf sprint data --json subprocess', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call execSync with pf sprint data --json', async () => {
    const mockExecSync = vi.mocked(execSync);
    mockExecSync.mockReturnValue(CANONICAL_JSON_OUTPUT);

    const { getSprintData } = await import('../src/sprint-data.js');
    getSprintData(PROJECT_DIR);

    // Verify execSync was called with 'pf sprint data --json'
    const calls = mockExecSync.mock.calls.map(c => String(c[0]));
    const dataCall = calls.find(c => c.includes('sprint data --json'));
    expect(dataCall).toBeDefined();
  });

  it('should parse JSON output from subprocess into SprintData', async () => {
    const mockExecSync = vi.mocked(execSync);
    mockExecSync.mockReturnValue(CANONICAL_JSON_OUTPUT);

    const { getSprintData } = await import('../src/sprint-data.js');
    const result = getSprintData(PROJECT_DIR);

    // Verify the parsed data flows through to the result
    expect(result.sprint.name).toContain('Sprint 2608');
    expect(result.epics.length).toBeGreaterThan(0);
    expect(result.epics[0].stories.length).toBe(3);
  });

  it('should return empty sprint data when subprocess fails', async () => {
    const mockExecSync = vi.mocked(execSync);
    mockExecSync.mockImplementation(() => {
      throw new Error('CLI not available');
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const result = getSprintData(PROJECT_DIR);

    // On failure, should return sensible defaults (not crash)
    expect(result).toBeDefined();
    expect(result.epics).toBeDefined();
    expect(Array.isArray(result.epics)).toBe(true);
  });
});

// =============================================================================
// AC2: sprint-data.ts no longer implements shard merging or YAML parsing
// =============================================================================

// Minimal YAML that lets the current (pre-refactor) code run without crashing
const MINIMAL_SPRINT_YAML = `
sprint:
  name: TO Sprint 2608
  end_date: "2026-03-01"
epics:
  - id: epic-125
    title: "Test Epic"
    jira: MSSCI-15421
    stories:
      - id: 125-6
        title: Test Story
        points: 2
        status: backlog
`;

const MINIMAL_FUTURE_YAML = `
future:
  initiatives: []
`;

describe('AC2: No inline YAML parsing in getSprintData', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should NOT call readFileSync for current-sprint.yaml', async () => {
    const mockExecSync = vi.mocked(execSync);
    mockExecSync.mockReturnValue(CANONICAL_JSON_OUTPUT);

    const mockReadFileSync = vi.mocked(readFileSync);
    const mockExistsSync = vi.mocked(existsSync);
    // Files exist on disk — the current code WILL try to read them
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('current-sprint.yaml')) return MINIMAL_SPRINT_YAML;
      if (p.includes('future.yaml')) return MINIMAL_FUTURE_YAML;
      if (p.includes('config.local.yaml')) return '';
      return '';
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    getSprintData(PROJECT_DIR);

    // readFileSync should NOT be called for sprint YAML files
    // (subprocess handles all YAML parsing now)
    const readCalls = mockReadFileSync.mock.calls.map(c => String(c[0]));
    const sprintYamlReads = readCalls.filter(path =>
      path.includes('current-sprint.yaml')
    );
    expect(sprintYamlReads).toHaveLength(0);
  });

  it('should NOT call readFileSync for epic shard files', async () => {
    const mockExecSync = vi.mocked(execSync);
    mockExecSync.mockReturnValue(CANONICAL_JSON_OUTPUT);

    const mockReadFileSync = vi.mocked(readFileSync);
    const mockExistsSync = vi.mocked(existsSync);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('current-sprint.yaml')) return MINIMAL_SPRINT_YAML;
      if (p.includes('future.yaml')) return MINIMAL_FUTURE_YAML;
      if (p.includes('config.local.yaml')) return '';
      return '';
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    getSprintData(PROJECT_DIR);

    const readCalls = mockReadFileSync.mock.calls.map(c => String(c[0]));
    const shardReads = readCalls.filter(path => path.match(/epic-.*\.yaml/));
    expect(shardReads).toHaveLength(0);
  });

  it('should NOT call readFileSync for future.yaml', async () => {
    const mockExecSync = vi.mocked(execSync);
    mockExecSync.mockReturnValue(CANONICAL_JSON_OUTPUT);

    const mockReadFileSync = vi.mocked(readFileSync);
    const mockExistsSync = vi.mocked(existsSync);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('current-sprint.yaml')) return MINIMAL_SPRINT_YAML;
      if (p.includes('future.yaml')) return MINIMAL_FUTURE_YAML;
      if (p.includes('config.local.yaml')) return '';
      return '';
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    getSprintData(PROJECT_DIR);

    const readCalls = mockReadFileSync.mock.calls.map(c => String(c[0]));
    const futureReads = readCalls.filter(path => path.includes('future.yaml'));
    expect(futureReads).toHaveLength(0);
  });
});

// =============================================================================
// AC3: WebSocket broadcast unchanged from consumer perspective
// =============================================================================

describe('AC3: SprintData output shape unchanged', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return SprintData with all required top-level fields', async () => {
    const mockExecSync = vi.mocked(execSync);
    mockExecSync.mockReturnValue(CANONICAL_JSON_OUTPUT);

    const { getSprintData } = await import('../src/sprint-data.js');
    const result = getSprintData(PROJECT_DIR);

    // These fields must exist for WebSocket consumers
    expect(result).toHaveProperty('currentStory');
    expect(result).toHaveProperty('nextStory');
    expect(result).toHaveProperty('epics');
    expect(result).toHaveProperty('completedEpics');
    expect(result).toHaveProperty('futureEpics');
    expect(result).toHaveProperty('sprint');
    expect(result).toHaveProperty('metrics');
  });

  it('should have sprint object with number, name, done, remaining, inProgress, endDate', async () => {
    const mockExecSync = vi.mocked(execSync);
    mockExecSync.mockReturnValue(CANONICAL_JSON_OUTPUT);

    const { getSprintData } = await import('../src/sprint-data.js');
    const result = getSprintData(PROJECT_DIR);

    expect(result.sprint).toHaveProperty('number');
    expect(result.sprint).toHaveProperty('name');
    expect(result.sprint).toHaveProperty('done');
    expect(result.sprint).toHaveProperty('remaining');
    expect(result.sprint).toHaveProperty('inProgress');
    expect(result.sprint).toHaveProperty('endDate');
    expect(typeof result.sprint.number).toBe('number');
  });

  it('should have metrics object with completed, current, future, velocity', async () => {
    const mockExecSync = vi.mocked(execSync);
    mockExecSync.mockReturnValue(CANONICAL_JSON_OUTPUT);

    const { getSprintData } = await import('../src/sprint-data.js');
    const result = getSprintData(PROJECT_DIR);

    expect(result.metrics).toHaveProperty('completed');
    expect(result.metrics).toHaveProperty('current');
    expect(result.metrics).toHaveProperty('future');
    expect(result.metrics).toHaveProperty('velocity');
  });

  it('should transform stories to SprintStory shape with jiraKey not jira', async () => {
    const mockExecSync = vi.mocked(execSync);
    mockExecSync.mockReturnValue(CANONICAL_JSON_OUTPUT);

    const { getSprintData } = await import('../src/sprint-data.js');
    const result = getSprintData(PROJECT_DIR);

    // Stories should use SprintStory interface (jiraKey, not jira)
    for (const epic of result.epics) {
      for (const story of epic.stories) {
        expect(story).toHaveProperty('jiraKey');
        expect(story).toHaveProperty('id');
        expect(story).toHaveProperty('title');
        expect(story).toHaveProperty('points');
        expect(story).toHaveProperty('status');
      }
    }
  });
});

// =============================================================================
// AC4: File watcher triggers subprocess refresh (not direct YAML read)
// =============================================================================

describe('AC4: Subprocess-based refresh on invocation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call subprocess on each getSprintData invocation (no stale cache)', async () => {
    const mockExecSync = vi.mocked(execSync);
    mockExecSync.mockReturnValue(CANONICAL_JSON_OUTPUT);

    const { getSprintData } = await import('../src/sprint-data.js');

    // Call twice to verify no stale caching
    getSprintData(PROJECT_DIR);
    getSprintData(PROJECT_DIR);

    // Should have called the data command at least twice (once per invocation)
    const calls = mockExecSync.mock.calls.map(c => String(c[0]));
    const dataCalls = calls.filter(c => c.includes('sprint data --json'));
    expect(dataCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('should pass projectDir as cwd to subprocess', async () => {
    const mockExecSync = vi.mocked(execSync);
    mockExecSync.mockReturnValue(CANONICAL_JSON_OUTPUT);

    const { getSprintData } = await import('../src/sprint-data.js');
    getSprintData(PROJECT_DIR);

    // Find the data command call and verify cwd
    const callIndex = mockExecSync.mock.calls.findIndex(c =>
      String(c[0]).includes('sprint data --json')
    );
    expect(callIndex).toBeGreaterThanOrEqual(0);

    const opts = mockExecSync.mock.calls[callIndex]?.[1] as Record<string, unknown> | undefined;
    expect(opts?.cwd).toBe(PROJECT_DIR);
  });
});
