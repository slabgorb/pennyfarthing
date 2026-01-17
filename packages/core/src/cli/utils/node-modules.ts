import { join, dirname } from 'path';
import { pathExists } from './files.js';

/**
 * Find pennyfarthing in node_modules (handles monorepo hoisting)
 * Returns the absolute path to pennyfarthing-dist/ or null if not found
 */
export function findNodeModulesPath(projectRoot: string): string | null {
  // Package locations to check (in priority order)
  const packagePaths = [
    '@pennyfarthing/core/pennyfarthing-dist',  // Scoped package (current)
    'pennyfarthing/pennyfarthing-dist',         // Legacy unscoped package
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
