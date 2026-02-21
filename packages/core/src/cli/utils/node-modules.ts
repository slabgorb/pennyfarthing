import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import YAML from 'yaml';
import { pathExists } from './files.js';

/**
 * Find pennyfarthing in node_modules (handles monorepo hoisting)
 * Returns the absolute path to pennyfarthing-dist/ or null if not found
 */
export function findNodeModulesPath(projectRoot: string): string | null {
  // Package locations to check (in priority order)
  const packagePaths = [
    '@pennyfarthing/core/pennyfarthing-dist',  // Scoped package (current)
    'pennyfarthing/pennyfarthing-dist',         // Legacy unscoped (symlink from init)
    'pennyfarthing-monorepo/pennyfarthing-dist', // GitHub dependency (npm alias)
  ];

  // Check standard location first
  for (const pkgPath of packagePaths) {
    const standard = join(projectRoot, 'node_modules', pkgPath);
    if (pathExists(standard)) return standard;
  }

  // Check hoisted locations (monorepo)
  let dir = dirname(projectRoot);
  while (dir !== '/' && dir !== dirname(dir)) {
    for (const pkgPath of packagePaths) {
      const hoisted = join(dir, 'node_modules', pkgPath);
      if (pathExists(hoisted)) return hoisted;
    }
    dir = dirname(dir);
  }

  return null;
}

/**
 * Read .pennyfarthing/repos.yaml and extract local symlink targets.
 * Returns a Map of link path (e.g. '.pennyfarthing/agents') to the
 * resolved absolute source path, or null if no repos.yaml or no
 * symlinks are declared.
 */
export function findLocalSymlinkTargets(projectRoot: string): Map<string, string> | null {
  const candidates = [
    join(projectRoot, '.pennyfarthing', 'repos.yaml'),
    join(projectRoot, 'repos.yaml'),
  ];
  const configPath = candidates.find(p => pathExists(p));

  if (!configPath) return null;

  try {
    const content = readFileSync(configPath, 'utf8');
    const config = YAML.parse(content);

    if (!config?.repos || typeof config.repos !== 'object') return null;

    const targets = new Map<string, string>();

    for (const repoConfig of Object.values(config.repos)) {
      const rc = repoConfig as Record<string, unknown> | null;
      const symlinks = rc?.symlinks as Record<string, string> | undefined;
      if (!symlinks || typeof symlinks !== 'object') continue;

      for (const [linkPath, sourcePath] of Object.entries(symlinks)) {
        if (sourcePath && typeof sourcePath === 'string') {
          targets.set(linkPath, join(projectRoot, sourcePath));
        }
      }
    }

    return targets.size > 0 ? targets : null;
  } catch {
    return null;
  }
}
