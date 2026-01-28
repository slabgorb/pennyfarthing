/**
 * 64-19: Story Section - Expandable Sprint/Epic Details UI
 *
 * These tests verify the UI implementation for the expandable story section.
 * The data layer (story-parser.ts) already exists - this tests the functions
 * that story.js needs to implement.
 *
 * Acceptance Criteria:
 * - AC1: Expandable section shows all sprint stories
 * - AC2: Shows epic context (parent epic, sibling stories)
 * - AC3: Jira links clickable
 * - AC4: Points and status for each story
 * - AC5: (Implicit) Responsive design matches existing Cyclist theme
 *
 * Written to FAIL initially (RED phase) - Dev will make them GREEN.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import functions that need to be implemented in story.js
// These imports will fail until the functions are created
import {
  renderSprintStoriesList,
  renderEpicContext,
  formatStoryStatus,
  formatStoryPoints,
  isExpanded,
  setExpanded,
  resetExpandState,
} from '../src/public/js/sidebar/story.js';

// Mock data matching story-parser.ts interfaces
const mockSprintStories = [
  { id: '64-19', title: 'Expandable story UI', points: 3, status: 'in_progress', jiraKey: null, jiraUrl: null },
  { id: 'MSSCI-12475', title: 'Story section data layer', points: 5, status: 'done', jiraKey: 'MSSCI-12475', jiraUrl: 'https://1898andco.atlassian.net/browse/MSSCI-12475' },
  { id: 'MSSCI-12476', title: 'BikeLane workflow status', points: 3, status: 'done', jiraKey: 'MSSCI-12476', jiraUrl: 'https://1898andco.atlassian.net/browse/MSSCI-12476' },
  { id: 'MSSCI-12477', title: 'Background tasks', points: 5, status: 'backlog', jiraKey: 'MSSCI-12477', jiraUrl: 'https://1898andco.atlassian.net/browse/MSSCI-12477' },
];

const mockEpicContext = {
  id: 'epic-64',
  title: 'Epic: Cyclist UX Polish',
  jiraKey: 'MSSCI-12465',
  jiraUrl: 'https://1898andco.atlassian.net/browse/MSSCI-12465',
  stories: mockSprintStories,
};

describe('64-19: Expandable Story Section UI Functions', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    resetExpandState(); // Reset expand state between tests
  });

  describe('AC1: renderSprintStoriesList - Expandable Section Shows All Sprint Stories', () => {

    it('should return HTML string with all stories', () => {
      const html = renderSprintStoriesList(mockSprintStories, '64-19');

      // Should contain all story IDs
      expect(html).toContain('64-19');
      expect(html).toContain('MSSCI-12475');
      expect(html).toContain('MSSCI-12476');
      expect(html).toContain('MSSCI-12477');
    });

    it('should include story titles in output', () => {
      const html = renderSprintStoriesList(mockSprintStories, '64-19');

      expect(html).toContain('Expandable story UI');
      expect(html).toContain('Story section data layer');
      expect(html).toContain('BikeLane workflow status');
    });

    it('should mark current story with special class', () => {
      const html = renderSprintStoriesList(mockSprintStories, '64-19');

      // Should have a way to identify current story
      expect(html).toMatch(/class="[^"]*current[^"]*".*64-19|64-19.*class="[^"]*current[^"]*"|data-current="true".*64-19/);
    });

    it('should return empty string for null input', () => {
      const html = renderSprintStoriesList(null, '64-19');
      expect(html).toBe('');
    });

    it('should return empty string for empty array', () => {
      const html = renderSprintStoriesList([], '64-19');
      expect(html).toBe('');
    });

    it('should handle stories without current story ID', () => {
      const html = renderSprintStoriesList(mockSprintStories, null);

      // Should still render all stories
      expect(html).toContain('64-19');
      expect(html).toContain('MSSCI-12475');
    });

  });

  describe('AC2: renderEpicContext - Shows Epic Context', () => {

    it('should return HTML with epic title', () => {
      const html = renderEpicContext(mockEpicContext);

      expect(html).toContain('Cyclist UX Polish');
    });

    it('should include epic Jira link', () => {
      const html = renderEpicContext(mockEpicContext);

      expect(html).toContain('MSSCI-12465');
      expect(html).toContain('https://1898andco.atlassian.net/browse/MSSCI-12465');
    });

    it('should list all sibling stories', () => {
      const html = renderEpicContext(mockEpicContext);

      mockEpicContext.stories.forEach(story => {
        expect(html).toContain(story.id);
      });
    });

    it('should return empty string for null input', () => {
      const html = renderEpicContext(null);
      expect(html).toBe('');
    });

    it('should handle epic without Jira key', () => {
      const epicWithoutJira = { ...mockEpicContext, jiraKey: null, jiraUrl: null };
      const html = renderEpicContext(epicWithoutJira);

      // Should still render epic title
      expect(html).toContain('Cyclist UX Polish');
      // Should not have broken link
      expect(html).not.toContain('href="null"');
    });

  });

  describe('AC3: Jira Links - Clickable Links with Proper Attributes', () => {

    it('should render Jira key as anchor tag with href', () => {
      const html = renderSprintStoriesList(mockSprintStories, null);

      // Should have anchor with Jira URL
      expect(html).toContain('href="https://1898andco.atlassian.net/browse/MSSCI-12475"');
    });

    it('should open links in new tab (target="_blank")', () => {
      const html = renderSprintStoriesList(mockSprintStories, null);

      expect(html).toContain('target="_blank"');
    });

    it('should have security attributes (rel="noopener")', () => {
      const html = renderSprintStoriesList(mockSprintStories, null);

      expect(html).toContain('rel="noopener');
    });

    it('should render story ID as plain text when no Jira key', () => {
      const storiesWithoutJira = [
        { id: '64-19', title: 'No Jira', points: 3, status: 'in_progress', jiraKey: null, jiraUrl: null },
      ];
      const html = renderSprintStoriesList(storiesWithoutJira, null);

      // Should contain ID but not as a link
      expect(html).toContain('64-19');
      expect(html).not.toContain('href=""');
      expect(html).not.toContain('href="null"');
    });

  });

  describe('AC4: formatStoryStatus - Status Badge Formatting', () => {

    it('should return "Done" for done status', () => {
      const result = formatStoryStatus('done');
      expect(result.text).toBe('Done');
      expect(result.className).toContain('done');
    });

    it('should return "In Progress" for in_progress status', () => {
      const result = formatStoryStatus('in_progress');
      expect(result.text.toLowerCase()).toContain('progress');
      expect(result.className).toContain('in_progress');
    });

    it('should return "Backlog" for backlog status', () => {
      const result = formatStoryStatus('backlog');
      expect(result.text).toBe('Backlog');
      expect(result.className).toContain('backlog');
    });

    it('should return "Cancelled" for cancelled status', () => {
      const result = formatStoryStatus('cancelled');
      expect(result.text.toLowerCase()).toContain('cancel');
      expect(result.className).toContain('cancelled');
    });

    it('should handle unknown status gracefully', () => {
      const result = formatStoryStatus('unknown');
      expect(result.text).toBeDefined();
      expect(result.className).toBeDefined();
    });

  });

  describe('AC4: formatStoryPoints - Points Display Formatting', () => {

    it('should format single point as "1 pt"', () => {
      const result = formatStoryPoints(1);
      expect(result).toBe('1 pt');
    });

    it('should format multiple points as "N pts"', () => {
      const result = formatStoryPoints(3);
      expect(result).toBe('3 pts');
    });

    it('should format zero points as "0 pts"', () => {
      const result = formatStoryPoints(0);
      expect(result).toBe('0 pts');
    });

    it('should handle null/undefined by returning "- pts"', () => {
      expect(formatStoryPoints(null)).toBe('- pts');
      expect(formatStoryPoints(undefined)).toBe('- pts');
    });

  });

  describe('AC5: Expand/Collapse State Management', () => {

    it('isExpanded should return false by default', () => {
      expect(isExpanded()).toBe(false);
    });

    it('setExpanded(true) should expand the section', () => {
      setExpanded(true);
      expect(isExpanded()).toBe(true);
    });

    it('setExpanded(false) should collapse the section', () => {
      setExpanded(true);
      setExpanded(false);
      expect(isExpanded()).toBe(false);
    });

    it('toggle should flip the state', () => {
      const initial = isExpanded();
      setExpanded(!initial);
      expect(isExpanded()).toBe(!initial);
    });

  });

  describe('Edge Cases', () => {

    it('should handle story with very long title', () => {
      const longTitleStory = [{
        id: 'test',
        title: 'This is a very long story title that might cause layout issues if not properly handled with CSS truncation or wrapping',
        points: 3,
        status: 'backlog',
        jiraKey: null,
        jiraUrl: null,
      }];

      // Should not throw
      expect(() => renderSprintStoriesList(longTitleStory, null)).not.toThrow();
    });

    it('should handle story with special characters in title', () => {
      const specialCharStory = [{
        id: 'test',
        title: 'Story with <script>alert("xss")</script> & "quotes"',
        points: 3,
        status: 'backlog',
        jiraKey: null,
        jiraUrl: null,
      }];

      const html = renderSprintStoriesList(specialCharStory, null);

      // Should escape HTML entities
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;') || expect(html).not.toContain('alert');
    });

    it('should handle epic with empty stories array', () => {
      const emptyEpic = { ...mockEpicContext, stories: [] };
      const html = renderEpicContext(emptyEpic);

      // Should still render epic info
      expect(html).toContain('Cyclist UX Polish');
    });

  });

});
