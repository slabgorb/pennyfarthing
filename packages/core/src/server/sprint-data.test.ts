/**
 * Tests for sprint-data computation helpers
 *
 * Validates computeEpicProgress, computeEpicCompleted,
 * checkEpicContext, and checkStoryContext.
 *
 * Run with: cd packages/core && node --test dist/server/sprint-data.test.js
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SprintStory } from './sprint-data.js';
import {
  computeEpicProgress,
  computeEpicCompleted,
  checkEpicContext,
  checkStoryContext,
} from './sprint-data.js';

function makeStory(overrides: Partial<SprintStory> = {}): SprintStory {
  return {
    id: '100-1',
    title: 'Test story',
    points: 3,
    status: 'backlog',
    jiraKey: null,
    hasContext: false,
    ...overrides,
  };
}

// =============================================================================
// computeEpicProgress
// =============================================================================

describe('computeEpicProgress', () => {
  it('should calculate basic done/total', () => {
    const stories = [
      makeStory({ id: '1-1', points: 3, status: 'done' }),
      makeStory({ id: '1-2', points: 5, status: 'backlog' }),
    ];
    const result = computeEpicProgress(stories);
    assert.strictEqual(result.done, 3);
    assert.strictEqual(result.total, 8);
    assert.strictEqual(result.cancelled, 0);
    assert.strictEqual(result.percentage, 38); // Math.round(3/8*100)
  });

  it('should exclude cancelled points from total', () => {
    const stories = [
      makeStory({ id: '1-1', points: 5, status: 'done' }),
      makeStory({ id: '1-2', points: 3, status: 'cancelled' }),
    ];
    const result = computeEpicProgress(stories);
    assert.strictEqual(result.done, 5);
    assert.strictEqual(result.total, 5); // 8 - 3 cancelled
    assert.strictEqual(result.cancelled, 3);
    assert.strictEqual(result.percentage, 100);
  });

  it('should return zero percentage for empty stories', () => {
    const result = computeEpicProgress([]);
    assert.strictEqual(result.done, 0);
    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.cancelled, 0);
    assert.strictEqual(result.percentage, 0);
  });

  it('should handle all cancelled (total becomes 0)', () => {
    const stories = [
      makeStory({ id: '1-1', points: 3, status: 'cancelled' }),
      makeStory({ id: '1-2', points: 5, status: 'cancelled' }),
    ];
    const result = computeEpicProgress(stories);
    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.percentage, 0);
  });

  it('should handle mixed statuses', () => {
    const stories = [
      makeStory({ id: '1-1', points: 3, status: 'done' }),
      makeStory({ id: '1-2', points: 5, status: 'in_progress' }),
      makeStory({ id: '1-3', points: 2, status: 'cancelled' }),
      makeStory({ id: '1-4', points: 1, status: 'blocked' }),
    ];
    const result = computeEpicProgress(stories);
    assert.strictEqual(result.done, 3);
    assert.strictEqual(result.total, 9); // 11 - 2 cancelled
    assert.strictEqual(result.cancelled, 2);
    assert.strictEqual(result.percentage, 33); // Math.round(3/9*100)
  });
});

// =============================================================================
// computeEpicCompleted
// =============================================================================

describe('computeEpicCompleted', () => {
  it('should return true when all stories done', () => {
    const stories = [
      makeStory({ id: '1-1', status: 'done' }),
      makeStory({ id: '1-2', status: 'done' }),
    ];
    assert.strictEqual(computeEpicCompleted(stories), true);
  });

  it('should return true for mix of done and cancelled', () => {
    const stories = [
      makeStory({ id: '1-1', status: 'done' }),
      makeStory({ id: '1-2', status: 'cancelled' }),
    ];
    assert.strictEqual(computeEpicCompleted(stories), true);
  });

  it('should return false when has backlog stories', () => {
    const stories = [
      makeStory({ id: '1-1', status: 'done' }),
      makeStory({ id: '1-2', status: 'backlog' }),
    ];
    assert.strictEqual(computeEpicCompleted(stories), false);
  });

  it('should return false for empty stories', () => {
    assert.strictEqual(computeEpicCompleted([]), false);
  });

  it('should return false when has in_progress stories', () => {
    const stories = [
      makeStory({ id: '1-1', status: 'done' }),
      makeStory({ id: '1-2', status: 'in_progress' }),
    ];
    assert.strictEqual(computeEpicCompleted(stories), false);
  });
});

// =============================================================================
// Cancelled-points regression
// =============================================================================

describe('cancelled-points regression', () => {
  it('should show 100% and isCompleted for done+cancelled epic', () => {
    const stories = [
      makeStory({ id: '1-1', points: 5, status: 'done' }),
      makeStory({ id: '1-2', points: 3, status: 'done' }),
      makeStory({ id: '1-3', points: 2, status: 'cancelled' }),
    ];
    const progress = computeEpicProgress(stories);
    const completed = computeEpicCompleted(stories);

    assert.strictEqual(progress.percentage, 100);
    assert.strictEqual(completed, true);
  });
});

// =============================================================================
// checkEpicContext / checkStoryContext
// =============================================================================

describe('checkEpicContext', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `pf-test-sprint-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(testDir, 'sprint/context'), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should return true when epic context file exists', () => {
    writeFileSync(join(testDir, 'sprint/context/context-epic-42.md'), '# Epic 42');
    assert.strictEqual(checkEpicContext(testDir, '42'), true);
  });

  it('should return false when epic context file missing', () => {
    assert.strictEqual(checkEpicContext(testDir, '99'), false);
  });

  it('should handle MSSCI-keyed epic IDs', () => {
    writeFileSync(join(testDir, 'sprint/context/context-epic-MSSCI-14440.md'), '# MSSCI Epic');
    assert.strictEqual(checkEpicContext(testDir, 'MSSCI-14440'), true);
  });
});

describe('checkStoryContext', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `pf-test-sprint-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(testDir, 'sprint/context'), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should find canonical context-story-{id}.md files', () => {
    writeFileSync(join(testDir, 'sprint/context/context-story-100-4.md'), '# Story 100-4');
    assert.strictEqual(checkStoryContext(testDir, '100-4'), true);
  });

  it('should find legacy context-{id}.md files', () => {
    writeFileSync(join(testDir, 'sprint/context/context-132-8.md'), '# Story 132-8');
    assert.strictEqual(checkStoryContext(testDir, '132-8'), true);
  });

  it('should return false when no context file exists', () => {
    assert.strictEqual(checkStoryContext(testDir, '999-1'), false);
  });

  it('should prefer canonical over legacy (both present)', () => {
    writeFileSync(join(testDir, 'sprint/context/context-story-100-1.md'), '# canonical');
    writeFileSync(join(testDir, 'sprint/context/context-100-1.md'), '# legacy');
    assert.strictEqual(checkStoryContext(testDir, '100-1'), true);
  });
});
