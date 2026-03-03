/**
 * Tests for Story 15-1: Add pennyfarthing cyclist launcher command
 *
 * These tests verify:
 * - findCyclist() discovers cyclist installation correctly
 * - loadThemeConfig() reads theme from persona-config
 * - resolveThemePath() finds theme YAML files
 * - cyclistCommand() orchestrates the full flow
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { stringify as yamlStringify } from 'yaml';

// Import functions to test - these don't exist yet, tests should fail
import {
  findCyclist,
  loadThemeConfig,
  resolveThemePath,
  cyclistCommand,
  type CyclistDeps
} from './cyclist.js';

// Type for mock spawn options
interface SpawnOptions {
  env: Record<string, string>;
  stdio?: string;
}

describe('Story 15-1: Cyclist Launcher Command', () => {
  let testDir: string;
  let claudeDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let originalCwd: () => string;

  beforeEach(() => {
    // Save original environment and cwd
    originalEnv = { ...process.env };
    originalCwd = process.cwd;

    // Create a temporary project directory for each test
    testDir = join(tmpdir(), `pennyfarthing-cyclist-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    claudeDir = join(testDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });

    // Mock process.cwd to return our test directory
    process.cwd = () => testDir;
  });

  afterEach(() => {
    // Restore original environment and cwd
    process.env = originalEnv;
    process.cwd = originalCwd;

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('findCyclist()', () => {
    it('should return CYCLIST_PATH when environment variable is set', () => {
      // AC: Finds cyclist via CYCLIST_PATH env var
      const customPath = '/custom/path/to/cyclist';
      process.env.CYCLIST_PATH = customPath;

      const result = findCyclist();

      assert.strictEqual(result, customPath, 'Should return CYCLIST_PATH env var value');
    });

    it('should find cyclist in sibling directory ../cyclist', () => {
      // AC: Finds cyclist in ../cyclist
      // Setup: Create a mock cyclist installation as sibling
      const parentDir = join(testDir, '..');
      const siblingCyclist = join(parentDir, 'cyclist');
      mkdirSync(siblingCyclist, { recursive: true });
      writeFileSync(join(siblingCyclist, 'package.json'), JSON.stringify({ name: 'cyclist' }));

      // Clear env var to test directory discovery
      delete process.env.CYCLIST_PATH;

      const result = findCyclist();

      assert.strictEqual(result, siblingCyclist, 'Should find cyclist in sibling directory');

      // Cleanup sibling
      rmSync(siblingCyclist, { recursive: true, force: true });
    });

    it('should throw helpful error when cyclist is not found', () => {
      // AC: Helpful error message if cyclist not found
      delete process.env.CYCLIST_PATH;

      assert.throws(
        () => findCyclist({ monorepoSearchPaths: [] }),
        {
          message: /Cyclist not found/i
        },
        'Should throw error with helpful message when cyclist not found'
      );
    });

    it('should include CYCLIST_PATH suggestion in error message', () => {
      // AC: Helpful error message if cyclist not found
      delete process.env.CYCLIST_PATH;

      try {
        findCyclist({ monorepoSearchPaths: [] });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(
          (error as Error).message.includes('CYCLIST_PATH'),
          'Error message should suggest setting CYCLIST_PATH'
        );
      }
    });
  });

  describe('loadThemeConfig()', () => {
    it('should read theme from .pennyfarthing/persona-config.yaml', () => {
      // AC: Sets correct environment variables (CYCLIST_THEME)
      const config = { theme: 'enlightenment-thinkers' };
      const pennyfarthingDir = join(testDir, '.pennyfarthing');
      mkdirSync(pennyfarthingDir, { recursive: true });
      writeFileSync(
        join(pennyfarthingDir, 'persona-config.yaml'),
        yamlStringify(config)
      );

      const result = loadThemeConfig(testDir);

      assert.strictEqual(result.theme, 'enlightenment-thinkers', 'Should read theme from .pennyfarthing/persona-config.yaml');
    });

    it('should prefer .pennyfarthing/config.local.yaml over persona-config.yaml', () => {
      // .pennyfarthing/config.local.yaml takes precedence over .pennyfarthing/persona-config.yaml
      const sharedConfig = { theme: 'discworld' };
      const localConfig = { theme: 'star-trek' };

      const pennyfarthingDir = join(testDir, '.pennyfarthing');
      mkdirSync(pennyfarthingDir, { recursive: true });

      writeFileSync(
        join(pennyfarthingDir, 'persona-config.yaml'),
        yamlStringify(sharedConfig)
      );
      writeFileSync(
        join(pennyfarthingDir, 'config.local.yaml'),
        yamlStringify(localConfig)
      );

      const result = loadThemeConfig(testDir);

      assert.strictEqual(result.theme, 'star-trek', 'Should prefer .pennyfarthing/config.local.yaml');
    });

    it('should return default theme when no config exists', () => {
      // No config files exist

      const result = loadThemeConfig(testDir);

      assert.strictEqual(result.theme, 'minimalist', 'Should fall back to minimalist theme');
    });
  });

  describe('resolveThemePath()', () => {
    it('should resolve theme path in project personas directory', () => {
      // AC: Sets correct CYCLIST_THEME_PATH
      const personasDir = join(claudeDir, 'personas');
      mkdirSync(personasDir, { recursive: true });
      writeFileSync(join(personasDir, 'enlightenment-thinkers.yaml'), 'theme: test');

      const result = resolveThemePath('enlightenment-thinkers', testDir);

      assert.strictEqual(
        result,
        join(personasDir, 'enlightenment-thinkers.yaml'),
        'Should resolve to project personas directory'
      );
    });

    it('should resolve theme path in node_modules when not in project', () => {
      // Setup: No local theme, but mock node_modules path exists
      // This tests the fallback behavior
      const result = resolveThemePath('minimalist', testDir);

      assert.ok(
        result.includes('minimalist.yaml'),
        'Should return a path ending in minimalist.yaml'
      );
    });
  });

  describe('cyclistCommand()', () => {
    let spawnMock: ReturnType<typeof mock.fn>;
    let openMock: ReturnType<typeof mock.fn>;

    beforeEach(() => {
      // Create mock cyclist installation
      const parentDir = join(testDir, '..');
      const siblingCyclist = join(parentDir, 'cyclist');
      mkdirSync(siblingCyclist, { recursive: true });
      mkdirSync(join(siblingCyclist, 'dist'), { recursive: true });
      writeFileSync(join(siblingCyclist, 'package.json'), JSON.stringify({ name: 'cyclist' }));
      writeFileSync(join(siblingCyclist, 'dist', 'bikerack.js'), '// mock bikerack entry');

      // Create theme config at canonical location
      const pennyfarthingDir = join(testDir, '.pennyfarthing');
      mkdirSync(pennyfarthingDir, { recursive: true });
      writeFileSync(
        join(pennyfarthingDir, 'config.local.yaml'),
        yamlStringify({ theme: 'enlightenment-thinkers' })
      );

      // Create theme file
      const personasDir = join(claudeDir, 'personas');
      mkdirSync(personasDir, { recursive: true });
      writeFileSync(join(personasDir, 'enlightenment-thinkers.yaml'), 'theme: test');

      // Create mocks
      spawnMock = mock.fn(() => ({
        on: mock.fn(),
        stdout: { on: mock.fn() },
        stderr: { on: mock.fn() }
      }));
      openMock = mock.fn();
    });

    afterEach(() => {
      // Cleanup sibling cyclist
      const siblingCyclist = join(testDir, '..', 'cyclist');
      if (existsSync(siblingCyclist)) {
        rmSync(siblingCyclist, { recursive: true, force: true });
      }
    });

    it('should set CYCLIST_PROJECT_DIR environment variable', async () => {
      // AC: Sets correct environment variables - CYCLIST_PROJECT_DIR
      await cyclistCommand({ noOpen: true }, { spawn: spawnMock as unknown as CyclistDeps['spawn'], open: openMock as unknown as CyclistDeps['open'] });

      // Check the spawn was called with correct env
      assert.ok(spawnMock.mock.calls.length > 0, 'spawn should be called');
      const spawnCall = spawnMock.mock.calls[0];
      const spawnOptions = spawnCall.arguments[2] as SpawnOptions;

      assert.strictEqual(
        spawnOptions.env.CYCLIST_PROJECT_DIR,
        testDir,
        'Should set CYCLIST_PROJECT_DIR to current working directory'
      );
    });

    it('should set CYCLIST_THEME environment variable', async () => {
      // AC: Sets correct environment variables - CYCLIST_THEME
      await cyclistCommand({ noOpen: true }, { spawn: spawnMock as unknown as CyclistDeps['spawn'], open: openMock as unknown as CyclistDeps['open'] });

      const spawnCall = spawnMock.mock.calls[0];
      const spawnOptions = spawnCall.arguments[2] as SpawnOptions;

      assert.strictEqual(
        spawnOptions.env.CYCLIST_THEME,
        'enlightenment-thinkers',
        'Should set CYCLIST_THEME from persona config'
      );
    });

    it('should set CYCLIST_THEME_PATH environment variable', async () => {
      // AC: Sets correct environment variables - CYCLIST_THEME_PATH
      await cyclistCommand({ noOpen: true }, { spawn: spawnMock as unknown as CyclistDeps['spawn'], open: openMock as unknown as CyclistDeps['open'] });

      const spawnCall = spawnMock.mock.calls[0];
      const spawnOptions = spawnCall.arguments[2] as SpawnOptions;

      assert.ok(
        spawnOptions.env.CYCLIST_THEME_PATH.includes('enlightenment-thinkers.yaml'),
        'Should set CYCLIST_THEME_PATH to theme YAML path'
      );
    });

    it('should spawn cyclist server process', async () => {
      // AC: Spawns cyclist server successfully
      await cyclistCommand({ noOpen: true }, { spawn: spawnMock as unknown as CyclistDeps['spawn'], open: openMock as unknown as CyclistDeps['open'] });

      assert.ok(spawnMock.mock.calls.length > 0, 'spawn should be called');

      const spawnCall = spawnMock.mock.calls[0];
      const command = spawnCall.arguments[0] as string;
      const args = spawnCall.arguments[1] as string[];

      assert.strictEqual(command, 'node', 'Should spawn node process');
      assert.ok(
        args[0].includes('bikerack.js'),
        'Should spawn cyclist bikerack.js entry point'
      );
    });

    it('should open browser by default', async () => {
      // AC: Opens browser
      await cyclistCommand({}, { spawn: spawnMock as unknown as CyclistDeps['spawn'], open: openMock as unknown as CyclistDeps['open'] });

      assert.ok(openMock.mock.calls.length > 0, 'open should be called');
      const openCall = openMock.mock.calls[0];
      assert.ok(
        (openCall.arguments[0] as string).includes('localhost:3000'),
        'Should open localhost:3000'
      );
    });

    it('should not open browser when --no-open flag is set', async () => {
      // AC: Opens browser (with --no-open flag to disable)
      await cyclistCommand({ noOpen: true }, { spawn: spawnMock as unknown as CyclistDeps['spawn'], open: openMock as unknown as CyclistDeps['open'] });

      assert.strictEqual(
        openMock.mock.calls.length,
        0,
        'open should not be called when noOpen is true'
      );
    });

    it('should use custom port when specified', async () => {
      // Additional feature: --port option
      await cyclistCommand({ port: 4000, noOpen: true }, { spawn: spawnMock as unknown as CyclistDeps['spawn'], open: openMock as unknown as CyclistDeps['open'] });

      const spawnCall = spawnMock.mock.calls[0];
      const spawnOptions = spawnCall.arguments[2] as SpawnOptions;

      assert.strictEqual(
        spawnOptions.env.PORT,
        '4000',
        'Should pass custom port to cyclist'
      );
    });

    it('should use cyclist path from --cyclist-path option', async () => {
      // Additional feature: --cyclist-path option
      const customPath = join(testDir, 'custom-cyclist');
      mkdirSync(join(customPath, 'dist'), { recursive: true });
      writeFileSync(join(customPath, 'package.json'), JSON.stringify({ name: 'cyclist' }));
      writeFileSync(join(customPath, 'dist', 'bikerack.js'), '// mock');

      await cyclistCommand(
        { cyclistPath: customPath, noOpen: true },
        { spawn: spawnMock as unknown as CyclistDeps['spawn'], open: openMock as unknown as CyclistDeps['open'] }
      );

      const spawnCall = spawnMock.mock.calls[0];
      const args = spawnCall.arguments[1] as string[];

      assert.ok(
        args[0].includes(customPath),
        'Should use custom cyclist path'
      );
    });
  });

  // CLI Registration test removed — `pf cyclist` is not a CLI subcommand
});
