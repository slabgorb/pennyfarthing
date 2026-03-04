/**
 * MSSCI-12238: Sprint Metrics Display
 *
 * Tests for story-parser sprint metrics functionality.
 * Verifies that parseSprintYaml correctly calculates:
 * - AC1: Remaining points
 * - AC2: In-progress points (sum, not count)
 * - AC3: Sprint end date
 *
 * Written in RED phase - tests should fail until Dev implements the functionality.
 */

import { describe, it, expect } from 'vitest';
import { parseSprintYaml } from '@pennyfarthing/core/dist/server/story-parser.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a minimal sprint YAML for testing
 */
function createSprintYaml(options: {
  totalPoints?: number;
  completedPoints?: number;
  remainingPoints?: number;
  endDate?: string;
  stories?: Array<{ id: string; points: number; status: string }>;
} = {}) {
  const stories = options.stories || [
    { id: 'STORY-1', points: 3, status: 'done' },
    { id: 'STORY-2', points: 5, status: 'in_progress' },
    { id: 'STORY-3', points: 2, status: 'in_progress' },
    { id: 'STORY-4', points: 8, status: 'backlog' },
  ];

  const storyYaml = stories
    .map(
      (s) => `      - id: ${s.id}
        points: ${s.points}
        status: ${s.status}`
    )
    .join('\n');

  return `sprint:
  number: 12
  start_date: 2026-01-20
  end_date: ${options.endDate || '2026-02-02'}
  status: active
summary:
  total_points: ${options.totalPoints || 18}
  completed_points: ${options.completedPoints || 3}
  remaining_points: ${options.remainingPoints || 8}
epics:
  - id: TEST-EPIC
    type: epic
    title: Test Epic
    stories:
${storyYaml}
`;
}

// =============================================================================
// AC1: Shows remaining points from sprint YAML
// =============================================================================

describe('AC1: parseSprintYaml returns remaining points', () => {
  it('should calculate remaining points from stories (not summary header)', () => {
    // Summary says 21, but stories calculate to 8 - stories are source of truth
    const yaml = createSprintYaml({
      remainingPoints: 21, // This stale value should be ignored
    });

    const result = parseSprintYaml(yaml);

    expect(result).not.toBeNull();
    // Default stories: STORY-4 (8 pts backlog) = 8 remaining
    expect(result!.remaining).toBe(8);
  });

  it('should calculate remaining from stories if no summary', () => {
    const yaml = `sprint:
  number: 12
  end_date: 2026-02-02
epics:
  - id: TEST-EPIC
    stories:
      - id: S1
        points: 5
        status: backlog
      - id: S2
        points: 3
        status: ready
`;

    const result = parseSprintYaml(yaml);

    expect(result).not.toBeNull();
    expect(result!.remaining).toBe(8); // 5 + 3 backlog/ready stories
  });
});

// =============================================================================
// AC2: Shows in-progress points (sum of points, not count)
// =============================================================================

describe('AC2: parseSprintYaml returns in-progress POINTS', () => {
  it('should return inProgressPoints as sum of in_progress story points', () => {
    const yaml = createSprintYaml({
      stories: [
        { id: 'S1', points: 3, status: 'done' },
        { id: 'S2', points: 5, status: 'in_progress' },
        { id: 'S3', points: 2, status: 'in_progress' },
        { id: 'S4', points: 8, status: 'backlog' },
      ],
    });

    const result = parseSprintYaml(yaml);

    expect(result).not.toBeNull();
    // in_progress stories: S2 (5) + S3 (2) = 7 points
    expect(result!.inProgress).toBe(7);
  });

  it('should return 0 in-progress points when no stories are in progress', () => {
    const yaml = createSprintYaml({
      stories: [
        { id: 'S1', points: 3, status: 'done' },
        { id: 'S2', points: 5, status: 'backlog' },
      ],
    });

    const result = parseSprintYaml(yaml);

    expect(result).not.toBeNull();
    expect(result!.inProgress).toBe(0);
  });

  it('should handle stories with 0 points in progress', () => {
    const yaml = createSprintYaml({
      stories: [
        { id: 'S1', points: 0, status: 'in_progress' },
        { id: 'S2', points: 3, status: 'in_progress' },
      ],
    });

    const result = parseSprintYaml(yaml);

    expect(result).not.toBeNull();
    expect(result!.inProgress).toBe(3);
  });

  it('should sum in-progress points across multiple epics', () => {
    const yaml = `sprint:
  number: 12
  end_date: 2026-02-02
epics:
  - id: EPIC-1
    stories:
      - id: S1
        points: 2
        status: in_progress
  - id: EPIC-2
    stories:
      - id: S2
        points: 3
        status: in_progress
      - id: S3
        points: 5
        status: done
`;

    const result = parseSprintYaml(yaml);

    expect(result).not.toBeNull();
    // in_progress: S1 (2) + S2 (3) = 5 points
    expect(result!.inProgress).toBe(5);
  });
});

// =============================================================================
// AC3: Shows sprint end date
// =============================================================================

describe('AC3: parseSprintYaml returns end date', () => {
  it('should return endDate from sprint section', () => {
    const yaml = createSprintYaml({
      endDate: '2026-02-02',
    });

    const result = parseSprintYaml(yaml);

    expect(result).not.toBeNull();
    expect(result!.endDate).toBe('2026-02-02');
  });

  it('should return null endDate when not specified', () => {
    const yaml = `sprint:
  number: 12
  status: active
epics: []
`;

    const result = parseSprintYaml(yaml);

    expect(result).not.toBeNull();
    expect(result!.endDate).toBeNull();
  });

  it('should handle ISO date format', () => {
    const yaml = `sprint:
  number: 12
  end_date: 2026-02-02T23:59:59Z
epics: []
`;

    const result = parseSprintYaml(yaml);

    expect(result).not.toBeNull();
    expect(result!.endDate).toBe('2026-02-02T23:59:59Z');
  });
});

// =============================================================================
// Edge cases and error handling
// =============================================================================

describe('parseSprintYaml edge cases', () => {
  it('should return null for malformed YAML', () => {
    const yaml = 'not: valid: yaml: syntax: {{{{';

    const result = parseSprintYaml(yaml);

    expect(result).toBeNull();
  });

  it('should return null for empty YAML', () => {
    const yaml = '';

    const result = parseSprintYaml(yaml);

    expect(result).toBeNull();
  });

  it('should return zeros when no epics array exists', () => {
    // Summary values are ignored - no stories means no points
    const yaml = `sprint:
  number: 12
  end_date: 2026-02-02
summary:
  completed_points: 10
  remaining_points: 5
`;

    const result = parseSprintYaml(yaml);

    expect(result).not.toBeNull();
    // No stories = no points (summary is ignored)
    expect(result!.done).toBe(0);
    expect(result!.remaining).toBe(0);
    expect(result!.inProgress).toBe(0);
  });

  it('should handle story without points field', () => {
    const yaml = `sprint:
  number: 12
  end_date: 2026-02-02
epics:
  - id: EPIC-1
    stories:
      - id: S1
        status: in_progress
`;

    const result = parseSprintYaml(yaml);

    expect(result).not.toBeNull();
    // Story without points should be treated as 0 points
    expect(result!.inProgress).toBe(0);
  });
});
