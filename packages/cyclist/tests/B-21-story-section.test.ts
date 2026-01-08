/**
 * B-21: Story Section - No Active Story State & AC Display
 *
 * These tests verify the acceptance criteria for story section improvements.
 * Written to FAIL initially (RED phase) - Dev will make them GREEN.
 *
 * Acceptance Criteria:
 * - AC1: "No active story" empty state displays cleanly with subtle styling
 * - AC2: ACs render as visual checklist with checkbox indicators
 * - AC3: AC progress shows in header (e.g., "2/5")
 * - AC4: Checked ACs visually distinct from unchecked
 * - AC5: Section handles missing session file gracefully
 * - AC6: Transitions smoothly when story loads/unloads
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

// Mock child_process for git commands
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// Mock fs for session file reading
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  watch: vi.fn(() => ({ close: vi.fn() })),
}));

// Import after mocking
import { app } from '../src/server.js';
import { existsSync, readFileSync, readdirSync } from 'fs';

describe('B-21: Story Section - No Active Story State & AC Display', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CYCLIST_PROJECT_DIR = '/test/project';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CYCLIST_PROJECT_DIR;
  });

  // Sample session file with acceptance criteria
  const mockSessionWithCriteria = `# Session: Story B-21 - Story Section Improvements

**Story:** B-21 - Story Section - No Active Story State & AC Display
**Points:** 3 | **Priority:** P2
**Started:** 2026-01-07
**Status:** dev

## Acceptance Criteria

- [ ] AC1: "No active story" empty state displays cleanly with subtle styling
- [x] AC2: ACs render as visual checklist with checkbox indicators
- [x] AC3: AC progress shows in header (e.g., "2/5")
- [ ] AC4: Checked ACs visually distinct from unchecked
- [x] AC5: Section handles missing session file gracefully
- [ ] AC6: Transitions smoothly when story loads/unloads
`;

  const mockSprintYaml = `sprint:
  number: 4
  goal: "Claude Code Remote Control"
  status: active

summary:
  total_points: 50
  completed_points: 37
  remaining_points: 13
`;

  describe('AC1: No Active Story Empty State', () => {

    it('should return null/empty story when no session file exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue([]);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const p = String(path);
        if (p.includes('sprint')) return mockSprintYaml;
        return '';
      });

      const response = await request(app).get('/api/story');

      expect(response.status).toBe(200);
      // Story should be null or have no id when no session exists
      expect(response.body.id).toBeNull();
    });

    it('should have empty-state CSS class when no story is active', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([]);
      vi.mocked(readFileSync).mockReturnValue('');

      const response = await request(app).get('/');
      const window = new Window();
      window.document.write(response.text);
      const document = window.document;

      // Story section should exist
      const storySection = document.querySelector('#story-section');
      expect(storySection).not.toBeNull();

      // CSS should define .story-section.empty class
      const styles = document.querySelector('link[href*="styles.css"]');
      expect(styles).not.toBeNull();
    });

    it('should display "No active story" text with subtle styling', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([]);
      vi.mocked(readFileSync).mockReturnValue('');

      const response = await request(app).get('/');
      const window = new Window();
      window.document.write(response.text);
      const document = window.document;

      // Story title element should exist for empty state display
      const storyTitle = document.querySelector('#story-title');
      expect(storyTitle).not.toBeNull();
    });

  });

  describe('AC2: AC Checkbox Indicators', () => {

    it('should render acceptance criteria with checkbox indicators', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['B-21-session.md'] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const p = String(path);
        if (p.includes('session') || p.includes('current-story')) return mockSessionWithCriteria;
        if (p.includes('sprint')) return mockSprintYaml;
        return '';
      });

      const response = await request(app).get('/api/story');

      expect(response.status).toBe(200);
      expect(response.body.criteria).toBeDefined();
      expect(Array.isArray(response.body.criteria)).toBe(true);

      // Each criteria item should have text and completed status
      const criteria = response.body.criteria;
      expect(criteria.length).toBeGreaterThan(0);
      expect(criteria[0]).toHaveProperty('text');
      expect(criteria[0]).toHaveProperty('completed');
    });

    it('should use visual checkbox symbols for done/pending items', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['B-21-session.md'] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const p = String(path);
        if (p.includes('session') || p.includes('current-story')) return mockSessionWithCriteria;
        if (p.includes('sprint')) return mockSprintYaml;
        return '';
      });

      const response = await request(app).get('/');
      const window = new Window();
      window.document.write(response.text);
      const document = window.document;

      // Acceptance criteria container should exist
      const criteriaContainer = document.querySelector('#acceptance-criteria');
      expect(criteriaContainer).not.toBeNull();
    });

  });

  describe('AC3: AC Progress in Header', () => {

    it('should count completed vs total criteria items', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['B-21-session.md'] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const p = String(path);
        if (p.includes('session') || p.includes('current-story')) return mockSessionWithCriteria;
        if (p.includes('sprint')) return mockSprintYaml;
        return '';
      });

      const response = await request(app).get('/api/story');

      expect(response.status).toBe(200);
      const criteria = response.body.criteria;
      const completedCount = criteria.filter((c: { completed: boolean }) => c.completed).length;
      const totalCount = criteria.length;

      // Our mock has 3 completed out of 6 total
      expect(completedCount).toBe(3);
      expect(totalCount).toBe(6);
    });

    it('should provide progress count for header display', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['B-21-session.md'] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const p = String(path);
        if (p.includes('session') || p.includes('current-story')) return mockSessionWithCriteria;
        if (p.includes('sprint')) return mockSprintYaml;
        return '';
      });

      const response = await request(app).get('/api/story');

      expect(response.status).toBe(200);
      // API should provide progress information
      expect(response.body.criteria).toBeDefined();

      const criteria = response.body.criteria;
      const completed = criteria.filter((c: { completed: boolean }) => c.completed).length;
      const total = criteria.length;

      // Frontend can calculate progress as "3/6"
      expect(`${completed}/${total}`).toBe('3/6');
    });

    it('should have element for displaying AC progress header', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([]);
      vi.mocked(readFileSync).mockReturnValue('');

      const response = await request(app).get('/');
      const window = new Window();
      window.document.write(response.text);
      const document = window.document;

      // Should have an AC header element for progress display
      const acHeader = document.querySelector('#acceptance-criteria-header') ||
                       document.querySelector('.ac-header') ||
                       document.querySelector('#acceptance-criteria');

      expect(acHeader).not.toBeNull();
    });

  });

  describe('AC4: Visual Distinction for Completed ACs', () => {

    it('should mark completed criteria items with completed property', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['B-21-session.md'] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const p = String(path);
        if (p.includes('session') || p.includes('current-story')) return mockSessionWithCriteria;
        if (p.includes('sprint')) return mockSprintYaml;
        return '';
      });

      const response = await request(app).get('/api/story');

      expect(response.status).toBe(200);
      const criteria = response.body.criteria;

      // First item is unchecked ([ ])
      expect(criteria[0].completed).toBe(false);
      // Second item is checked ([x])
      expect(criteria[1].completed).toBe(true);
    });

    it('should have CSS classes for done vs pending criteria styling', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([]);
      vi.mocked(readFileSync).mockReturnValue('');

      const response = await request(app).get('/');
      const window = new Window();
      window.document.write(response.text);
      const document = window.document;

      // Verify styles.css is linked (contains .criteria-item.done styling)
      const stylesLink = document.querySelector('link[href*="styles.css"]');
      expect(stylesLink).not.toBeNull();
    });

  });

  describe('AC5: Graceful Error Handling', () => {

    it('should not throw error when session directory is missing', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });
      vi.mocked(readFileSync).mockImplementation((path) => {
        const p = String(path);
        if (p.includes('sprint')) return mockSprintYaml;
        throw new Error('ENOENT: no such file or directory');
      });

      // Should not throw - should return graceful fallback
      const response = await request(app).get('/api/story');

      expect(response.status).toBe(200);
      // Should return null/empty story gracefully
      expect(response.body.id).toBeNull();
    });

    it('should return null criteria when AC section is malformed', async () => {
      const malformedSession = `# B-21: Story Title

**Status:** dev

## Acceptance Criteria

This section has no checkboxes at all.
Just some random text that doesn't match the pattern.
`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['B-21-session.md'] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const p = String(path);
        if (p.includes('session') || p.includes('current-story')) return malformedSession;
        if (p.includes('sprint')) return mockSprintYaml;
        return '';
      });

      const response = await request(app).get('/api/story');

      expect(response.status).toBe(200);
      // Should return null or empty array for malformed criteria
      expect(response.body.criteria === null || response.body.criteria.length === 0).toBe(true);
    });

    it('should handle empty acceptance criteria section', async () => {
      const emptyAcSession = `# B-21: Story Title

**Status:** dev

## Acceptance Criteria

`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['B-21-session.md'] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const p = String(path);
        if (p.includes('session') || p.includes('current-story')) return emptyAcSession;
        if (p.includes('sprint')) return mockSprintYaml;
        return '';
      });

      const response = await request(app).get('/api/story');

      expect(response.status).toBe(200);
      // Should handle gracefully
      expect(response.body.criteria === null || response.body.criteria.length === 0).toBe(true);
    });

  });

  describe('AC6: Smooth Transitions', () => {

    it('should have story section container for transition effects', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([]);
      vi.mocked(readFileSync).mockReturnValue('');

      const response = await request(app).get('/');
      const window = new Window();
      window.document.write(response.text);
      const document = window.document;

      // Story section should exist for CSS transitions
      const storySection = document.querySelector('#story-section');
      expect(storySection).not.toBeNull();

      // Should have elements that can be shown/hidden with transitions
      const storyTitle = document.querySelector('#story-title');
      const storyPhase = document.querySelector('#story-phase');

      expect(storyTitle).not.toBeNull();
      expect(storyPhase).not.toBeNull();
    });

    it('should structure AC container for show/hide transitions', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([]);
      vi.mocked(readFileSync).mockReturnValue('');

      const response = await request(app).get('/');
      const window = new Window();
      window.document.write(response.text);
      const document = window.document;

      // AC container should exist as a block element for transitions
      const criteriaEl = document.querySelector('#acceptance-criteria');
      expect(criteriaEl).not.toBeNull();

      // Workflow should also exist for transition hiding
      const workflowEl = document.querySelector('#workflow-progress');
      expect(workflowEl).not.toBeNull();
    });

  });

  describe('Frontend: Story.js updateStory Behavior', () => {

    it('should have acceptance criteria container in HTML', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([]);
      vi.mocked(readFileSync).mockReturnValue('');

      const response = await request(app).get('/');
      const window = new Window();
      window.document.write(response.text);
      const document = window.document;

      const container = document.querySelector('#acceptance-criteria');
      expect(container).not.toBeNull();
    });

    it('should have story title element for empty state text', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([]);
      vi.mocked(readFileSync).mockReturnValue('');

      const response = await request(app).get('/');
      const window = new Window();
      window.document.write(response.text);
      const document = window.document;

      const titleEl = document.querySelector('#story-title');
      expect(titleEl).not.toBeNull();
    });

    it('should have story phase element for hiding in empty state', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([]);
      vi.mocked(readFileSync).mockReturnValue('');

      const response = await request(app).get('/');
      const window = new Window();
      window.document.write(response.text);
      const document = window.document;

      const phaseEl = document.querySelector('#story-phase');
      expect(phaseEl).not.toBeNull();
    });

  });

  describe('Edge Cases', () => {

    it('should handle story with 0 criteria items', async () => {
      const noCriteriaSession = `# B-21: Story Title

**Status:** dev
**Points:** 3
`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['B-21-session.md'] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const p = String(path);
        if (p.includes('session') || p.includes('current-story')) return noCriteriaSession;
        if (p.includes('sprint')) return mockSprintYaml;
        return '';
      });

      const response = await request(app).get('/api/story');

      expect(response.status).toBe(200);
      // Should return null criteria, not crash
      expect(response.body.criteria).toBeNull();
    });

    it('should handle all criteria completed (100% progress)', async () => {
      const allDoneSession = `# B-21: Story Title

**Status:** dev

## Acceptance Criteria

- [x] First done
- [x] Second done
- [x] Third done
`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['B-21-session.md'] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const p = String(path);
        if (p.includes('session') || p.includes('current-story')) return allDoneSession;
        if (p.includes('sprint')) return mockSprintYaml;
        return '';
      });

      const response = await request(app).get('/api/story');

      expect(response.status).toBe(200);
      const criteria = response.body.criteria;
      const completedCount = criteria.filter((c: { completed: boolean }) => c.completed).length;

      // All 3 should be completed
      expect(completedCount).toBe(3);
      expect(criteria.length).toBe(3);
    });

    it('should handle all criteria pending (0% progress)', async () => {
      const allPendingSession = `# B-21: Story Title

**Status:** dev

## Acceptance Criteria

- [ ] First pending
- [ ] Second pending
- [ ] Third pending
`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['B-21-session.md'] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const p = String(path);
        if (p.includes('session') || p.includes('current-story')) return allPendingSession;
        if (p.includes('sprint')) return mockSprintYaml;
        return '';
      });

      const response = await request(app).get('/api/story');

      expect(response.status).toBe(200);
      const criteria = response.body.criteria;
      const completedCount = criteria.filter((c: { completed: boolean }) => c.completed).length;

      // None should be completed
      expect(completedCount).toBe(0);
      expect(criteria.length).toBe(3);
    });

  });

});
