/**
 * Tests for Story 6-1: /theme-maker command skeleton
 *
 * These tests verify:
 * - The theme-maker.md command file exists with correct structure
 * - Theme name validation rejects invalid names
 * - Theme name validation accepts valid names
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { validateThemeName, getProjectCustomThemesDir } from './utils/themes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Navigate from dist/cli/ to project root
const projectRoot = join(__dirname, '..', '..');
const distDir = join(projectRoot, 'pennyfarthing-dist');

describe('/theme-maker Command File', () => {
  const commandPath = join(distDir, 'commands', 'theme-maker.md');

  it('should have theme-maker.md command file', () => {
    assert.ok(
      existsSync(commandPath),
      `Missing command file: ${commandPath}`
    );
  });

  it('should have YAML frontmatter with description', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.startsWith('---'),
      'Command file should start with YAML frontmatter (---)'
    );
    assert.ok(
      content.includes('description:'),
      'Frontmatter should have description field'
    );
  });

  it('should reference mode selection options', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.toLowerCase().includes('ai-driven') ||
        content.toLowerCase().includes('ai driven'),
      'Should mention AI-Driven mode'
    );
    assert.ok(
      content.toLowerCase().includes('guided'),
      'Should mention Guided mode'
    );
    assert.ok(
      content.toLowerCase().includes('manual'),
      'Should mention Manual mode'
    );
  });

  it('should mention AskUserQuestion for mode selection', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.includes('AskUserQuestion'),
      'Should reference AskUserQuestion tool for user interaction'
    );
  });

  it('should reference pennyfarthing_version field', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.includes('pennyfarthing_version'),
      'Should mention pennyfarthing_version field for skeleton YAML'
    );
  });

  it('should reference theme directory path', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.includes('.claude/pennyfarthing/themes') ||
        content.includes('themes/'),
      'Should mention theme directory for output'
    );
  });
});

describe('Theme Name Validation', () => {
  describe('rejects invalid names', () => {
    it('should reject empty name', () => {
      const result = validateThemeName('');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('required'));
    });

    it('should reject names with spaces', () => {
      const result = validateThemeName('my theme');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('space'));
    });

    it('should reject uppercase names', () => {
      const result = validateThemeName('MyTheme');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('lowercase'));
    });

    it('should reject names starting with number', () => {
      const result = validateThemeName('123theme');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('start with a letter'));
    });

    it('should reject names with special characters', () => {
      const result = validateThemeName('my_theme');
      assert.strictEqual(result.valid, false);
    });

    it('should reject names starting with hyphen', () => {
      const result = validateThemeName('-my-theme');
      assert.strictEqual(result.valid, false);
    });
  });

  describe('accepts valid names', () => {
    it('should accept simple lowercase name', () => {
      const result = validateThemeName('mytheme');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, undefined);
    });

    it('should accept hyphenated name', () => {
      const result = validateThemeName('my-custom-theme');
      assert.strictEqual(result.valid, true);
    });

    it('should accept name with numbers', () => {
      const result = validateThemeName('theme2025');
      assert.strictEqual(result.valid, true);
    });

    it('should accept single letter name', () => {
      const result = validateThemeName('x');
      assert.strictEqual(result.valid, true);
    });
  });
});

describe('Theme Directory Creation', () => {
  const testProjectRoot = join(__dirname, '..', '..', '.test-project');
  const expectedDir = join(testProjectRoot, '.claude', 'pennyfarthing', 'themes');

  it('should return correct custom themes directory path', () => {
    const themesDir = getProjectCustomThemesDir(testProjectRoot);
    assert.strictEqual(
      themesDir,
      expectedDir,
      `Expected ${expectedDir}, got ${themesDir}`
    );
  });
});
