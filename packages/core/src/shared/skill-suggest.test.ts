/**
 * Tests for Story 9-3: Add Skill Suggestions to Agents
 *
 * These tests verify:
 * - AC1: Session-aware suggestions based on story context
 * - AC2: Keyword-triggered suggestions with scoring
 * - AC3: Non-intrusive presentation (confidence threshold, limits)
 *
 * Run with: npm test -- packages/core/src/shared/skill-suggest.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Import functions to test - these don't exist yet, tests should fail (RED)
import {
  suggestSkills,
  suggestFromSession,
  suggestFromKeywords,
  type SuggestOptions,
  type SessionContext,
} from './skill-suggest.js';

describe('Story 9-3: Skill Suggestions', () => {

  describe('AC1: Session-aware suggestions', () => {

    it('should suggest skills based on story acceptance criteria', async () => {
      // AC1: Agents suggest skills when relevant (session-aware)
      const sessionContext: SessionContext = {
        storyId: '9-3',
        acceptanceCriteria: [
          'Write failing tests for the feature',
          'Implement TDD workflow',
        ],
        phase: 'testing',
      };

      const suggestions = await suggestFromSession(sessionContext);

      assert.ok(Array.isArray(suggestions), 'Should return array of suggestions');
      assert.ok(suggestions.length > 0, 'Should suggest at least one skill');

      const skillNames = suggestions.map(s => s.name);
      assert.ok(
        skillNames.includes('testing'),
        'Should suggest testing skill for TDD-related ACs'
      );
    });

    it('should suggest skills based on current workflow phase', async () => {
      // AC1: Phase-aware suggestions
      const sessionContext: SessionContext = {
        storyId: '9-3',
        acceptanceCriteria: ['Deploy the feature'],
        phase: 'review',
      };

      const suggestions = await suggestFromSession(sessionContext);

      // Review phase should suggest code-review skill
      const skillNames = suggestions.map(s => s.name);
      assert.ok(
        skillNames.includes('code-review'),
        'Should suggest code-review skill during review phase'
      );
    });

    it('should include relevance reason for each suggestion', async () => {
      // AC1: Suggestions should explain why they're relevant
      const sessionContext: SessionContext = {
        storyId: '9-3',
        acceptanceCriteria: ['Add unit tests'],
        phase: 'testing',
      };

      const suggestions = await suggestFromSession(sessionContext);

      assert.ok(suggestions.length > 0, 'Should have suggestions');
      for (const suggestion of suggestions) {
        assert.ok(suggestion.reason, `Suggestion ${suggestion.name} should have a reason`);
        assert.ok(
          suggestion.reason.length > 10,
          `Reason should be descriptive: ${suggestion.reason}`
        );
      }
    });

    it('should return empty array when no story context available', async () => {
      // AC1: Graceful handling of missing context
      const emptyContext: SessionContext = {
        storyId: '',
        acceptanceCriteria: [],
        phase: 'unknown',
      };

      const suggestions = await suggestFromSession(emptyContext);

      assert.ok(Array.isArray(suggestions), 'Should return array');
      assert.strictEqual(suggestions.length, 0, 'Should return empty array for no context');
    });

    it('should suggest jira skill when story has Jira reference', async () => {
      // AC1: Detect Jira context
      const sessionContext: SessionContext = {
        storyId: '9-3',
        jiraKey: 'MSSCI-11518',
        acceptanceCriteria: ['Update Jira status'],
        phase: 'development',
      };

      const suggestions = await suggestFromSession(sessionContext);

      const skillNames = suggestions.map(s => s.name);
      assert.ok(
        skillNames.includes('jira'),
        'Should suggest jira skill when Jira key is present'
      );
    });
  });

  describe('AC2: Keyword-triggered suggestions', () => {

    it('should extract keywords from user input and match skills', async () => {
      // AC2: Suggestions based on task analysis (keyword extraction)
      const userInput = 'I need to write some tests for this feature';

      const suggestions = await suggestFromKeywords(userInput);

      assert.ok(Array.isArray(suggestions), 'Should return array');
      assert.ok(suggestions.length > 0, 'Should find matching skills');

      const skillNames = suggestions.map(s => s.name);
      assert.ok(
        skillNames.includes('testing'),
        'Should suggest testing skill for "tests" keyword'
      );
    });

    it('should match skills by their registered keywords', async () => {
      // AC2: Registry matching
      const userInput = 'How do I use vitest for unit testing?';

      const suggestions = await suggestFromKeywords(userInput);

      // vitest is a keyword for testing skill
      const testingSuggestion = suggestions.find(s => s.name === 'testing');
      assert.ok(testingSuggestion, 'Should find testing skill via vitest keyword');
    });

    it('should score suggestions by keyword match count', async () => {
      // AC2: Scoring mechanism
      const userInput = 'I need to run tests, write tests, and check test coverage';

      const suggestions = await suggestFromKeywords(userInput);

      assert.ok(suggestions.length > 0, 'Should have suggestions');

      // First suggestion should have highest score
      for (let i = 1; i < suggestions.length; i++) {
        assert.ok(
          suggestions[i - 1].score >= suggestions[i].score,
          'Suggestions should be sorted by score descending'
        );
      }
    });

    it('should include score in each suggestion', async () => {
      // AC2: Each suggestion has a relevance score
      const userInput = 'deploy the application to production';

      const suggestions = await suggestFromKeywords(userInput);

      for (const suggestion of suggestions) {
        assert.ok(
          typeof suggestion.score === 'number',
          `Suggestion ${suggestion.name} should have numeric score`
        );
        assert.ok(
          suggestion.score >= 0 && suggestion.score <= 1,
          `Score should be between 0 and 1: ${suggestion.score}`
        );
      }
    });

    it('should return empty array for input with no skill keywords', async () => {
      // AC2: Graceful handling of no matches
      const userInput = 'hello world this is random text';

      const suggestions = await suggestFromKeywords(userInput);

      assert.ok(Array.isArray(suggestions), 'Should return array');
      assert.strictEqual(suggestions.length, 0, 'Should return empty for no keyword matches');
    });

    it('should handle case-insensitive keyword matching', async () => {
      // AC2: Case insensitivity
      const lowerInput = 'run jest tests';
      const upperInput = 'Run JEST Tests';

      const lowerSuggestions = await suggestFromKeywords(lowerInput);
      const upperSuggestions = await suggestFromKeywords(upperInput);

      assert.deepStrictEqual(
        lowerSuggestions.map(s => s.name).sort(),
        upperSuggestions.map(s => s.name).sort(),
        'Keyword matching should be case-insensitive'
      );
    });

    it('should match skill tags in addition to keywords', async () => {
      // AC2: Tag matching
      const userInput = 'I need help with quality assurance';

      const suggestions = await suggestFromKeywords(userInput);

      // 'quality' is a tag, should match skills with that tag
      const hasQualitySkill = suggestions.some(s => s.matchedOn?.includes('tag:quality'));
      assert.ok(hasQualitySkill, 'Should match skills by tag');
    });
  });

  describe('AC3: Non-intrusive presentation', () => {

    it('should only return suggestions above confidence threshold', async () => {
      // AC3: Contextual, not every message
      const options: SuggestOptions = {
        confidenceThreshold: 0.5,
      };

      const userInput = 'maybe something about testing I guess';
      const suggestions = await suggestSkills(userInput, options);

      for (const suggestion of suggestions) {
        assert.ok(
          suggestion.score >= 0.5,
          `All suggestions should be above threshold: ${suggestion.name} has ${suggestion.score}`
        );
      }
    });

    it('should limit number of suggestions returned', async () => {
      // AC3: Non-intrusive - don't overwhelm with suggestions
      const options: SuggestOptions = {
        maxResults: 3,
      };

      const userInput = 'I need to test, deploy, review, document everything';
      const suggestions = await suggestSkills(userInput, options);

      assert.ok(
        suggestions.length <= 3,
        `Should return at most ${options.maxResults} suggestions`
      );
    });

    it('should exclude already-used skills from suggestions', async () => {
      // AC3: Contextual - don't suggest what they're already using
      const options: SuggestOptions = {
        excludeSkills: ['testing'],
      };

      const userInput = 'I need to write more tests';
      const suggestions = await suggestSkills(userInput, options);

      const skillNames = suggestions.map(s => s.name);
      assert.ok(
        !skillNames.includes('testing'),
        'Should not suggest excluded skills'
      );
    });

    it('should return empty array when all matches are below threshold', async () => {
      // AC3: Don't suggest low-confidence matches
      const options: SuggestOptions = {
        confidenceThreshold: 0.99,
      };

      const userInput = 'something vaguely related to code';
      const suggestions = await suggestSkills(userInput, options);

      assert.ok(Array.isArray(suggestions), 'Should return array');
      assert.strictEqual(suggestions.length, 0, 'Should return empty when below threshold');
    });

    it('should combine session context and keywords when both provided', async () => {
      // AC3: Proactive - detect helpful moments
      const sessionContext: SessionContext = {
        storyId: '9-3',
        acceptanceCriteria: ['Add documentation'],
        phase: 'development',
      };
      const options: SuggestOptions = {
        sessionContext,
      };

      const userInput = 'how do I write good docs?';
      const suggestions = await suggestSkills(userInput, options);

      // Should boost documentation-related skills
      assert.ok(suggestions.length > 0, 'Should have suggestions');

      // First suggestion should be docs-related given both context and input mention it
      const topSuggestion = suggestions[0];
      assert.ok(
        topSuggestion.name.includes('changelog') ||
        topSuggestion.reason?.toLowerCase().includes('document'),
        'Top suggestion should be documentation-related'
      );
    });

    it('should respect default options when none provided', async () => {
      // AC3: Sensible defaults
      const userInput = 'run the tests';
      const suggestions = await suggestSkills(userInput);

      // Should work with defaults
      assert.ok(Array.isArray(suggestions), 'Should return array with default options');

      // Default threshold should filter out very low matches
      for (const suggestion of suggestions) {
        assert.ok(
          suggestion.score >= 0.3,
          'Default threshold should be at least 0.3'
        );
      }
    });
  });

  describe('SkillSuggestion interface', () => {

    it('should include name, description, score, and reason', async () => {
      // Verify the shape of returned suggestions
      const userInput = 'write tests';
      const suggestions = await suggestSkills(userInput);

      assert.ok(suggestions.length > 0, 'Should have suggestions');

      const suggestion = suggestions[0];
      assert.ok('name' in suggestion, 'Should have name');
      assert.ok('description' in suggestion, 'Should have description');
      assert.ok('score' in suggestion, 'Should have score');
      assert.ok('reason' in suggestion, 'Should have reason');
    });

    it('should optionally include matchedOn for debugging', async () => {
      // Shows what triggered the suggestion
      const userInput = 'run jest tests';
      const suggestions = await suggestSkills(userInput);

      const testingSuggestion = suggestions.find(s => s.name === 'testing');
      if (testingSuggestion) {
        assert.ok(
          'matchedOn' in testingSuggestion,
          'Should include matchedOn field'
        );
        assert.ok(
          Array.isArray(testingSuggestion.matchedOn),
          'matchedOn should be array'
        );
      }
    });
  });

  describe('Error handling', () => {

    it('should handle invalid input gracefully', async () => {
      // Empty input
      const suggestions = await suggestSkills('');

      assert.ok(Array.isArray(suggestions), 'Should return array for empty input');
      assert.strictEqual(suggestions.length, 0, 'Should return empty for empty input');
    });

    it('should handle missing registry gracefully', async () => {
      // If registry not found, should return empty (not crash)
      const options: SuggestOptions = {
        registryPath: '/nonexistent/path/registry.yaml',
      };

      const suggestions = await suggestSkills('test something', options);

      // Should gracefully return empty, not throw
      assert.ok(Array.isArray(suggestions), 'Should return array even with missing registry');
    });
  });
});
