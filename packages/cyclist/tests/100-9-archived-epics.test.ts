/**
 * Story 100-9: Wire archived epics into completed section
 *
 * Tests that getSprintData() loads archived epics from:
 * 1. sprint/sprint-{N}-completed.yaml (completed_epics refs)
 * 2. sprint/archive/epic-{ref}.yaml (epic shard data)
 *
 * And merges them into the epics[] array so SprintPanel's
 * isEpicCompleted() filter picks them up naturally.
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
        title: Active story
        points: 3
        status: in_progress
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
completed_stories:
  - id: 83-3
    epic: epic-83
    title: "Orphan completed story"
    points: 2
    completed: 2026-02-09
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
id: epic-81
title: Connection Reliability
jira: MSSCI-14469
status: done
completed: '2026-02-08'
`;

// =============================================================================
// Test Setup
// =============================================================================

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
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
// AC2: Load archived epics from sprint-{N}-completed.yaml
// =============================================================================

describe('Archived Epic Loading (AC2)', () => {
  it('should load archived epics from sprint-{N}-completed.yaml refs', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
      'sprint-2606-completed.yaml': COMPLETED_YAML,
      'archive/epic-MSSCI-14453.yaml': ARCHIVED_EPIC_14453,
      'archive/epic-MSSCI-14469.yaml': ARCHIVED_EPIC_14469,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Should have 3 epics: 1 active + 2 archived
    expect(data.epics).toHaveLength(3);
  });

  it('should include archived epic stories with correct fields', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
      'sprint-2606-completed.yaml': COMPLETED_YAML,
      'archive/epic-MSSCI-14453.yaml': ARCHIVED_EPIC_14453,
      'archive/epic-MSSCI-14469.yaml': ARCHIVED_EPIC_14469,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Find the archived epic by id
    const archivedEpic = data.epics.find(e => e.id === 'epic-80');
    expect(archivedEpic).toBeDefined();
    expect(archivedEpic!.title).toBe('Code Markers Tool');
    expect(archivedEpic!.jiraKey).toBe('MSSCI-14453');
    expect(archivedEpic!.stories).toHaveLength(2);
    expect(archivedEpic!.stories[0].status).toBe('done');
    expect(archivedEpic!.stories[1].status).toBe('done');
  });

  it('should load multiple archived epics from refs list', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
      'sprint-2606-completed.yaml': COMPLETED_YAML,
      'archive/epic-MSSCI-14453.yaml': ARCHIVED_EPIC_14453,
      'archive/epic-MSSCI-14469.yaml': ARCHIVED_EPIC_14469,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    const archivedIds = data.epics
      .filter(e => e.id !== 'epic-99') // exclude active
      .map(e => e.id);
    expect(archivedIds).toContain('epic-80');
    expect(archivedIds).toContain('epic-81');
  });

  it('should resolve sprint number from current sprint name for completed file lookup', async () => {
    // Sprint name "TO Sprint 2606" → look for sprint-2606-completed.yaml
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
      'sprint-2606-completed.yaml': COMPLETED_YAML,
      'archive/epic-MSSCI-14453.yaml': ARCHIVED_EPIC_14453,
      'archive/epic-MSSCI-14469.yaml': ARCHIVED_EPIC_14469,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Verify it found the completed file by checking archived epics loaded
    const archivedEpics = data.epics.filter(e => e.id !== 'epic-99');
    expect(archivedEpics.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Graceful Degradation
// =============================================================================

describe('Archived Epic Graceful Degradation', () => {
  it('should handle missing sprint-{N}-completed.yaml gracefully', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
      // No completed file
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Should still return active epics without error
    expect(data.epics).toHaveLength(1);
    expect(data.epics[0].id).toBe('epic-99');
  });

  it('should handle missing archive shard gracefully', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
      'sprint-2606-completed.yaml': COMPLETED_YAML,
      // MSSCI-14453 shard exists, MSSCI-14469 does NOT
      'archive/epic-MSSCI-14453.yaml': ARCHIVED_EPIC_14453,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Should load the one that exists, skip the missing one
    const archivedEpics = data.epics.filter(e => e.id !== 'epic-99');
    expect(archivedEpics).toHaveLength(1);
    expect(archivedEpics[0].id).toBe('epic-80');
  });

  it('should handle malformed archive shard gracefully', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
      'sprint-2606-completed.yaml': COMPLETED_YAML,
      'archive/epic-MSSCI-14453.yaml': 'this is: [not valid: yaml',
      'archive/epic-MSSCI-14469.yaml': ARCHIVED_EPIC_14469,
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Should skip the malformed one, load the valid one
    const archivedEpics = data.epics.filter(e => e.id !== 'epic-99');
    expect(archivedEpics).toHaveLength(1);
    expect(archivedEpics[0].id).toBe('epic-81');

    consoleSpy.mockRestore();
  });

  it('should handle empty completed_epics list', async () => {
    const emptyCompleted = `
sprint:
  name: "TO Sprint 2606"
  number: 2606
completed_epics: []
completed_stories: []
`;
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
      'sprint-2606-completed.yaml': emptyCompleted,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Should only have the active epic
    expect(data.epics).toHaveLength(1);
    expect(data.epics[0].id).toBe('epic-99');
  });
});

// =============================================================================
// AC3: Archived epics appear as completed (all stories done)
// =============================================================================

describe('Archived Epics as Completed (AC3/AC4)', () => {
  it('archived epics should have all stories with done status', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
      'sprint-2606-completed.yaml': COMPLETED_YAML,
      'archive/epic-MSSCI-14453.yaml': ARCHIVED_EPIC_14453,
      'archive/epic-MSSCI-14469.yaml': ARCHIVED_EPIC_14469,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    const archivedEpics = data.epics.filter(e => e.id !== 'epic-99');
    for (const epic of archivedEpics) {
      expect(epic.stories.length).toBeGreaterThan(0);
      for (const story of epic.stories) {
        expect(story.status).toBe('done');
      }
    }
  });

  it('archived epic stories should have proper SprintStory fields', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
      'sprint-2606-completed.yaml': COMPLETED_YAML,
      'archive/epic-MSSCI-14453.yaml': ARCHIVED_EPIC_14453,
      'archive/epic-MSSCI-14469.yaml': ARCHIVED_EPIC_14469,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    const archivedEpic = data.epics.find(e => e.id === 'epic-80');
    expect(archivedEpic).toBeDefined();

    const story = archivedEpic!.stories[0];
    expect(story.id).toBe('80-1');
    expect(story.title).toBe('Python codemarkers module');
    expect(story.points).toBe(2);
    expect(story.status).toBe('done');
    expect(story.jiraKey).toBe('MSSCI-14454');
    expect(story.completed).toBe('2026-02-08');
  });

  it('archived epic done points should be included in sprint totals', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
      'sprint-2606-completed.yaml': COMPLETED_YAML,
      'archive/epic-MSSCI-14453.yaml': ARCHIVED_EPIC_14453,
      'archive/epic-MSSCI-14469.yaml': ARCHIVED_EPIC_14469,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Sprint totals include all work: active + archived
    // Active: 3 in_progress, 0 done
    // Archived: epic-80(4pts) + epic-81(3pts) = 7 done
    expect(data.sprint.inProgress).toBe(3);
    expect(data.sprint.done).toBe(7);
  });
});

// =============================================================================
// AC1: Archived epic shard metadata
// =============================================================================

describe('Archived Epic Shard Metadata (AC1)', () => {
  it('archived epic shard should have id and title fields', async () => {
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
      'sprint-2606-completed.yaml': COMPLETED_YAML,
      'archive/epic-MSSCI-14453.yaml': ARCHIVED_EPIC_14453,
      'archive/epic-MSSCI-14469.yaml': ARCHIVED_EPIC_14469,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    const epic80 = data.epics.find(e => e.id === 'epic-80');
    expect(epic80).toBeDefined();
    expect(epic80!.id).toBe('epic-80');
    expect(epic80!.title).toBe('Code Markers Tool');

    const epic81 = data.epics.find(e => e.id === 'epic-81');
    expect(epic81).toBeDefined();
    expect(epic81!.id).toBe('epic-81');
    expect(epic81!.title).toBe('Connection Reliability');
  });

  it('archived epic shard without id should be skipped', async () => {
    const shardNoId = `
stories:
  - id: 80-1
    title: 'Some story'
    points: 2
    status: done
title: Epic Without ID
`;
    setupFileMocks({
      'current-sprint.yaml': CURRENT_SPRINT_YAML,
      'future.yaml': null,
      'sprint-2606-completed.yaml': COMPLETED_YAML,
      'archive/epic-MSSCI-14453.yaml': shardNoId,
      'archive/epic-MSSCI-14469.yaml': ARCHIVED_EPIC_14469,
    });

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Only the valid epic should load
    const archivedEpics = data.epics.filter(e => e.id !== 'epic-99');
    expect(archivedEpics).toHaveLength(1);
    expect(archivedEpics[0].id).toBe('epic-81');

    consoleSpy.mockRestore();
  });
});
