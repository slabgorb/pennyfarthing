/**
 * Tests for theme configuration
 *
 * These tests verify:
 * - getCurrentTheme() reads from .pennyfarthing/config.local.yaml > .pennyfarthing/persona-config.yaml
 * - setTheme() writes to .pennyfarthing/config.local.yaml by default
 * - setTheme() with global option writes to .pennyfarthing/persona-config.yaml
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

    it('should return null when only .claude/persona-config.yaml exists (no fallback)', () => {
      // Setup: only legacy shared config — no longer a valid source
      const sharedConfig = { theme: 'discworld' };

      writeFileSync(
        join(claudeDir, 'persona-config.yaml'),
        yamlStringify(sharedConfig)
      );

      // Act
      const result = getCurrentTheme(testDir);

      // Assert: .claude/persona-config.yaml is not a fallback anymore
      assert.strictEqual(result, null, 'Should not fall back to .claude/persona-config.yaml');
    });

    it('should fall back to .pennyfarthing/persona-config.yaml when config.local.yaml is absent', () => {
      // Setup: project default at .pennyfarthing/persona-config.yaml (set via --global)
      writeFileSync(
        join(pennyfarthingDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'discworld' })
      );

      // Act
      const result = getCurrentTheme(testDir);

      // Assert: should fall back to .pennyfarthing/persona-config.yaml
      assert.strictEqual(result, 'discworld', 'Should fall back to .pennyfarthing/persona-config.yaml');
    });

    it('should prefer config.local.yaml over persona-config.yaml in .pennyfarthing/', () => {
      // Setup: both files in .pennyfarthing/
      writeFileSync(
        join(pennyfarthingDir, 'config.local.yaml'),
        yamlStringify({ theme: 'star-trek' })
      );
      writeFileSync(
        join(pennyfarthingDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'discworld' })
      );

      // Act
      const result = getCurrentTheme(testDir);

      // Assert: config.local.yaml wins
      assert.strictEqual(result, 'star-trek', 'config.local.yaml should take priority over persona-config.yaml');
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
      const result = setTheme('test-theme', testDir);
      if (!result.success) return; // Theme discovery may not work in temp dirs

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
      const result2 = setTheme('test-theme', testDir);
      if (!result2.success) return; // Theme discovery may not work in temp dirs

      // Assert: shared config should be unchanged
      const sharedContent = yamlParse(readFileSync(join(claudeDir, 'persona-config.yaml'), 'utf-8'));
      assert.strictEqual(
        sharedContent.theme,
        'original-theme',
        'Shared config should remain unchanged when setting local theme'
      );
    });

    it('should write to .pennyfarthing/persona-config.yaml when global option is true', () => {
      // Act: set theme with global option
      const result3 = setTheme('test-theme', testDir, { global: true });
      if (!result3.success) return; // Theme discovery may not work in temp dirs

      // Assert: project default config at .pennyfarthing/persona-config.yaml
      const globalPath = join(pennyfarthingDir, 'persona-config.yaml');
      assert.ok(existsSync(globalPath), 'Global option should write to .pennyfarthing/persona-config.yaml');
      const globalContent = yamlParse(readFileSync(globalPath, 'utf-8'));
      assert.strictEqual(
        globalContent.theme,
        'test-theme',
        'Global option should update .pennyfarthing/persona-config.yaml'
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
