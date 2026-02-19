/**
 * Tests for Story 9-2: Build Skill Search Utility
 *
 * These tests verify:
 * - Tag filtering returns expected skills
 * - Keyword search returns expected skills
 * - Category filtering works
 * - Combined filters use AND logic
 * - JSON output is valid and includes required fields
 * - Empty results return empty array (not error)
 * - Error handling for missing registry
 *
 * Run with: npm test -- scripts/utils/skill-search.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

// Import functions to test - these don't exist yet, tests should fail
import {
  searchSkills,
  type SkillResult
} from './skill-search.js';

// Path to the shell wrapper for integration tests
const WRAPPER_PATH = join(import.meta.dirname, 'skill-search.sh');

describe('Story 9-2: Skill Search Utility', () => {

  describe('searchSkills() - Core Function', () => {

    describe('AC1: Script is functional', () => {

      it('should read skill-registry.yaml and return all skills when no filters', async () => {
        // AC1: Reads skill-registry.yaml
        const results = await searchSkills({});

        assert.ok(Array.isArray(results), 'Should return an array');
        assert.ok(results.length > 0, 'Should return skills from registry');
        assert.ok(results.length === 22, 'Should return all 22 skills when no filters');
      });

      it('should return skills with required fields', async () => {
        // AC1: Each skill should have core metadata
        const results = await searchSkills({});

        for (const skill of results) {
          assert.ok(skill.name, `Skill should have name`);
          assert.ok(skill.description, `Skill ${skill.name} should have description`);
          assert.ok(skill.category, `Skill ${skill.name} should have category`);
          assert.ok(Array.isArray(skill.tags), `Skill ${skill.name} should have tags array`);
        }
      });

      it('should filter by tag with --tag option', async () => {
        // AC1: Filters by tag with --tag <category>
        const results = await searchSkills({ tag: 'tdd' });

        assert.ok(results.length > 0, 'Should return at least one skill with tdd tag');
        assert.ok(
          results.every(s => s.tags.includes('tdd')),
          'All results should have tdd tag'
        );
      });

      it('should filter by keyword with --keyword option', async () => {
        // AC1: Filters by keyword with --keyword <term>
        const results = await searchSkills({ keyword: 'jest' });

        assert.ok(results.length > 0, 'Should return at least one skill with jest keyword');
        assert.ok(
          results.every(s => s.keywords?.includes('jest')),
          'All results should have jest in keywords'
        );
      });

      it('should search descriptions with --query option', async () => {
        // AC1: Searches descriptions with --query <text>
        const results = await searchSkills({ query: 'TDD workflow' });

        assert.ok(results.length > 0, 'Should return skills matching query');
        assert.ok(
          results.some(s => s.description.toLowerCase().includes('tdd')),
          'At least one result should mention TDD in description'
        );
      });
    });

    describe('AC2: Tag/keyword search returns expected results', () => {

      it('should return testing skill when filtering by --tag tdd', async () => {
        // AC2: --tag development returns skills with that tag
        const results = await searchSkills({ tag: 'tdd' });

        const skillNames = results.map(s => s.name);
        assert.ok(skillNames.includes('pf-testing'), 'Should include testing skill for tdd tag');
      });

      it('should return testing skill when filtering by --keyword vitest', async () => {
        // AC2: --keyword jest returns skills mentioning jest in keywords
        const results = await searchSkills({ keyword: 'vitest' });

        const skillNames = results.map(s => s.name);
        assert.ok(skillNames.includes('pf-testing'), 'Should include testing skill for vitest keyword');
      });

      it('should return 3 skills when filtering by --category development', async () => {
        // AC2: Category filter returns expected count
        const results = await searchSkills({ category: 'development' });

        assert.strictEqual(results.length, 3, 'Should return 3 development skills');
        assert.ok(
          results.every(s => s.category === 'development'),
          'All results should be development category'
        );
      });

      it('should combine multiple filters with AND logic', async () => {
        // AC2: Multiple filters can be combined (AND logic)
        const results = await searchSkills({
          tag: 'quality',
          category: 'development'
        });

        assert.ok(results.length > 0, 'Should return at least one result');
        assert.ok(results.length < 3, 'Should be narrower than just category filter');
        assert.ok(
          results.every(s => s.category === 'development' && s.tags.includes('quality')),
          'All results should match both filters'
        );
      });

      it('should return empty array for non-existent tag (not error)', async () => {
        // AC2: Empty results handled gracefully
        const results = await searchSkills({ tag: 'nonexistent-tag-xyz' });

        assert.ok(Array.isArray(results), 'Should return an array');
        assert.strictEqual(results.length, 0, 'Should return empty array for no matches');
      });

      it('should return empty array for non-existent keyword', async () => {
        // AC2: Empty results for non-existent keyword
        const results = await searchSkills({ keyword: 'nonexistent-keyword-xyz' });

        assert.ok(Array.isArray(results), 'Should return an array');
        assert.strictEqual(results.length, 0, 'Should return empty array for no matches');
      });

      it('should handle case-insensitive tag matching', async () => {
        // AC2: Tags should match case-insensitively
        const upperResults = await searchSkills({ tag: 'TDD' });
        const lowerResults = await searchSkills({ tag: 'tdd' });

        assert.deepStrictEqual(
          upperResults.map(s => s.name).sort(),
          lowerResults.map(s => s.name).sort(),
          'Tag matching should be case-insensitive'
        );
      });
    });

    describe('AC3: JSON output format', () => {

      it('should return valid JSON-serializable results', async () => {
        // AC3: Output should be valid JSON
        const results = await searchSkills({});

        const jsonString = JSON.stringify(results);
        const parsed = JSON.parse(jsonString);

        assert.ok(Array.isArray(parsed), 'Should produce valid JSON array');
      });

      it('should include name, description, category, tags in each result', async () => {
        // AC3: Each skill object includes: name, description, category, tags
        const results = await searchSkills({});

        for (const skill of results) {
          assert.ok('name' in skill, 'Should include name');
          assert.ok('description' in skill, 'Should include description');
          assert.ok('category' in skill, 'Should include category');
          assert.ok('tags' in skill, 'Should include tags');
        }
      });

      it('should include keywords in results when present', async () => {
        // AC3: Keywords should be included for search relevance
        const results = await searchSkills({ keyword: 'jest' });

        assert.ok(results.length > 0, 'Should have results');
        assert.ok(
          results.every(s => 'keywords' in s),
          'All results should include keywords field'
        );
      });
    });

    describe('Error Handling', () => {

      it('should throw helpful error when registry file is missing', async () => {
        // Error handling: Missing registry file shows helpful error
        await assert.rejects(
          async () => searchSkills({ registryPath: '/nonexistent/path/registry.yaml' }),
          {
            message: /registry.*not found|cannot find|no such file/i
          },
          'Should throw error with helpful message for missing registry'
        );
      });

      it('should throw error for invalid category value', async () => {
        // Error handling: Invalid category should be rejected
        await assert.rejects(
          async () => searchSkills({ category: 'invalid-category' }),
          {
            message: /invalid category|unknown category/i
          },
          'Should throw error for invalid category'
        );
      });
    });
  });

  describe('Shell Wrapper Integration', { skip: !existsSync(WRAPPER_PATH) }, () => {
    // Skip all wrapper tests if skill-search.sh doesn't exist yet

    it('should execute via bash wrapper', () => {
      const result = execSync(`bash ${WRAPPER_PATH} --help`, { encoding: 'utf-8' });
      assert.ok(result.includes('search') || result.includes('usage'), 'Should show help text');
    });

    it('should output JSON with --json flag via wrapper', () => {
      const result = execSync(`bash ${WRAPPER_PATH} --json`, { encoding: 'utf-8' });
      const parsed = JSON.parse(result);

      assert.ok(Array.isArray(parsed), 'Should output valid JSON array');
    });

    it('should filter by tag via wrapper', () => {
      const result = execSync(`bash ${WRAPPER_PATH} --tag tdd --json`, { encoding: 'utf-8' });
      const parsed = JSON.parse(result);

      assert.ok(parsed.length > 0, 'Should return results for tdd tag');
      assert.ok(
        parsed.every((s: SkillResult) => s.tags.includes('tdd')),
        'All results should have tdd tag'
      );
    });

    it('should show human-readable table without --json flag', () => {
      const result = execSync(`bash ${WRAPPER_PATH} --tag tdd`, { encoding: 'utf-8' });

      // Should not be valid JSON (it's a table)
      assert.throws(
        () => JSON.parse(result),
        'Non-JSON output should not be valid JSON'
      );

      // Should contain skill name and some formatting
      assert.ok(result.includes('testing'), 'Should show testing skill name');
    });
  });
});
