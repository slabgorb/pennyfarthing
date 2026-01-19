/**
 * Tests for theme configuration
 *
 * These tests verify:
 * - getCurrentTheme() checks .pennyfarthing/config.local.yaml first, falls back to shared
 * - setTheme() writes to .pennyfarthing/config.local.yaml by default
 * - setTheme() with global option writes to shared config
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { stringify as yamlStringify, parse as yamlParse } from 'yaml';

// Import functions to test
import { getCurrentTheme, setTheme } from './themes.js';

describe('Theme Configuration', () => {
  let testDir: string;
  let claudeDir: string;
  let pennyfarthingDir: string;
  let themesDir: string;

  // Minimal valid theme for testing
  const testTheme = {
    theme: { name: 'Test Theme', description: 'Test theme for unit tests' },
    agents: {
      orchestrator: { character: 'Test Orchestrator', style: 'test' },
      sm: { character: 'Test SM', style: 'test' },
      tea: { character: 'Test TEA', style: 'test' },
      dev: { character: 'Test Dev', style: 'test' },
      reviewer: { character: 'Test Reviewer', style: 'test' },
      architect: { character: 'Test Architect', style: 'test' },
      pm: { character: 'Test PM', style: 'test' },
      'tech-writer': { character: 'Test Writer', style: 'test' },
      'ux-designer': { character: 'Test UX', style: 'test' },
      devops: { character: 'Test DevOps', style: 'test' }
    }
  };

  beforeEach(() => {
    // Create a temporary project directory for each test
    testDir = join(tmpdir(), `pennyfarthing-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    claudeDir = join(testDir, '.claude');
    pennyfarthingDir = join(testDir, '.pennyfarthing');
    themesDir = join(claudeDir, 'pennyfarthing/themes');
    mkdirSync(themesDir, { recursive: true });
    mkdirSync(pennyfarthingDir, { recursive: true });

    // Create a test theme so setTheme can find it
    writeFileSync(join(themesDir, 'test-theme.yaml'), yamlStringify(testTheme));
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('getCurrentTheme() precedence', () => {
    it('should return local theme when both local and shared exist', () => {
      // Setup: local config with "star-trek", shared config with "discworld"
      const localConfig = { theme: 'star-trek' };
      const sharedConfig = { theme: 'discworld' };

      writeFileSync(
        join(pennyfarthingDir, 'config.local.yaml'),
        yamlStringify(localConfig)
      );
      writeFileSync(
        join(claudeDir, 'persona-config.yaml'),
        yamlStringify(sharedConfig)
      );

      // Act
      const result = getCurrentTheme(testDir);

      // Assert: should prefer .pennyfarthing/ over .claude/
      assert.strictEqual(result, 'star-trek', 'Should return local theme when both exist');
    });

    it('should fall back to shared theme when local does not exist', () => {
      // Setup: only shared config
      const sharedConfig = { theme: 'discworld' };

      writeFileSync(
        join(claudeDir, 'persona-config.yaml'),
        yamlStringify(sharedConfig)
      );

      // Act
      const result = getCurrentTheme(testDir);

      // Assert: should use shared config
      assert.strictEqual(result, 'discworld', 'Should fall back to shared theme');
    });

    it('should return null when neither local nor shared exist', () => {
      // Setup: no config files (just empty directories)

      // Act
      const result = getCurrentTheme(testDir);

      // Assert
      assert.strictEqual(result, null, 'Should return null when no config exists');
    });

    it('should prefer local even when local theme is different', () => {
      // Setup: local explicitly set to minimalist, shared is elaborate theme
      const localConfig = { theme: 'minimalist' };
      const sharedConfig = { theme: 'shakespeare' };

      writeFileSync(
        join(pennyfarthingDir, 'config.local.yaml'),
        yamlStringify(localConfig)
      );
      writeFileSync(
        join(claudeDir, 'persona-config.yaml'),
        yamlStringify(sharedConfig)
      );

      // Act
      const result = getCurrentTheme(testDir);

      // Assert
      assert.strictEqual(result, 'minimalist', 'Should always prefer local config');
    });
  });

  describe('setTheme() writes to local config', () => {
    it('should write to .pennyfarthing/config.local.yaml by default', () => {
      // Setup: create shared config with a different theme
      const sharedConfig = { theme: 'other-theme' };
      writeFileSync(
        join(claudeDir, 'persona-config.yaml'),
        yamlStringify(sharedConfig)
      );

      // Act: set theme using our test theme
      setTheme('test-theme', testDir);

      // Assert: local config should exist with the new theme
      const localPath = join(pennyfarthingDir, 'config.local.yaml');

      assert.ok(existsSync(localPath), 'setTheme should write to .pennyfarthing/config.local.yaml');
      const localContent = yamlParse(readFileSync(localPath, 'utf-8'));
      assert.strictEqual(localContent.theme, 'test-theme', 'Local config should have the theme');
    });

    it('should not modify shared config when setting theme locally', () => {
      // Setup: shared config with original theme
      const originalSharedConfig = { theme: 'original-theme' };
      writeFileSync(
        join(claudeDir, 'persona-config.yaml'),
        yamlStringify(originalSharedConfig)
      );

      // Act: set theme locally
      setTheme('test-theme', testDir);

      // Assert: shared config should be unchanged
      const sharedContent = yamlParse(readFileSync(join(claudeDir, 'persona-config.yaml'), 'utf-8'));
      assert.strictEqual(
        sharedContent.theme,
        'original-theme',
        'Shared config should remain unchanged when setting local theme'
      );
    });

    it('should write to shared config when global option is true', () => {
      // Setup: shared config with original theme
      const sharedConfig = { theme: 'original-theme' };
      writeFileSync(
        join(claudeDir, 'persona-config.yaml'),
        yamlStringify(sharedConfig)
      );

      // Act: set theme with global option
      setTheme('test-theme', testDir, { global: true });

      // Assert: shared config should be updated
      const sharedContent = yamlParse(readFileSync(join(claudeDir, 'persona-config.yaml'), 'utf-8'));
      assert.strictEqual(
        sharedContent.theme,
        'test-theme',
        'Global option should update shared config'
      );
    });
  });

  describe('Theme precedence integration', () => {
    it('should allow multiple users to have different themes', () => {
      // This test simulates the scenario where:
      // - Shared config has team default "discworld"
      // - User A sets local to "star-trek"
      // - getCurrentTheme should return "star-trek" for User A

      // Setup: shared team default
      writeFileSync(
        join(claudeDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'discworld' })
      );

      // User A sets their local preference
      writeFileSync(
        join(pennyfarthingDir, 'config.local.yaml'),
        yamlStringify({ theme: 'star-trek' })
      );

      // Assert: User A sees their local theme
      const result = getCurrentTheme(testDir);
      assert.strictEqual(result, 'star-trek', 'User should see their local theme preference');
    });
  });
});
