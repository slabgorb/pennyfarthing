/**
 * 118-1: Future Epics in Sprint Panel
 *
 * Tests for adding future epics (child epics within initiatives) to the
 * Sprint Panel. Currently, futureEpics only contain initiative-level data.
 * This story adds the child epics within each initiative so users can see
 * upcoming work grouped by initiative with epic titles, points, and status.
 *
 * Story: 118-1
 * Epic: MSSCI-15184 (BikeRack TUI — Interactive Command Center)
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

// =============================================================================
// Test Fixtures
// =============================================================================

const MINIMAL_SPRINT_YAML = `
sprint:
  name: TO Sprint 2608
  end_date: "2026-03-01"
epics: []
`;

/** Initiative with epic string refs that need resolution */
const FUTURE_WITH_EPIC_REFS = `
future:
  initiatives:
    - benchmarking
    - install-architecture-rethink
`;

const INITIATIVE_BENCHMARKING_YAML = `
name: Benchmarking
description: Research-backed improvements to agent benchmarking
status: research_complete
blocked_by: Need stable benchmark baseline
total_points: 59
epics:
  - MSSCI-12792
  - epic-42
  - epic-43
`;

const INITIATIVE_INSTALL_YAML = `
name: Install Architecture Rethink
description: Redesign installation into a three-phase progressive system
status: backlog
total_points: 55
epics:
  - epic-111
  - epic-112
`;

/** Epic shard for MSSCI-12792 */
const EPIC_MSSCI_12792_YAML = `
id: '40'
type: epic
title: 'Epic: Precision/Recall Detection Scoring'
jira: MSSCI-12792
priority: p1
status: planning
stories:
  - id: 40-1
    title: Implement precision scoring
    points: 3
    status: backlog
  - id: 40-2
    title: Implement recall scoring
    points: 5
    status: backlog
`;

/** Epic shard for epic-42 */
const EPIC_42_YAML = `
id: '42'
type: epic
title: 'Epic: Anchored Rubric Criteria'
priority: p1
status: planning
stories:
  - id: 42-1
    title: Design rubric anchors
    points: 3
    status: backlog
  - id: 42-2
    title: Implement anchor scoring
    points: 3
    status: backlog
`;

/** Epic shard for epic-43 */
const EPIC_43_YAML = `
id: '43'
type: epic
title: 'Epic: False Positive Traps'
priority: p1
status: blocked
stories:
  - id: 43-1
    title: Create red herring test cases
    points: 4
    status: backlog
  - id: 43-2
    title: Implement trap scoring
    points: 3
    status: backlog
`;

/** Epic shard for epic-111 */
const EPIC_111_YAML = `
id: '111'
type: epic
title: 'Epic: Spike — Validate Frontmatter Hooks'
priority: p1
status: backlog
stories:
  - id: 111-1
    title: Test frontmatter hooks with agents
    points: 2
    status: backlog
  - id: 111-2
    title: Test frontmatter hooks with skill directories
    points: 2
    status: backlog
  - id: 111-3
    title: Document spike findings
    points: 1
    status: backlog
`;

/** Epic shard for epic-112 */
const EPIC_112_YAML = `
id: '112'
type: epic
title: 'Epic: Minimal Init — Fast, Silent, Node-Only Bootstrap'
priority: p1
status: backlog
stories:
  - id: 112-1
    title: Rewrite init command
    points: 5
    status: backlog
  - id: 112-2
    title: Write session-start.js
    points: 3
    status: backlog
`;

/** Initiative with inline data (no string refs) */
const FUTURE_WITH_INLINE_INITIATIVES = `
future:
  initiatives:
    - name: Progress Panel
      description: Better progress tracking
      status: ready
      total_points: 12
      epics:
        - id: epic-50
          title: 'Epic: Progress Bar Redesign'
          status: in_progress
          stories:
            - id: 50-1
              title: Redesign progress bar
              points: 5
              status: backlog
            - id: 50-2
              title: Add animation
              points: 3
              status: backlog
        - id: epic-51
          title: 'Epic: Milestone Tracking'
          status: planning
          stories:
            - id: 51-1
              title: Add milestone markers
              points: 4
              status: backlog
`;

/** Initiative where one epic shard is missing */
const FUTURE_WITH_MISSING_SHARD = `
future:
  initiatives:
    - partial-initiative
`;

const INITIATIVE_PARTIAL_YAML = `
name: Partial Initiative
description: Some epic shards are missing
status: backlog
total_points: 10
epics:
  - epic-200
  - epic-999
`;

const EPIC_200_YAML = `
id: '200'
type: epic
title: 'Epic: Existing Epic'
status: backlog
stories:
  - id: 200-1
    title: A real story
    points: 5
    status: backlog
`;

// =============================================================================
// Test Setup
// =============================================================================

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;
const mockExecSync = execSync as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
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
      // Use endsWith for exact filename matching — includes() is too permissive
      // and masks bugs like double-prefix paths (epic-epic-42.yaml matching epic-42.yaml)
      if (path.endsWith(pattern) && content !== null) {
        return true;
      }
    }
    return false;
  });

  mockReadFileSync.mockImplementation((path: string) => {
    for (const [pattern, content] of Object.entries(files)) {
      if (path.endsWith(pattern) && content !== null) {
        return content;
      }
    }
    throw new Error(`File not found: ${path}`);
  });
}

// =============================================================================
// AC 1: Sprint Panel displays future epics from future.yaml
// =============================================================================

describe('AC 1: FutureEpic includes child epics', () => {
  it('should include children array on each FutureEpic', async () => {
    setupFileMocks({
      'current-sprint.yaml': MINIMAL_SPRINT_YAML,
      'future.yaml': FUTURE_WITH_EPIC_REFS,
      'initiative-benchmarking.yaml': INITIATIVE_BENCHMARKING_YAML,
      'initiative-install-architecture-rethink.yaml': INITIATIVE_INSTALL_YAML,
      'epic-MSSCI-12792.yaml': EPIC_MSSCI_12792_YAML,
      'epic-42.yaml': EPIC_42_YAML,
      'epic-43.yaml': EPIC_43_YAML,
      'epic-111.yaml': EPIC_111_YAML,
      'epic-112.yaml': EPIC_112_YAML,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Each futureEpic (initiative) should have a children array
    expect(data.futureEpics).toHaveLength(2);
    for (const fe of data.futureEpics) {
      expect(fe).toHaveProperty('children');
      expect(Array.isArray(fe.children)).toBe(true);
    }
  });

  it('should resolve epic string refs to child epic objects', async () => {
    setupFileMocks({
      'current-sprint.yaml': MINIMAL_SPRINT_YAML,
      'future.yaml': FUTURE_WITH_EPIC_REFS,
      'initiative-benchmarking.yaml': INITIATIVE_BENCHMARKING_YAML,
      'initiative-install-architecture-rethink.yaml': INITIATIVE_INSTALL_YAML,
      'epic-MSSCI-12792.yaml': EPIC_MSSCI_12792_YAML,
      'epic-42.yaml': EPIC_42_YAML,
      'epic-43.yaml': EPIC_43_YAML,
      'epic-111.yaml': EPIC_111_YAML,
      'epic-112.yaml': EPIC_112_YAML,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Benchmarking initiative should have 3 child epics
    const benchmarking = data.futureEpics.find(fe => fe.title === 'Benchmarking');
    expect(benchmarking).toBeDefined();
    expect(benchmarking!.children).toHaveLength(3);

    // Install initiative should have 2 child epics
    const install = data.futureEpics.find(fe => fe.title === 'Install Architecture Rethink');
    expect(install).toBeDefined();
    expect(install!.children).toHaveLength(2);
  });

  it('should handle inline epic objects within initiatives', async () => {
    setupFileMocks({
      'current-sprint.yaml': MINIMAL_SPRINT_YAML,
      'future.yaml': FUTURE_WITH_INLINE_INITIATIVES,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    const progress = data.futureEpics.find(fe => fe.title === 'Progress Panel');
    expect(progress).toBeDefined();
    expect(progress!.children).toHaveLength(2);
    expect(progress!.children[0].title).toContain('Progress Bar Redesign');
  });

  it('should return empty children array when initiative has no epics', async () => {
    const noEpicsInit = `
future:
  initiatives:
    - name: Empty Initiative
      description: No epics yet
      status: planning
      total_points: 0
`;

    setupFileMocks({
      'current-sprint.yaml': MINIMAL_SPRINT_YAML,
      'future.yaml': noEpicsInit,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    expect(data.futureEpics).toHaveLength(1);
    expect(data.futureEpics[0].children).toEqual([]);
  });
});

// =============================================================================
// AC 2: Future epics grouped by initiative
// =============================================================================

describe('AC 2: Future epics grouped by initiative', () => {
  it('should group child epics under the correct initiative', async () => {
    setupFileMocks({
      'current-sprint.yaml': MINIMAL_SPRINT_YAML,
      'future.yaml': FUTURE_WITH_EPIC_REFS,
      'initiative-benchmarking.yaml': INITIATIVE_BENCHMARKING_YAML,
      'initiative-install-architecture-rethink.yaml': INITIATIVE_INSTALL_YAML,
      'epic-MSSCI-12792.yaml': EPIC_MSSCI_12792_YAML,
      'epic-42.yaml': EPIC_42_YAML,
      'epic-43.yaml': EPIC_43_YAML,
      'epic-111.yaml': EPIC_111_YAML,
      'epic-112.yaml': EPIC_112_YAML,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    const benchmarking = data.futureEpics.find(fe => fe.title === 'Benchmarking');
    const childIds = benchmarking!.children.map(c => c.id);
    expect(childIds).toContain('40');
    expect(childIds).toContain('42');
    expect(childIds).toContain('43');

    const install = data.futureEpics.find(fe => fe.title === 'Install Architecture Rethink');
    const installChildIds = install!.children.map(c => c.id);
    expect(installChildIds).toContain('111');
    expect(installChildIds).toContain('112');

    // No cross-contamination
    expect(childIds).not.toContain('111');
    expect(installChildIds).not.toContain('40');
  });

  it('should preserve initiative ordering from future.yaml', async () => {
    setupFileMocks({
      'current-sprint.yaml': MINIMAL_SPRINT_YAML,
      'future.yaml': FUTURE_WITH_EPIC_REFS,
      'initiative-benchmarking.yaml': INITIATIVE_BENCHMARKING_YAML,
      'initiative-install-architecture-rethink.yaml': INITIATIVE_INSTALL_YAML,
      'epic-MSSCI-12792.yaml': EPIC_MSSCI_12792_YAML,
      'epic-42.yaml': EPIC_42_YAML,
      'epic-43.yaml': EPIC_43_YAML,
      'epic-111.yaml': EPIC_111_YAML,
      'epic-112.yaml': EPIC_112_YAML,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Benchmarking listed first in future.yaml
    expect(data.futureEpics[0].title).toBe('Benchmarking');
    expect(data.futureEpics[1].title).toBe('Install Architecture Rethink');
  });
});

// =============================================================================
// AC 3: Shows epic title, point total, and blocked status
// =============================================================================

describe('AC 3: Child epic fields — title, points, status', () => {
  it('should include title for each child epic (stripped of "Epic: " prefix)', async () => {
    setupFileMocks({
      'current-sprint.yaml': MINIMAL_SPRINT_YAML,
      'future.yaml': FUTURE_WITH_EPIC_REFS,
      'initiative-benchmarking.yaml': INITIATIVE_BENCHMARKING_YAML,
      'initiative-install-architecture-rethink.yaml': INITIATIVE_INSTALL_YAML,
      'epic-MSSCI-12792.yaml': EPIC_MSSCI_12792_YAML,
      'epic-42.yaml': EPIC_42_YAML,
      'epic-43.yaml': EPIC_43_YAML,
      'epic-111.yaml': EPIC_111_YAML,
      'epic-112.yaml': EPIC_112_YAML,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    const benchmarking = data.futureEpics.find(fe => fe.title === 'Benchmarking');
    const precisionEpic = benchmarking!.children.find(c => c.id === '40');
    expect(precisionEpic).toBeDefined();
    // Should strip "Epic: " prefix
    expect(precisionEpic!.title).toBe('Precision/Recall Detection Scoring');
  });

  it('should calculate total points from child stories', async () => {
    setupFileMocks({
      'current-sprint.yaml': MINIMAL_SPRINT_YAML,
      'future.yaml': FUTURE_WITH_EPIC_REFS,
      'initiative-benchmarking.yaml': INITIATIVE_BENCHMARKING_YAML,
      'initiative-install-architecture-rethink.yaml': INITIATIVE_INSTALL_YAML,
      'epic-MSSCI-12792.yaml': EPIC_MSSCI_12792_YAML,
      'epic-42.yaml': EPIC_42_YAML,
      'epic-43.yaml': EPIC_43_YAML,
      'epic-111.yaml': EPIC_111_YAML,
      'epic-112.yaml': EPIC_112_YAML,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    const benchmarking = data.futureEpics.find(fe => fe.title === 'Benchmarking');

    // MSSCI-12792: 3 + 5 = 8 points
    const precisionEpic = benchmarking!.children.find(c => c.id === '40');
    expect(precisionEpic!.estimatedPoints).toBe(8);

    // epic-42: 3 + 3 = 6 points
    const rubricEpic = benchmarking!.children.find(c => c.id === '42');
    expect(rubricEpic!.estimatedPoints).toBe(6);

    // epic-111: 2 + 2 + 1 = 5 points
    const install = data.futureEpics.find(fe => fe.title === 'Install Architecture Rethink');
    const spikeEpic = install!.children.find(c => c.id === '111');
    expect(spikeEpic!.estimatedPoints).toBe(5);
  });

  it('should include status for each child epic', async () => {
    setupFileMocks({
      'current-sprint.yaml': MINIMAL_SPRINT_YAML,
      'future.yaml': FUTURE_WITH_EPIC_REFS,
      'initiative-benchmarking.yaml': INITIATIVE_BENCHMARKING_YAML,
      'initiative-install-architecture-rethink.yaml': INITIATIVE_INSTALL_YAML,
      'epic-MSSCI-12792.yaml': EPIC_MSSCI_12792_YAML,
      'epic-42.yaml': EPIC_42_YAML,
      'epic-43.yaml': EPIC_43_YAML,
      'epic-111.yaml': EPIC_111_YAML,
      'epic-112.yaml': EPIC_112_YAML,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    const benchmarking = data.futureEpics.find(fe => fe.title === 'Benchmarking');

    // epic-43 has status: blocked
    const trapsEpic = benchmarking!.children.find(c => c.id === '43');
    expect(trapsEpic!.status).toBe('blocked');

    // epic-42 has status: planning
    const rubricEpic = benchmarking!.children.find(c => c.id === '42');
    expect(rubricEpic!.status).toBe('planning');
  });

  it('should include jiraKey when epic has one', async () => {
    setupFileMocks({
      'current-sprint.yaml': MINIMAL_SPRINT_YAML,
      'future.yaml': FUTURE_WITH_EPIC_REFS,
      'initiative-benchmarking.yaml': INITIATIVE_BENCHMARKING_YAML,
      'initiative-install-architecture-rethink.yaml': INITIATIVE_INSTALL_YAML,
      'epic-MSSCI-12792.yaml': EPIC_MSSCI_12792_YAML,
      'epic-42.yaml': EPIC_42_YAML,
      'epic-43.yaml': EPIC_43_YAML,
      'epic-111.yaml': EPIC_111_YAML,
      'epic-112.yaml': EPIC_112_YAML,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    const benchmarking = data.futureEpics.find(fe => fe.title === 'Benchmarking');

    // MSSCI-12792 has a jira key
    const precisionEpic = benchmarking!.children.find(c => c.id === '40');
    expect(precisionEpic!.jiraKey).toBe('MSSCI-12792');

    // epic-42 has no jira key
    const rubricEpic = benchmarking!.children.find(c => c.id === '42');
    expect(rubricEpic!.jiraKey).toBeNull();
  });

  it('should include story count for each child epic', async () => {
    setupFileMocks({
      'current-sprint.yaml': MINIMAL_SPRINT_YAML,
      'future.yaml': FUTURE_WITH_EPIC_REFS,
      'initiative-benchmarking.yaml': INITIATIVE_BENCHMARKING_YAML,
      'initiative-install-architecture-rethink.yaml': INITIATIVE_INSTALL_YAML,
      'epic-MSSCI-12792.yaml': EPIC_MSSCI_12792_YAML,
      'epic-42.yaml': EPIC_42_YAML,
      'epic-43.yaml': EPIC_43_YAML,
      'epic-111.yaml': EPIC_111_YAML,
      'epic-112.yaml': EPIC_112_YAML,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    const benchmarking = data.futureEpics.find(fe => fe.title === 'Benchmarking');

    // MSSCI-12792 has 2 stories
    const precisionEpic = benchmarking!.children.find(c => c.id === '40');
    expect(precisionEpic!.storyCount).toBe(2);

    // epic-111 has 3 stories
    const install = data.futureEpics.find(fe => fe.title === 'Install Architecture Rethink');
    const spikeEpic = install!.children.find(c => c.id === '111');
    expect(spikeEpic!.storyCount).toBe(3);
  });
});

// =============================================================================
// Edge Cases & Resilience
// =============================================================================

describe('Edge cases: missing/invalid epic shards', () => {
  it('should skip missing epic shards gracefully', async () => {
    setupFileMocks({
      'current-sprint.yaml': MINIMAL_SPRINT_YAML,
      'future.yaml': FUTURE_WITH_MISSING_SHARD,
      'initiative-partial-initiative.yaml': INITIATIVE_PARTIAL_YAML,
      'epic-200.yaml': EPIC_200_YAML,
      // epic-999.yaml intentionally missing
    });

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    const partial = data.futureEpics.find(fe => fe.title === 'Partial Initiative');
    expect(partial).toBeDefined();
    // Should have 1 child (epic-200), skip missing epic-999
    expect(partial!.children).toHaveLength(1);
    expect(partial!.children[0].id).toBe('200');

    consoleSpy.mockRestore();
  });

  it('should handle initiative with only string refs and no shards', async () => {
    const ghostInit = `
future:
  initiatives:
    - ghost-initiative
`;
    const ghostInitYaml = `
name: Ghost Initiative
description: All epic shards are missing
status: backlog
total_points: 20
epics:
  - epic-998
  - epic-999
`;

    setupFileMocks({
      'current-sprint.yaml': MINIMAL_SPRINT_YAML,
      'future.yaml': ghostInit,
      'initiative-ghost-initiative.yaml': ghostInitYaml,
      // No epic shards exist
    });

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    const ghost = data.futureEpics.find(fe => fe.title === 'Ghost Initiative');
    expect(ghost).toBeDefined();
    expect(ghost!.children).toEqual([]);

    consoleSpy.mockRestore();
  });
});

// =============================================================================
// AC 4: Future metrics include child epic data
// =============================================================================

describe('AC 4: Metrics include future epic child data', () => {
  it('should count total future child epics in metrics', async () => {
    setupFileMocks({
      'current-sprint.yaml': MINIMAL_SPRINT_YAML,
      'future.yaml': FUTURE_WITH_EPIC_REFS,
      'initiative-benchmarking.yaml': INITIATIVE_BENCHMARKING_YAML,
      'initiative-install-architecture-rethink.yaml': INITIATIVE_INSTALL_YAML,
      'epic-MSSCI-12792.yaml': EPIC_MSSCI_12792_YAML,
      'epic-42.yaml': EPIC_42_YAML,
      'epic-43.yaml': EPIC_43_YAML,
      'epic-111.yaml': EPIC_111_YAML,
      'epic-112.yaml': EPIC_112_YAML,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    // Should have a count of total child epics across all initiatives
    expect(data.metrics.future).toHaveProperty('epics');
    expect(data.metrics.future.epics).toBe(5); // 3 benchmarking + 2 install
  });
});

// =============================================================================
// Type contract: FutureEpicChild shape
// =============================================================================

describe('FutureEpicChild type contract', () => {
  it('should have all required fields on each child', async () => {
    setupFileMocks({
      'current-sprint.yaml': MINIMAL_SPRINT_YAML,
      'future.yaml': FUTURE_WITH_EPIC_REFS,
      'initiative-benchmarking.yaml': INITIATIVE_BENCHMARKING_YAML,
      'initiative-install-architecture-rethink.yaml': INITIATIVE_INSTALL_YAML,
      'epic-MSSCI-12792.yaml': EPIC_MSSCI_12792_YAML,
      'epic-42.yaml': EPIC_42_YAML,
      'epic-43.yaml': EPIC_43_YAML,
      'epic-111.yaml': EPIC_111_YAML,
      'epic-112.yaml': EPIC_112_YAML,
    });

    const { getSprintData } = await import('../src/sprint-data.js');
    const data = getSprintData('/test/project');

    for (const initiative of data.futureEpics) {
      for (const child of initiative.children) {
        expect(child).toHaveProperty('id');
        expect(child).toHaveProperty('title');
        expect(child).toHaveProperty('estimatedPoints');
        expect(child).toHaveProperty('status');
        expect(child).toHaveProperty('jiraKey');
        expect(child).toHaveProperty('storyCount');
        expect(typeof child.id).toBe('string');
        expect(typeof child.title).toBe('string');
        expect(typeof child.estimatedPoints).toBe('number');
        expect(['ready', 'blocked', 'planning']).toContain(child.status);
        expect(typeof child.storyCount).toBe('number');
      }
    }
  });
});
