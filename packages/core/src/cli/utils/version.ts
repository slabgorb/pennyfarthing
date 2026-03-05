import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the package version from VERSION file or package.json
 */
export function getPackageVersion(): string {
  // Try VERSION file first (relative to compiled output location)
  const versionPaths = [
    join(__dirname, '../../../VERSION'),  // From dist/cli/utils/
    join(__dirname, '../../VERSION'),      // Fallback
    join(process.cwd(), 'VERSION')         // If running from package root
  ];

  for (const versionPath of versionPaths) {
    if (existsSync(versionPath)) {
      try {
        return readFileSync(versionPath, 'utf8').trim();
      } catch {
        continue;
      }
    }
  }

  // Fallback to package.json
  const packagePaths = [
    join(__dirname, '../../../../../package.json'),  // From packages/core/dist/cli/utils/ in npm install
    join(__dirname, '../../../package.json'),        // From dist/cli/utils/ in local dev
    join(__dirname, '../../package.json')
  ];

  for (const packagePath of packagePaths) {
    if (existsSync(packagePath)) {
      try {
        const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
        return pkg.version;
      } catch {
        continue;
      }
    }
  }

  return '0.0.0';
}

/**
 * Get the distributable package directory path
 * This contains all files that get installed to target projects
 */
export function getAssetsPath(): { success: boolean; data?: string; error?: string } {
  const searchPaths = [
    join(__dirname, '../../../../../pennyfarthing-dist'),  // From packages/core/dist/cli/utils/ to package root
    join(__dirname, '../../../../pennyfarthing-dist'),
    join(__dirname, '../../../pennyfarthing-dist'),
    join(__dirname, '../../pennyfarthing-dist'),
    join(process.cwd(), 'pennyfarthing-dist')
  ];

  for (const searchPath of searchPaths) {
    if (existsSync(searchPath)) {
      return { success: true, data: searchPath };
    }
  }

  return { success: false, error: 'Package directory not found (looked for pennyfarthing-dist/)' };
}
