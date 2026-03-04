/**
 * MSSCI-12475: Story Section - Expandable Sprint/Epic Details
 *
 * These tests verify the acceptance criteria for expandable story section.
 *
 * Note: Tests for getStoryInfo integration are skipped due to ESM module
 * mocking limitations with vitest. Instead, we test the helper functions
 * directly: getSprintStories and getEpicContext.
 *
 * Acceptance Criteria:
 * - AC1: Expandable section shows all sprint stories
 * - AC2: Shows epic context (parent epic, sibling stories)
 * - AC3: Jira links clickable
 * - AC4: Points and status for each story
 */

import { describe, it, expect } from 'vitest';
import { getSprintStories, getEpicContext } from '@pennyfarthing/core/dist/server/story-parser.js';
import type { StoryInfo, SprintStory, EpicContext } from '@pennyfarthing/core/dist/server/story-parser.js';

describe('MSSCI-12475: Expandable Story Section', () => {

  // Sample sprint YAML with multiple stories
  const mockSprintYaml = `sprint:
  number: 12
  jira_sprint_id: 276
  jira_sprint_name: "TO Sprint 2604"
  goal: "Complete WheelHub notification consolidation"
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: active

summary:
  total_points: 50
  completed_points: 30
  remaining_points: 20

epics:
  - id: epic-64
    title: "Cyclist UX Polish"
    jira: MSSCI-12465
    description: "Improve Cyclist terminal UX"
    stories:
      - id: MSSCI-12475
        title: "Story section: Expandable sprint/epic details"
        points: 5
        status: in_progress
        workflow: tdd
      - id: MSSCI-12476
        title: "BikeLane workflow status"
        points: 3
        status: backlog
        workflow: tdd
      - id: MSSCI-12477
        title: "Theme selector UI"
        points: 2
        status: done
        workflow: trivial
  - id: epic-65
    title: "Scale Adaptation"
    jira: MSSCI-12400
    stories:
      - id: MSSCI-12418
        title: "Enterprise workflow hooks"
        points: 3
        status: backlog
        workflow: tdd
`;

  describe('AC1: Expandable section shows all sprint stories', () => {

    it('should return sprintStories array from sprint YAML', () => {
      const stories = getSprintStories(mockSprintYaml);

      expect(stories).toBeDefined();
      expect(Array.isArray(stories)).toBe(true);
    });

    it('should include all stories from all epics in sprint', () => {
      const stories = getSprintStories(mockSprintYaml);

      // Should have 4 stories total (3 from epic-64 + 1 from epic-65)
      expect(stories).not.toBeNull();
      expect(stories!.length).toBe(4);
    });

    it('should include story id, title, points, and status for each story', () => {
      const stories = getSprintStories(mockSprintYaml);
      const firstStory = stories![0];

      expect(firstStory).toHaveProperty('id');
      expect(firstStory).toHaveProperty('title');
      expect(firstStory).toHaveProperty('points');
      expect(firstStory).toHaveProperty('status');
    });

    it('should correctly identify story with in_progress status', () => {
      const stories = getSprintStories(mockSprintYaml);
      const currentStory = stories!.find(s => s.id === 'MSSCI-12475');

      expect(currentStory).toBeDefined();
      expect(currentStory!.status).toBe('in_progress');
    });

    it('should return empty array when sprint YAML has no epics', () => {
      const emptySprintYaml = `sprint:
  number: 12
epics: []
`;
      const stories = getSprintStories(emptySprintYaml);

      expect(stories).toEqual([]);
    });

    it('should return null when sprint YAML is malformed', () => {
      const malformedYaml = `sprint: {
  this is not valid yaml
`;
      const stories = getSprintStories(malformedYaml);

      expect(stories).toBeNull();
    });

  });

  describe('AC2: Shows epic context (parent epic, sibling stories)', () => {

    it('should return epicContext object for a story', () => {
      const context = getEpicContext(mockSprintYaml, 'MSSCI-12475');

      expect(context).toBeDefined();
      expect(context).not.toBeNull();
    });

    it('should include epic id and title in epic context', () => {
      const context = getEpicContext(mockSprintYaml, 'MSSCI-12475');

      expect(context!.id).toBe('epic-64');
      expect(context!.title).toBe('Cyclist UX Polish');
    });

    it('should include sibling stories in epic context', () => {
      const context = getEpicContext(mockSprintYaml, 'MSSCI-12475');

      // epic-64 has 3 stories
      expect(context!.stories).toBeDefined();
      expect(context!.stories.length).toBe(3);
    });

    it('should include Jira key for epic in epic context', () => {
      const context = getEpicContext(mockSprintYaml, 'MSSCI-12475');

      expect(context!.jiraKey).toBe('MSSCI-12465');
    });

    it('should return null epicContext when story is not found in any epic', () => {
      const context = getEpicContext(mockSprintYaml, 'MSSCI-99999');

      expect(context).toBeNull();
    });

    it('should return null when sprint YAML has no epics', () => {
      const emptySprintYaml = `sprint:
  number: 12
epics: []
`;
      const context = getEpicContext(emptySprintYaml, 'MSSCI-12475');

      expect(context).toBeNull();
    });

  });

  describe('AC3: Jira links clickable', () => {

    it('should include Jira URL for each sprint story with MSSCI key', () => {
      const stories = getSprintStories(mockSprintYaml);

      stories!.forEach(story => {
        expect(story).toHaveProperty('jiraUrl');
        if (story.jiraKey) {
          expect(story.jiraUrl).toContain(story.jiraKey);
        }
      });
    });

    it('should include Jira URL for epic in epic context', () => {
      const context = getEpicContext(mockSprintYaml, 'MSSCI-12475');

      expect(context!.jiraUrl).toBeDefined();
      expect(context!.jiraUrl).toContain('MSSCI-12465');
    });

    it('should use correct Jira base URL format', () => {
      const stories = getSprintStories(mockSprintYaml);
      const storyWithJira = stories!.find(s => s.jiraUrl !== null);

      expect(storyWithJira!.jiraUrl).toMatch(/https:\/\/1898andco\.atlassian\.net\/browse\/MSSCI-\d+/);
    });

    it('should return null jiraUrl when story has no MSSCI Jira key', () => {
      const noJiraSprintYaml = `sprint:
  number: 12
epics:
  - id: epic-1
    title: "Local Epic"
    stories:
      - id: LOCAL-1
        title: "Local only story"
        points: 1
        status: backlog
`;
      const stories = getSprintStories(noJiraSprintYaml);

      expect(stories![0].jiraUrl).toBeNull();
    });

  });

  describe('AC4: Points and status for each story', () => {

    it('should include points for each sprint story', () => {
      const stories = getSprintStories(mockSprintYaml);

      stories!.forEach(story => {
        expect(typeof story.points).toBe('number');
        expect(story.points).toBeGreaterThanOrEqual(0);
      });
    });

    it('should include status for each sprint story', () => {
      const stories = getSprintStories(mockSprintYaml);

      const validStatuses = ['backlog', 'in_progress', 'done', 'cancelled'];
      stories!.forEach(story => {
        expect(validStatuses).toContain(story.status);
      });
    });

    it('should calculate total points for epic stories', () => {
      const context = getEpicContext(mockSprintYaml, 'MSSCI-12475');

      // epic-64 stories: 5 + 3 + 2 = 10 points
      const totalPoints = context!.stories.reduce((sum, s) => sum + s.points, 0);
      expect(totalPoints).toBe(10);
    });

    it('should show correct status counts for epic', () => {
      const context = getEpicContext(mockSprintYaml, 'MSSCI-12475');
      const stories = context!.stories;

      // epic-64: 1 in_progress, 1 backlog, 1 done
      const inProgress = stories.filter(s => s.status === 'in_progress').length;
      const backlog = stories.filter(s => s.status === 'backlog').length;
      const done = stories.filter(s => s.status === 'done').length;

      expect(inProgress).toBe(1);
      expect(backlog).toBe(1);
      expect(done).toBe(1);
    });

    it('should handle stories with 0 points', () => {
      const zeroPointsYaml = `sprint:
  number: 12
epics:
  - id: epic-1
    title: "Zero Points Epic"
    stories:
      - id: ZERO-1
        title: "Zero point story"
        points: 0
        status: backlog
`;
      const stories = getSprintStories(zeroPointsYaml);

      expect(stories![0].points).toBe(0);
    });

  });

  describe('Edge Cases', () => {

    it('should handle epic with no stories', () => {
      const noStoriesYaml = `sprint:
  number: 12
epics:
  - id: epic-empty
    title: "Empty Epic"
    stories: []
`;
      const stories = getSprintStories(noStoriesYaml);

      expect(stories).toEqual([]);
    });

    it('should handle missing stories array in epic', () => {
      const missingStoriesYaml = `sprint:
  number: 12
epics:
  - id: epic-1
    title: "Epic without stories key"
`;
      const stories = getSprintStories(missingStoriesYaml);

      // Should handle gracefully - no stories array means no stories
      expect(stories).toEqual([]);
    });

    it('should normalize different status formats', () => {
      const variedStatusYaml = `sprint:
  number: 12
epics:
  - id: epic-1
    title: "Various Status Epic"
    stories:
      - id: S1
        title: "Completed story"
        points: 1
        status: completed
      - id: S2
        title: "Active story"
        points: 1
        status: active
      - id: S3
        title: "Canceled story"
        points: 1
        status: canceled
`;
      const stories = getSprintStories(variedStatusYaml);

      // Should normalize to standard statuses
      expect(stories![0].status).toBe('done');       // completed -> done
      expect(stories![1].status).toBe('in_progress'); // active -> in_progress
      expect(stories![2].status).toBe('cancelled');   // canceled -> cancelled
    });

  });

  describe('Type Exports', () => {

    it('should export SprintStory type', () => {
      // This test verifies the type is exported correctly
      const story: SprintStory = {
        id: 'test',
        title: 'test',
        points: 0,
        status: 'backlog',
        jiraKey: null,
        jiraUrl: null,
      };

      expect(story.id).toBe('test');
    });

    it('should export EpicContext type', () => {
      const context: EpicContext = {
        id: 'epic-1',
        title: 'Test Epic',
        jiraKey: 'MSSCI-123',
        jiraUrl: 'https://example.com',
        stories: [],
      };

      expect(context.id).toBe('epic-1');
    });

  });

});
