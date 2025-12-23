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
    join(__dirname, '../../../package.json'),
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
 * Get the assets directory path
 */
export function getAssetsPath(): string {
  const assetsPaths = [
    join(__dirname, '../../../assets'),
    join(__dirname, '../../assets'),
    join(process.cwd(), 'assets')
  ];

  for (const assetsPath of assetsPaths) {
    if (existsSync(assetsPath)) {
      return assetsPath;
    }
  }

  throw new Error('Assets directory not found');
}
