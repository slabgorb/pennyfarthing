/**
 * MSSCI-14209: Sprint Data Layer Unit Tests
 *
 * Tests for sprint-data.ts - the data aggregation service that:
 * - Parses sprint/current-sprint.yaml and sprint/future.yaml
 * - Transforms YAML structures to typed SprintData
 * - Calculates sprint metrics (done/remaining/inProgress)
 * - Handles YAML parse errors gracefully
 *
 * Story: MSSCI-14209
 * Epic: MSSCI-14186 (Dockview Panel Migration)
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';

// Mock fs module before importing sprint-data
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

// Mock child_process for git user email
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
import { getStoryInfo } from '../src/story-parser.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const VALID_CURRENT_SPRINT_YAML = `
sprint:
  name: TO Sprint 2606
  end_date: "2026-02-15"
  jira_sprint_id: 277

epics:
  - id: epic-76
    title: "Epic: Dockview Panel Migration"
    jira: MSSCI-14186
    stories:
      - id: MSSCI-14187
        title: Tab overflow bug
        points: 3
        status: done
        jira: MSSCI-14187
      - id: MSSCI-14209
        title: Sprint panel metadata
        points: 5
        status: in_progress
        jira: MSSCI-14209
      - id: MSSCI-14188
        title: Split Progress panel
        points: 5
        status: backlog
        jira: MSSCI-14188
  - id: epic-74
    title: "Epic: Tool Use Visualization"
    jira: MSSCI-13394
    stories:
      - id: MSSCI-13395
        title: Tool intent summarizer
        points: 3
        status: done
        jira: MSSCI-13395
`;

const VALID_FUTURE_YAML = `
future:
  initiatives:
    - name: Bell Mode Enhancement
      description: Improve notification system
      status: ready
      total_points: 13
    - name: Agent Memory System
      description: Persistent agent context
      status: blocked
      total_points: 21
    - name: Completed Initiative
      status: complete
      total_points: 8
`;

const MALFORMED_YAML = `
sprint:
  name: Bad Sprint
epics:
  - id: epic-1
    title: Epic with bad YAML
    stories:
      - id: STORY-1
        title: 'Story with
        unmatched quote
`;

const MINIMAL_SPRINT_YAML = `
sprint:
  name: Empty Sprint
epics: []
`;

const YAML_WITH_ASSIGNED_STORIES = `
sprint:
  name: TO Sprint 2606
epics:
  - id: epic-90
    title: "Epic: Assigned Test"
    stories:
      - id: S-OTHER
        title: Story assigned to someone else
        points: 3
        status: backlog
        assigned_to: other.person@1898andco.io
      - id: S-MINE
        title: Story assigned to me
        points: 2
        status: backlog
        assigned_to: keith.avery@1898andco.io
      - id: S-UNASSIGNED
        title: Unassigned story
        points: 1
        status: backlog
`;

const YAML_WITH_ALTERNATE_STATUSES = `
sprint:
  name: TO Sprint 2607
epics:
  - id: epic-80
    title: Status Test Epic
    stories:
      - id: S1
        title: Completed story
        points: 2
        status: completed
      - id: S2
        title: In progress story
        points: 3
        status: in-progress
      - id: S3
        title: Canceled story
        points: 1
        status: canceled
      - id: S4
        title: Cancelled story
        points: 1
        status: cancelled
      - id: S5
        title: No status story
        points: 2
`;

// =============================================================================
// Test Setup
// =============================================================================

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;
const mockExecSync = execSync as unknown as ReturnType<typeof vi.fn>;
const mockGetStoryInfo = getStoryInfo as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: files don't exist
  mockExistsSync.mockReturnValue(false);
  mockReadFileSync.mockReturnValue('');
  mockGetStoryInfo.mockReturnValue({ id: null, title: null, phase: null });
  // Default: no git user configured
  mockExecSync.mockReturnValue('');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper to set up file mocks
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
// YAML Parsing Tests
// =============================================================================

describe('YAML Parsing', () => {
  it('should parse valid current-sprint.yaml', async () => {
    setupFileMocks({
      'current-sprint.yaml': VALID_CURRENT_SPRINT_YAML,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.sprint.name).toBe('TO Sprint 2606');
    expect(data.sprint.number).toBe(2606);
    expect(data.sprint.endDate).toBe('2026-02-15');
  });

  it('should parse valid future.yaml', async () => {
    setupFileMocks({
      'current-sprint.yaml': MINIMAL_SPRINT_YAML,
      'future.yaml': VALID_FUTURE_YAML,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.futureEpics).toHaveLength(2); // Excludes completed initiative
    expect(data.futureEpics[0].title).toBe('Bell Mode Enhancement');
    expect(data.futureEpics[0].status).toBe('ready');
    expect(data.futureEpics[1].title).toBe('Agent Memory System');
    expect(data.futureEpics[1].status).toBe('blocked');
  });

  it('should handle missing current-sprint.yaml gracefully', async () => {
    setupFileMocks({
      'current-sprint.yaml': null,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.epics).toEqual([]);
    expect(data.sprint.name).toBe('Unknown Sprint');
    expect(data.sprint.number).toBe(0);
  });

  it('should handle missing future.yaml gracefully', async () => {
    setupFileMocks({
      'current-sprint.yaml': VALID_CURRENT_SPRINT_YAML,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.futureEpics).toEqual([]);
    expect(data.epics).toHaveLength(2); // Current epics still parsed
  });

  it('should handle malformed YAML without crashing', async () => {
    setupFileMocks({
      'current-sprint.yaml': MALFORMED_YAML,
      'future.yaml': null,
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Should return empty/default data, not throw
    expect(data.epics).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should strip "Epic: " prefix from epic titles', async () => {
    setupFileMocks({
      'current-sprint.yaml': VALID_CURRENT_SPRINT_YAML,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.epics[0].title).toBe('Dockview Panel Migration');
    expect(data.epics[1].title).toBe('Tool Use Visualization');
  });
});

// =============================================================================
// Status Mapping Tests
// =============================================================================

describe('Status Mapping', () => {
  it('should map standard status values correctly', async () => {
    setupFileMocks({
      'current-sprint.yaml': VALID_CURRENT_SPRINT_YAML,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    const stories = data.epics[0].stories;
    expect(stories[0].status).toBe('done');
    expect(stories[1].status).toBe('in_progress');
    expect(stories[2].status).toBe('backlog');
  });

  it('should map alternate status strings', async () => {
    setupFileMocks({
      'current-sprint.yaml': YAML_WITH_ALTERNATE_STATUSES,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    const stories = data.epics[0].stories;
    expect(stories[0].status).toBe('done'); // 'completed' -> 'done'
    expect(stories[1].status).toBe('in_progress'); // 'in-progress' -> 'in_progress'
    expect(stories[2].status).toBe('cancelled'); // 'canceled' -> 'cancelled'
    expect(stories[3].status).toBe('cancelled'); // 'cancelled' -> 'cancelled'
    expect(stories[4].status).toBe('backlog'); // undefined -> 'backlog'
  });

  it('should map future initiative status correctly', async () => {
    setupFileMocks({
      'current-sprint.yaml': MINIMAL_SPRINT_YAML,
      'future.yaml': VALID_FUTURE_YAML,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.futureEpics[0].status).toBe('ready');
    expect(data.futureEpics[1].status).toBe('blocked');
  });

  it('should default missing status to backlog/planning', async () => {
    const yamlWithNoStatus = `
sprint:
  name: Test Sprint
epics:
  - id: epic-1
    title: Test Epic
    stories:
      - id: S1
        title: Story without status
        points: 3
`;

    setupFileMocks({
      'current-sprint.yaml': yamlWithNoStatus,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.epics[0].stories[0].status).toBe('backlog');
  });
});

// =============================================================================
// Sprint Metrics Calculation Tests
// =============================================================================

describe('Sprint Metrics Calculation', () => {
  it('should calculate done points correctly', async () => {
    setupFileMocks({
      'current-sprint.yaml': VALID_CURRENT_SPRINT_YAML,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Epic 76: 3 done, Epic 74: 3 done = 6 total done
    expect(data.sprint.done).toBe(6);
  });

  it('should calculate in_progress points correctly', async () => {
    setupFileMocks({
      'current-sprint.yaml': VALID_CURRENT_SPRINT_YAML,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Epic 76: 5 in_progress
    expect(data.sprint.inProgress).toBe(5);
  });

  it('should calculate remaining points correctly', async () => {
    setupFileMocks({
      'current-sprint.yaml': VALID_CURRENT_SPRINT_YAML,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Epic 76: 5 backlog
    expect(data.sprint.remaining).toBe(5);
  });

  it('should handle epics with no stories', async () => {
    const yamlWithEmptyEpic = `
sprint:
  name: Test Sprint
epics:
  - id: epic-empty
    title: Empty Epic
    stories: []
`;

    setupFileMocks({
      'current-sprint.yaml': yamlWithEmptyEpic,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.sprint.done).toBe(0);
    expect(data.sprint.inProgress).toBe(0);
    expect(data.sprint.remaining).toBe(0);
  });

  it('should handle stories with missing points (default to 0)', async () => {
    const yamlWithMissingPoints = `
sprint:
  name: Test Sprint
epics:
  - id: epic-1
    title: Test Epic
    stories:
      - id: S1
        title: Story without points
        status: done
`;

    setupFileMocks({
      'current-sprint.yaml': yamlWithMissingPoints,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.epics[0].stories[0].points).toBe(0);
    expect(data.sprint.done).toBe(0);
  });

  it('should extract sprint number from name', async () => {
    setupFileMocks({
      'current-sprint.yaml': VALID_CURRENT_SPRINT_YAML,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.sprint.number).toBe(2606);
  });

  it('should handle sprint name without number', async () => {
    const yamlWithNoNumber = `
sprint:
  name: Unnamed Sprint
epics: []
`;

    setupFileMocks({
      'current-sprint.yaml': yamlWithNoNumber,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.sprint.number).toBe(0);
  });
});

// =============================================================================
// Current/Next Story Detection Tests
// =============================================================================

describe('Current/Next Story Detection', () => {
  it('should find current story from session', async () => {
    setupFileMocks({
      'current-sprint.yaml': VALID_CURRENT_SPRINT_YAML,
      'future.yaml': null,
    });

    mockGetStoryInfo.mockReturnValue({
      id: 'MSSCI-14209',
      title: 'Sprint panel metadata',
      phase: 'red',
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.currentStory).not.toBeNull();
    expect(data.currentStory?.id).toBe('MSSCI-14209');
    expect(data.nextStory).toBeNull();
  });

  it('should find next backlog story when no current story', async () => {
    setupFileMocks({
      'current-sprint.yaml': VALID_CURRENT_SPRINT_YAML,
      'future.yaml': null,
    });

    mockGetStoryInfo.mockReturnValue({ id: null, title: null, phase: null });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.currentStory).toBeNull();
    expect(data.nextStory).not.toBeNull();
    expect(data.nextStory?.id).toBe('MSSCI-14188'); // First backlog story
  });

  it('should return null for both when all stories done', async () => {
    const allDoneYaml = `
sprint:
  name: Complete Sprint
epics:
  - id: epic-1
    title: Done Epic
    stories:
      - id: S1
        title: Done story
        points: 3
        status: done
`;

    setupFileMocks({
      'current-sprint.yaml': allDoneYaml,
      'future.yaml': null,
    });

    mockGetStoryInfo.mockReturnValue({ id: null, title: null, phase: null });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.currentStory).toBeNull();
    expect(data.nextStory).toBeNull();
  });
});

// =============================================================================
// Next-Up Assigned Story Selection (100-8)
// =============================================================================

describe('Next-Up Assigned Story Selection (100-8)', () => {
  it('should prefer backlog story assigned to current user', async () => {
    setupFileMocks({
      'current-sprint.yaml': YAML_WITH_ASSIGNED_STORIES,
      'future.yaml': null,
    });
    mockGetStoryInfo.mockReturnValue({ id: null, title: null, phase: null });
    mockExecSync.mockReturnValue('keith.avery@1898andco.io\n');

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.nextStory).not.toBeNull();
    expect(data.nextStory?.id).toBe('S-MINE');
  });

  it('should fall back to unassigned story when no stories assigned to user', async () => {
    setupFileMocks({
      'current-sprint.yaml': YAML_WITH_ASSIGNED_STORIES,
      'future.yaml': null,
    });
    mockGetStoryInfo.mockReturnValue({ id: null, title: null, phase: null });
    mockExecSync.mockReturnValue('unknown.user@1898andco.io\n');

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.nextStory).not.toBeNull();
    expect(data.nextStory?.id).toBe('S-UNASSIGNED');
  });

  it('should skip stories assigned to others', async () => {
    const yamlAllAssigned = `
sprint:
  name: Test Sprint
epics:
  - id: epic-1
    title: Test Epic
    stories:
      - id: S-OTHER1
        title: Someone elses story
        points: 3
        status: backlog
        assigned_to: other.person@1898andco.io
      - id: S-OTHER2
        title: Another persons story
        points: 2
        status: backlog
        assigned_to: another.person@1898andco.io
`;

    setupFileMocks({
      'current-sprint.yaml': yamlAllAssigned,
      'future.yaml': null,
    });
    mockGetStoryInfo.mockReturnValue({ id: null, title: null, phase: null });
    mockExecSync.mockReturnValue('keith.avery@1898andco.io\n');

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.nextStory).toBeNull();
  });

  it('should fall back to unassigned when git email unavailable', async () => {
    setupFileMocks({
      'current-sprint.yaml': YAML_WITH_ASSIGNED_STORIES,
      'future.yaml': null,
    });
    mockGetStoryInfo.mockReturnValue({ id: null, title: null, phase: null });
    mockExecSync.mockImplementation(() => { throw new Error('no git'); });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.nextStory).not.toBeNull();
    expect(data.nextStory?.id).toBe('S-UNASSIGNED');
  });
});

// =============================================================================
// Epic/Story Transformation Tests
// =============================================================================

describe('Epic/Story Transformation', () => {
  it('should transform epic with all fields', async () => {
    setupFileMocks({
      'current-sprint.yaml': VALID_CURRENT_SPRINT_YAML,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    const epic = data.epics[0];
    expect(epic.id).toBe('epic-76');
    expect(epic.title).toBe('Dockview Panel Migration');
    expect(epic.jiraKey).toBe('MSSCI-14186');
    expect(epic.stories).toHaveLength(3);
  });

  it('should transform story with all fields', async () => {
    setupFileMocks({
      'current-sprint.yaml': VALID_CURRENT_SPRINT_YAML,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    const story = data.epics[0].stories[0];
    expect(story.id).toBe('MSSCI-14187');
    expect(story.title).toBe('Tab overflow bug');
    expect(story.points).toBe(3);
    expect(story.status).toBe('done');
    expect(story.jiraKey).toBe('MSSCI-14187');
  });

  it('should handle epic without jira key', async () => {
    const yamlWithNoJira = `
sprint:
  name: Test Sprint
epics:
  - id: epic-local
    title: Local Epic
    stories:
      - id: LOCAL-1
        title: Local story
        points: 2
`;

    setupFileMocks({
      'current-sprint.yaml': yamlWithNoJira,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.epics[0].jiraKey).toBeNull();
    expect(data.epics[0].stories[0].jiraKey).toBeNull();
  });

  it('should filter completed initiatives from future epics', async () => {
    setupFileMocks({
      'current-sprint.yaml': MINIMAL_SPRINT_YAML,
      'future.yaml': VALID_FUTURE_YAML,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Should have 2 (ready + blocked), not 3 (excludes complete)
    expect(data.futureEpics).toHaveLength(2);
    expect(data.futureEpics.every(e => e.title !== 'Completed Initiative')).toBe(true);
  });

  it('should generate future epic id from name', async () => {
    setupFileMocks({
      'current-sprint.yaml': MINIMAL_SPRINT_YAML,
      'future.yaml': VALID_FUTURE_YAML,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.futureEpics[0].id).toBe('bell-mode-enhancement');
    expect(data.futureEpics[1].id).toBe('agent-memory-system');
  });
});

// =============================================================================
// Archive/Promote Actions (Stub Tests)
// =============================================================================

describe('Archive/Promote Actions', () => {
  it('should throw "not implemented" for archiveEpic', async () => {
    const { archiveEpic } = await import('../src/sprint-data.js');

    await expect(archiveEpic('/test/project', 'epic-1')).rejects.toThrow(
      'Archive epic not yet implemented'
    );
  });

  it('should throw "not implemented" for promoteEpic', async () => {
    const { promoteEpic } = await import('../src/sprint-data.js');

    await expect(promoteEpic('/test/project', 'epic-1')).rejects.toThrow(
      'Promote epic not yet implemented'
    );
  });
});

// =============================================================================
// NEW: Context File Existence Tests (MSSCI-14209)
// =============================================================================

describe('Context File Existence (MSSCI-14209)', () => {
  it('should detect epic context file existence', async () => {
    setupFileMocks({
      'current-sprint.yaml': VALID_CURRENT_SPRINT_YAML,
      'future.yaml': null,
      'context-epic-76.md': '# Epic 76 Context',
      'context-epic-74.md': '# Epic 74 Context',
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // This test will FAIL until hasContext is implemented
    expect(data.epics[0]).toHaveProperty('hasContext');
    expect(data.epics[0].hasContext).toBe(true);
  });

  it('should detect missing epic context file', async () => {
    setupFileMocks({
      'current-sprint.yaml': VALID_CURRENT_SPRINT_YAML,
      'future.yaml': null,
      // No context files
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // This test will FAIL until hasContext is implemented
    expect(data.epics[0]).toHaveProperty('hasContext');
    expect(data.epics[0].hasContext).toBe(false);
  });

  it('should detect story context file existence', async () => {
    setupFileMocks({
      'current-sprint.yaml': VALID_CURRENT_SPRINT_YAML,
      'future.yaml': null,
      'MSSCI-14187-context.md': '# Story Context',
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // This test will FAIL until hasContext is implemented on stories
    const story = data.epics[0].stories[0];
    expect(story).toHaveProperty('hasContext');
    expect(story.hasContext).toBe(true);
  });
});

// =============================================================================
// NEW: Blocked Status Support (MSSCI-14209)
// =============================================================================

describe('Blocked Status Support (MSSCI-14209)', () => {
  it('should map "blocked" status for stories', async () => {
    const yamlWithBlocked = `
sprint:
  name: Test Sprint
epics:
  - id: epic-1
    title: Test Epic
    stories:
      - id: S1
        title: Blocked story
        points: 3
        status: blocked
`;

    setupFileMocks({
      'current-sprint.yaml': yamlWithBlocked,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // This test will FAIL until blocked status is added to the type
    expect(data.epics[0].stories[0].status).toBe('blocked');
  });

  it('should not count blocked stories in remaining points', async () => {
    const yamlWithBlocked = `
sprint:
  name: Test Sprint
epics:
  - id: epic-1
    title: Test Epic
    stories:
      - id: S1
        title: Blocked story
        points: 3
        status: blocked
      - id: S2
        title: Backlog story
        points: 5
        status: backlog
`;

    setupFileMocks({
      'current-sprint.yaml': yamlWithBlocked,
      'future.yaml': null,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Blocked stories should not be counted as remaining
    // This test will FAIL until blocked handling is implemented
    expect(data.sprint.remaining).toBe(5); // Only backlog, not blocked
  });
});
