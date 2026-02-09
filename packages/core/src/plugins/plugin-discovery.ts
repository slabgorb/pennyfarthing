/**
 * Plugin Discovery for Commands and Skills from Installed Packages
 *
 * Story 93-3: Implement mechanism for @pennyfarthing/core to discover and register
 * commands and skills from optional installed packages.
 *
 * STUB: All functions throw — implementation needed by Dev.
 */

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
 * Discover installed @pennyfarthing/* plugin packages.
 *
 * Scans node_modules/@pennyfarthing/ for packages that have a "pennyfarthing"
 * field in their package.json. Skips core and shared packages.
 *
 * @param projectRoot - Absolute path to project root
 * @returns Array of discovered plugins
 */
export function discoverPlugins(_projectRoot: string): DiscoveredPlugin[] {
  throw new Error('discoverPlugins not implemented');
}

/**
 * Parse the "pennyfarthing" field from a package's package.json.
 *
 * @param packageDir - Absolute path to the package directory
 * @returns Parsed manifest, or null if not a plugin
 */
export function parsePluginManifest(_packageDir: string): PluginManifest | null {
  throw new Error('parsePluginManifest not implemented');
}

/**
 * Get all command file paths from discovered plugins.
 *
 * Scans each plugin's declared commands directory for .md files.
 *
 * @param plugins - Array of discovered plugins
 * @returns Array of command metadata with paths
 */
export function getPluginCommands(_plugins: DiscoveredPlugin[]): PluginCommand[] {
  throw new Error('getPluginCommands not implemented');
}

/**
 * Get all skill directory paths from discovered plugins.
 *
 * Scans each plugin's declared skills directory for subdirectories.
 *
 * @param plugins - Array of discovered plugins
 * @returns Array of skill metadata with paths
 */
export function getPluginSkills(_plugins: DiscoveredPlugin[]): PluginSkill[] {
  throw new Error('getPluginSkills not implemented');
}

/**
 * Get all API router entry points from discovered plugins.
 *
 * Reads API router definitions from each plugin's manifest.
 *
 * @param plugins - Array of discovered plugins
 * @returns Array of router metadata
 */
export function getPluginRouters(_plugins: DiscoveredPlugin[]): PluginRouter[] {
  throw new Error('getPluginRouters not implemented');
}
