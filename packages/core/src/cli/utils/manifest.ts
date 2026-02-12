import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import fsExtra from 'fs-extra';

const { ensureDirSync } = fsExtra;

export interface Manifest {
  version: string;
  installedAt: string;
  updatedAt: string;
  projectName: string;
  installationType: 'symlink' | 'copy';  // copy mode deprecated in v4.0.4
  nodeModulesPath?: string;
  managedPaths: string[];
  fileHashes: Record<string, string>;  // Legacy field from copy mode
  userModified?: string[];
  migrationSource?: string;
  migrationsRun?: string[];
}

const MANIFEST_PATH = '.pennyfarthing/manifest.json';
const LEGACY_MANIFEST_PATH = '.claude/manifest.json';

/**
 * Get the full path to the manifest file (new canonical location)
 */
export function getManifestPath(projectRoot: string): string {
  return join(projectRoot, MANIFEST_PATH);
}

/**
 * Check if a manifest exists (checks new location first, then legacy)
 */
export function manifestExists(projectRoot: string): boolean {
  return existsSync(join(projectRoot, MANIFEST_PATH))
    || existsSync(join(projectRoot, LEGACY_MANIFEST_PATH));
}

/**
 * Read the manifest file (.pennyfarthing/ takes precedence over legacy .claude/)
 */
export function readManifest(projectRoot: string): Manifest | null {
  const newPath = join(projectRoot, MANIFEST_PATH);
  const legacyPath = join(projectRoot, LEGACY_MANIFEST_PATH);

  // New location takes precedence
  const manifestPath = existsSync(newPath) ? newPath
    : existsSync(legacyPath) ? legacyPath
    : null;

  if (!manifestPath) {
    return null;
  }

  try {
    const content = readFileSync(manifestPath, 'utf8');
    return JSON.parse(content) as Manifest;
  } catch (error) {
    throw new Error(`Failed to read manifest: ${error}`);
  }
}

/**
 * Write the manifest file
 */
export function writeManifest(
  projectRoot: string,
  manifest: Manifest,
  options?: { dryRun?: boolean }
): void {
  if (options?.dryRun) {
    return;
  }

  const manifestPath = getManifestPath(projectRoot);
  ensureDirSync(join(projectRoot, '.pennyfarthing'));

  writeFileSync(
    manifestPath,
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8'
  );
}

/**
 * Create a new manifest
 * Note: copy mode was deprecated in v4.0.4 - all installs now use symlink mode
 */
export function createManifest(
  projectName: string,
  version: string,
  options: {
    nodeModulesPath?: string;
    migrationSource?: string;
  }
): Manifest {
  const now = new Date().toISOString();

  const managedPaths = [
    '.claude/commands',
    '.claude/skills',
    '.pennyfarthing/agents',
    '.pennyfarthing/guides',
    '.pennyfarthing/output-styles',
    '.pennyfarthing/personas',
    '.pennyfarthing/scripts',
    '.pennyfarthing/workflows'
  ];

  return {
    version,
    installedAt: now,
    updatedAt: now,
    projectName,
    installationType: 'symlink',
    ...(options.nodeModulesPath && { nodeModulesPath: options.nodeModulesPath }),
    managedPaths,
    fileHashes: {},
    ...(options.migrationSource && { migrationSource: options.migrationSource })
  };
}

/**
 * Update manifest after an update
 */
export function updateManifestForUpdate(
  manifest: Manifest,
  newVersion: string,
  newHashes: Record<string, string>,
  userModified?: string[]
): Manifest {
  return {
    ...manifest,
    version: newVersion,
    updatedAt: new Date().toISOString(),
    fileHashes: newHashes,
    ...(userModified && userModified.length > 0 && { userModified })
  };
}

/**
 * Get the installed version from manifest
 */
export function getInstalledVersion(projectRoot: string): string | null {
  const manifest = readManifest(projectRoot);
  return manifest?.version || null;
}
