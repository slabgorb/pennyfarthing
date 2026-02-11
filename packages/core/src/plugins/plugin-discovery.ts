/**
 * Plugin Discovery for Commands and Skills from Installed Packages
 *
 * Story 93-3: Discover and register commands, skills, and API routers
 * from installed @pennyfarthing/* packages via their package.json
 * "pennyfarthing" field.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Packages that are part of the framework, not plugins */
const EXCLUDED_PACKAGES = ['core', 'shared'];

/**
 * Manifest shape declared in a plugin's package.json under the "pennyfarthing" field.
 */
export interface PluginManifest {
  /** Relative path to commands directory (e.g., "commands/") */
  commands?: string;
  /** Relative path to skills directory (e.g., "skills/") */
  skills?: string;
  /** API router entry point for Cyclist */
  api?: {
    /** Express mount path (e.g., "/api/benchmark") */
    path: string;
    /** Module path relative to package root (e.g., "./dist/api/benchmark.js") */
    module: string;
    /** Named export that creates the router (e.g., "createBenchmarkRouter") */
    export: string;
  };
}

/**
 * A discovered plugin package with its parsed manifest.
 */
export interface DiscoveredPlugin {
  /** Full package name (e.g., "@pennyfarthing/benchmark") */
  name: string;
  /** Absolute path to the package directory */
  path: string;
  /** Parsed pennyfarthing manifest from package.json */
  manifest: PluginManifest;
}

/**
 * A command file discovered from a plugin.
 */
export interface PluginCommand {
  /** Command name (filename without .md extension) */
  name: string;
  /** Absolute path to the command .md file */
  path: string;
  /** Plugin that provides this command */
  plugin: string;
}

/**
 * A skill directory discovered from a plugin.
 */
export interface PluginSkill {
  /** Skill name (directory name) */
  name: string;
  /** Absolute path to the skill directory */
  path: string;
  /** Plugin that provides this skill */
  plugin: string;
}

/**
 * An API router entry point discovered from a plugin.
 */
export interface PluginRouter {
  /** Express mount path (e.g., "/api/benchmark") */
  mountPath: string;
  /** Absolute path to the module file */
  modulePath: string;
  /** Named export that creates the router */
  exportName: string;
  /** Plugin that provides this router */
  plugin: string;
}

/**
 * Parse the "pennyfarthing" field from a package's package.json.
 *
 * @param packageDir - Absolute path to the package directory
 * @returns Parsed manifest, or null if not a plugin
 */
export function parsePluginManifest(packageDir: string): PluginManifest | null {
  const pkgJsonPath = join(packageDir, 'package.json');

  if (!existsSync(pkgJsonPath)) {
    return null;
  }

  try {
    const raw = readFileSync(pkgJsonPath, 'utf-8');
    const pkg = JSON.parse(raw);

    if (!pkg.pennyfarthing || typeof pkg.pennyfarthing !== 'object') {
      return null;
    }

    return pkg.pennyfarthing as PluginManifest;
  } catch {
    return null;
  }
}

/**
 * Discover installed @pennyfarthing/* plugin packages.
 *
 * Scans node_modules/@pennyfarthing/ for packages that have a "pennyfarthing"
 * field in their package.json. Skips core and shared packages.
 *
 * @param projectRoot - Absolute path to project root
 * @returns Array of discovered plugins
 */
export function discoverPlugins(projectRoot: string): DiscoveredPlugin[] {
  const scopeDir = join(projectRoot, 'node_modules/@pennyfarthing');

  if (!existsSync(scopeDir)) {
    return [];
  }

  let entries: string[];
  try {
    entries = readdirSync(scopeDir);
  } catch {
    return [];
  }

  const plugins: DiscoveredPlugin[] = [];

  for (const entry of entries) {
    if (EXCLUDED_PACKAGES.includes(entry)) {
      continue;
    }

    const pkgDir = resolve(join(scopeDir, entry));
    const manifest = parsePluginManifest(pkgDir);

    if (manifest) {
      plugins.push({
        name: `@pennyfarthing/${entry}`,
        path: pkgDir,
        manifest,
      });
    }
  }

  return plugins;
}

/**
 * Get all command file paths from discovered plugins.
 *
 * Scans each plugin's declared commands directory for .md files.
 *
 * @param plugins - Array of discovered plugins
 * @returns Array of command metadata with paths
 */
export function getPluginCommands(plugins: DiscoveredPlugin[]): PluginCommand[] {
  const commands: PluginCommand[] = [];

  for (const plugin of plugins) {
    if (!plugin.manifest.commands) {
      continue;
    }

    const commandsDir = join(plugin.path, plugin.manifest.commands);

    if (!existsSync(commandsDir)) {
      continue;
    }

    const files = readdirSync(commandsDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      commands.push({
        name: file.replace(/\.md$/, ''),
        path: join(commandsDir, file),
        plugin: plugin.name,
      });
    }
  }

  return commands;
}

/**
 * Get all skill directory paths from discovered plugins.
 *
 * Scans each plugin's declared skills directory for subdirectories.
 *
 * @param plugins - Array of discovered plugins
 * @returns Array of skill metadata with paths
 */
export function getPluginSkills(plugins: DiscoveredPlugin[]): PluginSkill[] {
  const skills: PluginSkill[] = [];

  for (const plugin of plugins) {
    if (!plugin.manifest.skills) {
      continue;
    }

    const skillsDir = join(plugin.path, plugin.manifest.skills);

    if (!existsSync(skillsDir)) {
      continue;
    }

    const entries = readdirSync(skillsDir).filter(f => {
      if (f.startsWith('.')) return false;
      const fullPath = join(skillsDir, f);
      try {
        return statSync(fullPath).isDirectory();
      } catch {
        return false;
      }
    });

    for (const entry of entries) {
      skills.push({
        name: entry,
        path: join(skillsDir, entry),
        plugin: plugin.name,
      });
    }
  }

  return skills;
}

/**
 * Get all API router entry points from discovered plugins.
 *
 * Reads API router definitions from each plugin's manifest.
 *
 * @param plugins - Array of discovered plugins
 * @returns Array of router metadata
 */
export function getPluginRouters(plugins: DiscoveredPlugin[]): PluginRouter[] {
  const routers: PluginRouter[] = [];

  for (const plugin of plugins) {
    if (!plugin.manifest.api) {
      continue;
    }

    const api = plugin.manifest.api;
    routers.push({
      mountPath: api.path,
      modulePath: join(plugin.path, api.module),
      exportName: api.export,
      plugin: plugin.name,
    });
  }

  return routers;
}
