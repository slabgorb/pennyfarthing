/**
 * Tests for Story 9-2: Build Skill Search Utility
 *
 * Run with: npm test -- scripts/utils/skill-search.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

import {
  searchSkills,
  type SkillResult
} from './skill-search.js';

const WRAPPER_PATH = join(import.meta.dirname, 'skill-search.sh');

describe('Story 9-2: Skill Search Utility', () => {

  describe('searchSkills() - Core Function', () => {

    describe('AC1: Script is functional', () => {

      it('should read skill-registry.yaml and return all skills when no filters', async () => {
        const result = await searchSkills({});
        assert.ok(result.success, 'Should succeed');
        const results = result.data!;
        assert.ok(Array.isArray(results), 'Should return an array');
        assert.ok(results.length > 0, 'Should return skills from registry');
        assert.ok(results.length === 22, 'Should return all 22 skills when no filters');
      });

      it('should return skills with required fields', async () => {
        const result = await searchSkills({});
        assert.ok(result.success);
        for (const skill of result.data!) {
          assert.ok(skill.name, `Skill should have name`);
          assert.ok(skill.description, `Skill ${skill.name} should have description`);
          assert.ok(skill.category, `Skill ${skill.name} should have category`);
          assert.ok(Array.isArray(skill.tags), `Skill ${skill.name} should have tags array`);
        }
      });

      it('should filter by tag with --tag option', async () => {
        const result = await searchSkills({ tag: 'tdd' });
        assert.ok(result.success);
        const results = result.data!;
        assert.ok(results.length > 0, 'Should return at least one skill with tdd tag');
        assert.ok(
          results.every(s => s.tags.includes('tdd')),
          'All results should have tdd tag'
        );
      });

      it('should filter by keyword with --keyword option', async () => {
        const result = await searchSkills({ keyword: 'jest' });
        assert.ok(result.success);
        const results = result.data!;
        assert.ok(results.length > 0, 'Should return at least one skill with jest keyword');
        assert.ok(
          results.every(s => s.keywords?.includes('jest')),
          'All results should have jest in keywords'
        );
      });

      it('should search descriptions with --query option', async () => {
        const result = await searchSkills({ query: 'TDD workflow' });
        assert.ok(result.success);
        const results = result.data!;
        assert.ok(results.length > 0, 'Should return skills matching query');
        assert.ok(
          results.some(s => s.description.toLowerCase().includes('tdd')),
          'At least one result should mention TDD in description'
        );
      });
    });

    describe('AC2: Tag/keyword search returns expected results', () => {

      it('should return testing skill when filtering by --tag tdd', async () => {
        const result = await searchSkills({ tag: 'tdd' });
        assert.ok(result.success);
        const skillNames = result.data!.map(s => s.name);
        assert.ok(skillNames.includes('pf-testing'), 'Should include testing skill for tdd tag');
      });

      it('should return testing skill when filtering by --keyword vitest', async () => {
        const result = await searchSkills({ keyword: 'vitest' });
        assert.ok(result.success);
        const skillNames = result.data!.map(s => s.name);
        assert.ok(skillNames.includes('pf-testing'), 'Should include testing skill for vitest keyword');
      });

      it('should return 4 skills when filtering by --category development', async () => {
        const result = await searchSkills({ category: 'development' });
        assert.ok(result.success);
        const results = result.data!;
        assert.strictEqual(results.length, 4, 'Should return 4 development skills');
        assert.ok(
          results.every(s => s.category === 'development'),
          'All results should be development category'
        );
      });

      it('should combine multiple filters with AND logic', async () => {
        const result = await searchSkills({ tag: 'quality', category: 'development' });
        assert.ok(result.success);
        const results = result.data!;
        assert.ok(results.length > 0, 'Should return at least one result');
        assert.ok(results.length < 3, 'Should be narrower than just category filter');
        assert.ok(
          results.every(s => s.category === 'development' && s.tags.includes('quality')),
          'All results should match both filters'
        );
      });

      it('should return empty array for non-existent tag (not error)', async () => {
        const result = await searchSkills({ tag: 'nonexistent-tag-xyz' });
        assert.ok(result.success);
        assert.strictEqual(result.data!.length, 0, 'Should return empty array for no matches');
      });

      it('should return empty array for non-existent keyword', async () => {
        const result = await searchSkills({ keyword: 'nonexistent-keyword-xyz' });
        assert.ok(result.success);
        assert.strictEqual(result.data!.length, 0, 'Should return empty array for no matches');
      });

      it('should handle case-insensitive tag matching', async () => {
        const upperResult = await searchSkills({ tag: 'TDD' });
        const lowerResult = await searchSkills({ tag: 'tdd' });
        assert.ok(upperResult.success && lowerResult.success);
        assert.deepStrictEqual(
          upperResult.data!.map(s => s.name).sort(),
          lowerResult.data!.map(s => s.name).sort(),
          'Tag matching should be case-insensitive'
        );
      });
    });

    describe('AC3: JSON output format', () => {

      it('should return valid JSON-serializable results', async () => {
        const result = await searchSkills({});
        assert.ok(result.success);
        const jsonString = JSON.stringify(result.data);
        const parsed = JSON.parse(jsonString);
        assert.ok(Array.isArray(parsed), 'Should produce valid JSON array');
      });

      it('should include name, description, category, tags in each result', async () => {
        const result = await searchSkills({});
        assert.ok(result.success);
        for (const skill of result.data!) {
          assert.ok('name' in skill, 'Should include name');
          assert.ok('description' in skill, 'Should include description');
          assert.ok('category' in skill, 'Should include category');
          assert.ok('tags' in skill, 'Should include tags');
        }
      });

      it('should include keywords in results when present', async () => {
        const result = await searchSkills({ keyword: 'jest' });
        assert.ok(result.success);
        const results = result.data!;
        assert.ok(results.length > 0, 'Should have results');
        assert.ok(
          results.every(s => 'keywords' in s),
          'All results should include keywords field'
        );
      });
    });

    describe('Error Handling', () => {

      it('should return error result when registry file is missing', async () => {
        const result = await searchSkills({ registryPath: '/nonexistent/path/registry.yaml' });
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.match(/registry.*not found|cannot find|no such file/i));
      });

      it('should return error result for invalid category value', async () => {
        const result = await searchSkills({ category: 'invalid-category' });
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.match(/invalid category|unknown category/i));
      });
    });
  });

  describe('Shell Wrapper Integration', { skip: !existsSync(WRAPPER_PATH) }, () => {

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
      assert.throws(() => JSON.parse(result), 'Non-JSON output should not be valid JSON');
      assert.ok(result.includes('testing'), 'Should show testing skill name');
    });
  });
});
