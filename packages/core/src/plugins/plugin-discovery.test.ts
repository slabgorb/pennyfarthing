/**
 * Tests for Story 93-3: Plugin Discovery for Commands and Skills
 *
 * These tests define the contract for discovering and registering
 * commands, skills, and API routers from installed @pennyfarthing/* packages.
 *
 * The plugin system reads a "pennyfarthing" field from package.json of
 * installed @pennyfarthing/* packages (excluding core and shared).
 *
 * Test categories:
 * 1. discoverPlugins() - Scan node_modules for plugin packages
 * 2. parsePluginManifest() - Parse "pennyfarthing" field from package.json
 * 3. getPluginCommands() - Aggregate command paths from all plugins
 * 4. getPluginSkills() - Aggregate skill paths from all plugins
 * 5. getPluginRouters() - Aggregate API router entry points
 * 6. Graceful degradation - Missing packages, malformed manifests
 * 7. Integration - Init hooks for commands/skills from plugins
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import the plugin discovery functions (will be created by Dev)
import {
  discoverPlugins,
  parsePluginManifest,
  getPluginCommands,
  getPluginSkills,
  getPluginRouters,
  type PluginManifest,
  type DiscoveredPlugin
} from './plugin-discovery.js';

// Test fixture directory
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(__dirname, '__test_plugins__');

/**
 * Helper: Create a fake @pennyfarthing package in test node_modules
 */
function createFakePlugin(
  rootDir: string,
  packageName: string,
  manifest: Record<string, unknown>,
  options?: {
    commands?: string[];
    skills?: string[];
  }
): string {
  const pkgDir = join(rootDir, 'node_modules/@pennyfarthing', packageName);
  mkdirSync(pkgDir, { recursive: true });

  // Write package.json
  const packageJson = {
    name: `@pennyfarthing/${packageName}`,
    version: '1.0.0',
    ...manifest,
  };
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify(packageJson, null, 2));

  // Create command files if specified
  if (options?.commands) {
    const commandsDir = join(pkgDir, 'commands');
    mkdirSync(commandsDir, { recursive: true });
    for (const cmd of options.commands) {
      writeFileSync(
        join(commandsDir, `${cmd}.md`),
        `---\ndescription: "${cmd} command"\n---\n# ${cmd}\n`
      );
    }
  }

  // Create skill directories if specified
  if (options?.skills) {
    const skillsDir = join(pkgDir, 'skills');
    mkdirSync(skillsDir, { recursive: true });
    for (const skill of options.skills) {
      const skillDir = join(skillsDir, skill);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, 'skill.md'), `# ${skill}\n`);
    }
  }

  return pkgDir;
}

describe('Plugin Discovery (93-3)', () => {

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  // ================================================================
  // 1. discoverPlugins() - Scan node_modules for plugin packages
  // ================================================================

  describe('discoverPlugins()', () => {

    it('should discover packages with "pennyfarthing" field in package.json', () => {
      // AC: Generic plugin discovery mechanism
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: {
          commands: 'commands/',
          skills: 'skills/',
        }
      }, {
        commands: ['solo', 'benchmark'],
        skills: ['judge', 'finalize-run'],
      });

      const plugins = discoverPlugins(TEST_DIR);

      assert.strictEqual(plugins.length, 1, 'Should find one plugin');
      assert.strictEqual(plugins[0].name, '@pennyfarthing/benchmark');
    });

    it('should skip @pennyfarthing/core (not a plugin)', () => {
      // Core is the framework itself, not a plugin
      const coreDir = join(TEST_DIR, 'node_modules/@pennyfarthing/core');
      mkdirSync(coreDir, { recursive: true });
      writeFileSync(join(coreDir, 'package.json'), JSON.stringify({
        name: '@pennyfarthing/core',
        version: '10.0.0',
        pennyfarthing: { commands: 'commands/' }
      }));

      const plugins = discoverPlugins(TEST_DIR);

      assert.strictEqual(plugins.length, 0, 'Should skip core package');
    });

    it('should skip @pennyfarthing/shared (not a plugin)', () => {
      // Shared is a utility package, not a plugin
      const sharedDir = join(TEST_DIR, 'node_modules/@pennyfarthing/shared');
      mkdirSync(sharedDir, { recursive: true });
      writeFileSync(join(sharedDir, 'package.json'), JSON.stringify({
        name: '@pennyfarthing/shared',
        version: '10.0.0',
      }));

      const plugins = discoverPlugins(TEST_DIR);

      assert.strictEqual(plugins.length, 0, 'Should skip shared package');
    });

    it('should skip packages without "pennyfarthing" field', () => {
      // A @pennyfarthing/* package that is not a plugin (no pennyfarthing field)
      const pkgDir = join(TEST_DIR, 'node_modules/@pennyfarthing/some-lib');
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
        name: '@pennyfarthing/some-lib',
        version: '1.0.0',
      }));

      const plugins = discoverPlugins(TEST_DIR);

      assert.strictEqual(plugins.length, 0, 'Should skip package without pennyfarthing field');
    });

    it('should discover multiple plugins', () => {
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: { commands: 'commands/' }
      }, { commands: ['solo'] });

      createFakePlugin(TEST_DIR, 'analytics', {
        pennyfarthing: { skills: 'skills/' }
      }, { skills: ['dashboard'] });

      const plugins = discoverPlugins(TEST_DIR);

      assert.strictEqual(plugins.length, 2, 'Should find both plugins');
      const names = plugins.map(p => p.name).sort();
      assert.deepStrictEqual(names, [
        '@pennyfarthing/analytics',
        '@pennyfarthing/benchmark'
      ]);
    });

    it('should return empty array when no @pennyfarthing packages exist', () => {
      // node_modules exists but no @pennyfarthing/ scope
      mkdirSync(join(TEST_DIR, 'node_modules'), { recursive: true });

      const plugins = discoverPlugins(TEST_DIR);

      assert.deepStrictEqual(plugins, []);
    });

    it('should return empty array when node_modules does not exist', () => {
      // No node_modules at all — graceful degradation
      const emptyDir = join(TEST_DIR, 'empty-project');
      mkdirSync(emptyDir, { recursive: true });

      const plugins = discoverPlugins(emptyDir);

      assert.deepStrictEqual(plugins, []);
    });
  });

  // ================================================================
  // 2. parsePluginManifest() - Parse "pennyfarthing" field
  // ================================================================

  describe('parsePluginManifest()', () => {

    it('should parse commands path from manifest', () => {
      const pkgDir = createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: {
          commands: 'commands/',
        }
      }, { commands: ['solo', 'benchmark', 'benchmark-control', 'job-fair'] });

      const manifest = parsePluginManifest(pkgDir);

      assert.ok(manifest, 'Should return a manifest');
      assert.strictEqual(manifest!.commands, 'commands/');
    });

    it('should parse skills path from manifest', () => {
      const pkgDir = createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: {
          skills: 'skills/',
        }
      }, { skills: ['judge', 'finalize-run', 'persona-benchmark'] });

      const manifest = parsePluginManifest(pkgDir);

      assert.ok(manifest, 'Should return a manifest');
      assert.strictEqual(manifest!.skills, 'skills/');
    });

    it('should parse API router entry point from manifest', () => {
      // AC: Cyclist benchmark API router registers automatically
      const pkgDir = createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: {
          commands: 'commands/',
          skills: 'skills/',
          api: {
            path: '/api/benchmark',
            module: './dist/api/benchmark.js',
            export: 'createBenchmarkRouter',
          }
        }
      });

      const manifest = parsePluginManifest(pkgDir);

      assert.ok(manifest, 'Should return a manifest');
      assert.ok(manifest!.api, 'Should have API definition');
      assert.strictEqual(manifest!.api!.path, '/api/benchmark');
      assert.strictEqual(manifest!.api!.module, './dist/api/benchmark.js');
      assert.strictEqual(manifest!.api!.export, 'createBenchmarkRouter');
    });

    it('should parse manifest with all fields', () => {
      const pkgDir = createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: {
          commands: 'commands/',
          skills: 'skills/',
          api: {
            path: '/api/benchmark',
            module: './dist/api/benchmark.js',
            export: 'createBenchmarkRouter',
          }
        }
      });

      const manifest = parsePluginManifest(pkgDir);

      assert.ok(manifest);
      assert.strictEqual(manifest!.commands, 'commands/');
      assert.strictEqual(manifest!.skills, 'skills/');
      assert.ok(manifest!.api);
    });

    it('should return null for package without pennyfarthing field', () => {
      const pkgDir = join(TEST_DIR, 'node_modules/@pennyfarthing/no-plugin');
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
        name: '@pennyfarthing/no-plugin',
        version: '1.0.0',
      }));

      const manifest = parsePluginManifest(pkgDir);

      assert.strictEqual(manifest, null, 'Should return null for non-plugin');
    });

    it('should return null for malformed package.json', () => {
      // AC: System degrades gracefully when optional packages not installed
      const pkgDir = join(TEST_DIR, 'node_modules/@pennyfarthing/broken');
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(join(pkgDir, 'package.json'), 'not valid json{{{');

      const manifest = parsePluginManifest(pkgDir);

      assert.strictEqual(manifest, null, 'Should return null for malformed JSON');
    });

    it('should return null when package.json does not exist', () => {
      const pkgDir = join(TEST_DIR, 'node_modules/@pennyfarthing/no-pkg');
      mkdirSync(pkgDir, { recursive: true });
      // No package.json file

      const manifest = parsePluginManifest(pkgDir);

      assert.strictEqual(manifest, null, 'Should return null for missing package.json');
    });
  });

  // ================================================================
  // 3. getPluginCommands() - Aggregate command paths
  // ================================================================

  describe('getPluginCommands()', () => {

    it('should return command file paths from a plugin', () => {
      // AC: Benchmark commands available when @pennyfarthing/benchmark installed
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: { commands: 'commands/' }
      }, {
        commands: ['solo', 'benchmark', 'benchmark-control', 'job-fair']
      });

      const plugins = discoverPlugins(TEST_DIR);
      const commands = getPluginCommands(plugins);

      assert.strictEqual(commands.length, 4, 'Should find all 4 benchmark commands');

      // Verify paths point to actual .md files
      for (const cmd of commands) {
        assert.ok(cmd.path.endsWith('.md'), `Command path should end in .md: ${cmd.path}`);
        assert.ok(existsSync(cmd.path), `Command file should exist: ${cmd.path}`);
      }
    });

    it('should include plugin name in command metadata', () => {
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: { commands: 'commands/' }
      }, { commands: ['solo'] });

      const plugins = discoverPlugins(TEST_DIR);
      const commands = getPluginCommands(plugins);

      assert.strictEqual(commands.length, 1);
      assert.strictEqual(commands[0].plugin, '@pennyfarthing/benchmark');
      assert.strictEqual(commands[0].name, 'solo');
    });

    it('should aggregate commands from multiple plugins', () => {
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: { commands: 'commands/' }
      }, { commands: ['solo', 'benchmark'] });

      createFakePlugin(TEST_DIR, 'analytics', {
        pennyfarthing: { commands: 'commands/' }
      }, { commands: ['report'] });

      const plugins = discoverPlugins(TEST_DIR);
      const commands = getPluginCommands(plugins);

      assert.strictEqual(commands.length, 3, 'Should find commands from both plugins');
    });

    it('should return empty array for plugin with no commands field', () => {
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: { skills: 'skills/' }
      }, { skills: ['judge'] });

      const plugins = discoverPlugins(TEST_DIR);
      const commands = getPluginCommands(plugins);

      assert.deepStrictEqual(commands, []);
    });

    it('should skip commands directory that does not exist on disk', () => {
      // Plugin declares commands but directory is missing
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: { commands: 'commands/' }
      });
      // Note: no commands option — directory not created

      const plugins = discoverPlugins(TEST_DIR);
      const commands = getPluginCommands(plugins);

      assert.deepStrictEqual(commands, [], 'Should return empty when commands dir missing');
    });
  });

  // ================================================================
  // 4. getPluginSkills() - Aggregate skill paths
  // ================================================================

  describe('getPluginSkills()', () => {

    it('should return skill directory paths from a plugin', () => {
      // AC: Benchmark skills load when referenced
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: { skills: 'skills/' }
      }, {
        skills: ['judge', 'finalize-run', 'persona-benchmark']
      });

      const plugins = discoverPlugins(TEST_DIR);
      const skills = getPluginSkills(plugins);

      assert.strictEqual(skills.length, 3, 'Should find all 3 benchmark skills');

      // Verify paths point to actual directories
      for (const skill of skills) {
        assert.ok(existsSync(skill.path), `Skill dir should exist: ${skill.path}`);
      }
    });

    it('should include plugin name in skill metadata', () => {
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: { skills: 'skills/' }
      }, { skills: ['judge'] });

      const plugins = discoverPlugins(TEST_DIR);
      const skills = getPluginSkills(plugins);

      assert.strictEqual(skills.length, 1);
      assert.strictEqual(skills[0].plugin, '@pennyfarthing/benchmark');
      assert.strictEqual(skills[0].name, 'judge');
    });

    it('should aggregate skills from multiple plugins', () => {
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: { skills: 'skills/' }
      }, { skills: ['judge', 'finalize-run'] });

      createFakePlugin(TEST_DIR, 'analytics', {
        pennyfarthing: { skills: 'skills/' }
      }, { skills: ['dashboard'] });

      const plugins = discoverPlugins(TEST_DIR);
      const skills = getPluginSkills(plugins);

      assert.strictEqual(skills.length, 3, 'Should find skills from both plugins');
    });

    it('should return empty array for plugin with no skills field', () => {
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: { commands: 'commands/' }
      }, { commands: ['solo'] });

      const plugins = discoverPlugins(TEST_DIR);
      const skills = getPluginSkills(plugins);

      assert.deepStrictEqual(skills, []);
    });

    it('should skip hidden directories in skills path', () => {
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: { skills: 'skills/' }
      }, { skills: ['judge'] });

      // Add a hidden directory that should be ignored
      const hiddenDir = join(
        TEST_DIR, 'node_modules/@pennyfarthing/benchmark/skills/.hidden'
      );
      mkdirSync(hiddenDir, { recursive: true });

      const plugins = discoverPlugins(TEST_DIR);
      const skills = getPluginSkills(plugins);

      assert.strictEqual(skills.length, 1, 'Should skip hidden directories');
      assert.strictEqual(skills[0].name, 'judge');
    });
  });

  // ================================================================
  // 5. getPluginRouters() - Aggregate API router entry points
  // ================================================================

  describe('getPluginRouters()', () => {

    it('should return API router definitions from plugins', () => {
      // AC: Cyclist benchmark API router registers automatically
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: {
          api: {
            path: '/api/benchmark',
            module: './dist/api/benchmark.js',
            export: 'createBenchmarkRouter',
          }
        }
      });

      const plugins = discoverPlugins(TEST_DIR);
      const routers = getPluginRouters(plugins);

      assert.strictEqual(routers.length, 1);
      assert.strictEqual(routers[0].mountPath, '/api/benchmark');
      assert.strictEqual(routers[0].plugin, '@pennyfarthing/benchmark');
      assert.ok(routers[0].modulePath, 'Should have module path');
      assert.strictEqual(routers[0].exportName, 'createBenchmarkRouter');
    });

    it('should return empty array for plugins without api field', () => {
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: { commands: 'commands/' }
      });

      const plugins = discoverPlugins(TEST_DIR);
      const routers = getPluginRouters(plugins);

      assert.deepStrictEqual(routers, []);
    });

    it('should aggregate routers from multiple plugins', () => {
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: {
          api: {
            path: '/api/benchmark',
            module: './dist/api/benchmark.js',
            export: 'createBenchmarkRouter',
          }
        }
      });

      createFakePlugin(TEST_DIR, 'analytics', {
        pennyfarthing: {
          api: {
            path: '/api/analytics',
            module: './dist/api/analytics.js',
            export: 'createAnalyticsRouter',
          }
        }
      });

      const plugins = discoverPlugins(TEST_DIR);
      const routers = getPluginRouters(plugins);

      assert.strictEqual(routers.length, 2);
      const paths = routers.map(r => r.mountPath).sort();
      assert.deepStrictEqual(paths, ['/api/analytics', '/api/benchmark']);
    });
  });

  // ================================================================
  // 6. Graceful degradation
  // ================================================================

  describe('Graceful degradation', () => {

    it('should handle missing node_modules/@pennyfarthing directory', () => {
      // AC: System degrades gracefully when optional packages not installed
      const emptyProject = join(TEST_DIR, 'no-plugins');
      mkdirSync(join(emptyProject, 'node_modules'), { recursive: true });

      const plugins = discoverPlugins(emptyProject);

      assert.deepStrictEqual(plugins, []);
    });

    it('should skip plugin with unreadable package.json', () => {
      // Create a valid plugin and a broken one
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: { commands: 'commands/' }
      }, { commands: ['solo'] });

      const brokenDir = join(TEST_DIR, 'node_modules/@pennyfarthing/broken');
      mkdirSync(brokenDir, { recursive: true });
      writeFileSync(join(brokenDir, 'package.json'), '{{invalid json!!');

      const plugins = discoverPlugins(TEST_DIR);

      // Should find benchmark but skip broken
      assert.strictEqual(plugins.length, 1);
      assert.strictEqual(plugins[0].name, '@pennyfarthing/benchmark');
    });

    it('should handle plugin declaring commands path that does not exist', () => {
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: { commands: 'nonexistent-commands/' }
      });

      const plugins = discoverPlugins(TEST_DIR);
      const commands = getPluginCommands(plugins);

      assert.deepStrictEqual(commands, [], 'Should return empty for missing commands dir');
    });

    it('should handle plugin declaring skills path that does not exist', () => {
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: { skills: 'nonexistent-skills/' }
      });

      const plugins = discoverPlugins(TEST_DIR);
      const skills = getPluginSkills(plugins);

      assert.deepStrictEqual(skills, [], 'Should return empty for missing skills dir');
    });
  });

  // ================================================================
  // 7. DiscoveredPlugin type contract
  // ================================================================

  describe('DiscoveredPlugin type contract', () => {

    it('should include package name, path, and manifest in DiscoveredPlugin', () => {
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: {
          commands: 'commands/',
          skills: 'skills/',
        }
      }, {
        commands: ['solo'],
        skills: ['judge'],
      });

      const plugins = discoverPlugins(TEST_DIR);

      assert.strictEqual(plugins.length, 1);
      const plugin = plugins[0];

      // Type contract
      assert.strictEqual(typeof plugin.name, 'string');
      assert.strictEqual(typeof plugin.path, 'string');
      assert.ok(plugin.manifest, 'Should have manifest');
      assert.strictEqual(typeof plugin.manifest.commands, 'string');
      assert.strictEqual(typeof plugin.manifest.skills, 'string');
    });

    it('should resolve absolute path for plugin directory', () => {
      createFakePlugin(TEST_DIR, 'benchmark', {
        pennyfarthing: { commands: 'commands/' }
      });

      const plugins = discoverPlugins(TEST_DIR);

      assert.ok(
        plugins[0].path.startsWith('/'),
        'Plugin path should be absolute'
      );
    });
  });
});
